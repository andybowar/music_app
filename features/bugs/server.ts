'use server';

/**
 * Bug reports (ADM-08; contracts/api.md; REQ-ADM-03).
 *
 * Any approved user (`bug:report`):
 *   - `createBugReport` files a report (≤ BUG_REPORTS_PER_HOUR per user per hour, else
 *     `RATE_LIMITED`), records the deployment's commit SHA and emails the admins (a failed
 *     email never fails the report).
 *   - `listMyBugReports` and `getBugReport` are read helpers: they throw rather than return an
 *     `ActionResult`, like the other read helpers. `getBugReport` returns null for a report
 *     the user may not see, so pages can 404.
 *   - Screenshots use ADM-06's signed-upload flow and helpers (features/admin/backlog/storage):
 *     `createBugImageUpload` → browser PUT → `finalizeBugImage`. Only the report's creator,
 *     within 24 hours of filing it, up to MAX_IMAGES_PER_BUG.
 *
 * Admins (`bug:triage`): `listBugReports`, `updateBugReport` (status, note to the reporter),
 * `deleteBugReport` (also removes the stored images) and `deleteBugImage`.
 *
 * Every action runs requireUser → assertCan → Zod → work, matching RLS in 0008_bug_reports.sql.
 */

import 'server-only';

import { and, asc, count, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';

import { bugReportImages, bugReports, users } from '@/db/schema';
import {
  bugFolder,
  bugImagePath,
  createUploadUrl,
  decodePendingId,
  encodePendingId,
  listFolderObjects,
  objectInfo,
  PENDING_TTL_MS,
  readObjectHead,
  removeObjects,
  signedReadUrls,
  sniffImage,
} from '@/features/admin/backlog/storage';
import { ActionError, withAction } from '@/lib/action';
import { requireUser } from '@/lib/auth';
import { db, withTx, type DB, type Tx } from '@/lib/db';
import { can, assertCan } from '@/lib/permissions';
import type { AppUser, UUID } from '@/types/domain';

import { notifyBugReported } from './notify';
import {
  BUG_REPORTS_PER_HOUR,
  bugImageUploadSchema,
  bugReportInputSchema,
  bugReportPatchSchema,
  listBugReportsSchema,
  MAX_IMAGES_PER_BUG,
  isOverHourlyLimit,
  OPEN_BUG_STATUSES,
  withinImageWindow,
  type BugImageUploadTicket,
  type BugReport,
  type BugReportDetail,
  type BugReportImage,
  type BugReportInput,
  type BugReportPatch,
  type BugReportStatus,
  type ImageMimeType,
  type ImageUploadInput,
} from './types';

const uuid = z.uuid();

const REPORT_NOT_FOUND = 'That bug report no longer exists.';
const IMAGE_NOT_FOUND = 'That image no longer exists.';
const UPLOAD_NOT_FOUND = 'That upload has expired. Please try again.';
const LIMIT_REACHED = `A bug report can have at most ${MAX_IMAGES_PER_BUG} screenshots.`;
const WINDOW_CLOSED = 'Screenshots can only be added within 24 hours of sending the report.';
const RATE_LIMITED = `You've sent ${BUG_REPORTS_PER_HOUR} bug reports in the last hour. Please wait a little before sending another.`;

const HOUR_MS = 60 * 60 * 1000;

async function requireReporter(): Promise<AppUser> {
  const user = await requireUser();
  assertCan(user, 'bug:report');
  return user;
}

async function requireTriager(): Promise<AppUser> {
  const user = await requireUser();
  assertCan(user, 'bug:triage');
  return user;
}

/** The deployment's commit SHA, or null outside Vercel. */
function appVersion(): string | null {
  return process.env.VERCEL_GIT_COMMIT_SHA?.trim() || null;
}

// ---------- Reports ----------

const imageCount = sql<number>`(
  select count(*)::int from ${bugReportImages}
  where ${bugReportImages.reportId} = ${bugReports.id}
)`;

const reportColumns = {
  id: bugReports.id,
  title: bugReports.title,
  description: bugReports.description,
  expected: bugReports.expected,
  pagePath: bugReports.pagePath,
  userAgent: bugReports.userAgent,
  viewport: bugReports.viewport,
  appVersion: bugReports.appVersion,
  status: bugReports.status,
  adminNote: bugReports.adminNote,
  createdBy: bugReports.createdBy,
  createdByName: users.name,
  createdAt: bugReports.createdAt,
  updatedAt: bugReports.updatedAt,
  imageCount: imageCount.mapWith(Number),
};

type ReportRow = typeof bugReports.$inferSelect & {
  createdByName: string | null;
  imageCount: number;
};

function toReport(row: ReportRow): BugReport {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function selectReports(
  conn: DB | Tx,
  where?: ReturnType<typeof eq>,
  limit?: number,
): Promise<BugReport[]> {
  const query = conn
    .select(reportColumns)
    .from(bugReports)
    .leftJoin(users, eq(users.id, bugReports.createdBy))
    .where(where)
    .orderBy(desc(bugReports.createdAt), desc(bugReports.id));
  const rows = limit === undefined ? await query : await query.limit(limit);
  return rows.map(toReport);
}

async function reportById(conn: DB | Tx, id: string): Promise<BugReport> {
  const [report] = await selectReports(conn, eq(bugReports.id, id));
  if (!report) throw new ActionError('NOT_FOUND', REPORT_NOT_FOUND);
  return report;
}

/** File a bug report. Emails the admins afterwards; a failed email doesn't fail the report. */
export const createBugReport = withAction(async (input: BugReportInput): Promise<BugReport> => {
  const user = await requireReporter();
  const data = bugReportInputSchema.parse(input);

  const report = await withTx(async (tx) => {
    // One user's reports are counted and inserted one at a time, so the limit holds.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`bug_reports:${user.id}`}))`);
    const [recent] = await tx
      .select({ n: count() })
      .from(bugReports)
      .where(
        and(
          eq(bugReports.createdBy, user.id),
          gte(bugReports.createdAt, new Date(Date.now() - HOUR_MS)),
        ),
      );
    if (isOverHourlyLimit(recent?.n ?? 0)) throw new ActionError('RATE_LIMITED', RATE_LIMITED);

    const [row] = await tx
      .insert(bugReports)
      .values({
        title: data.title,
        description: data.description,
        expected: data.expected ?? null,
        pagePath: data.pagePath ?? null,
        userAgent: data.userAgent ?? null,
        viewport: data.viewport ?? null,
        appVersion: appVersion(),
        createdBy: user.id,
      })
      .returning({ id: bugReports.id });
    return reportById(tx, row!.id);
  });

  await notifyBugReported({
    id: report.id,
    title: report.title,
    pagePath: report.pagePath,
    reporter: { id: user.id, name: user.name, email: user.email },
  });
  return report;
});

/** Read helper: the current user's own reports, newest first. Throws on failure. */
export async function listMyBugReports(): Promise<BugReport[]> {
  const user = await requireReporter();
  return selectReports(db, eq(bugReports.createdBy, user.id));
}

/** Read helper (bug:triage): every report newest first, optionally one status only. */
export async function listBugReports(filter?: { status?: BugReportStatus }): Promise<BugReport[]> {
  await requireTriager();
  const data = listBugReportsSchema.parse(filter);
  return selectReports(db, data?.status ? eq(bugReports.status, data.status) : undefined);
}

/** Read helper (bug:triage): the newest open (new or confirmed) reports and how many are open. */
export async function listOpenBugReports(
  limit: number,
): Promise<{ reports: BugReport[]; total: number }> {
  await requireTriager();
  const open = inArray(bugReports.status, [...OPEN_BUG_STATUSES]);
  const [reports, [total]] = await Promise.all([
    selectReports(db, open, z.number().int().min(1).max(50).parse(limit)),
    db.select({ n: count() }).from(bugReports).where(open),
  ]);
  return { reports, total: total?.n ?? 0 };
}

/**
 * Read helper: one report with its images and short-lived signed URLs. Null when it doesn't
 * exist or belongs to someone else and the user lacks `bug:triage`.
 */
export async function getBugReport(id: UUID): Promise<BugReportDetail | null> {
  const user = await requireReporter();
  const parsed = uuid.safeParse(id);
  if (!parsed.success) return null;

  const [report] = await selectReports(db, eq(bugReports.id, parsed.data));
  if (!report) return null;
  if (report.createdBy !== user.id && !can(user, 'bug:triage')) return null;

  const rows = await db
    .select()
    .from(bugReportImages)
    .where(eq(bugReportImages.reportId, report.id))
    .orderBy(asc(bugReportImages.createdAt), asc(bugReportImages.id));
  const urls = await signedReadUrls(rows.map((r) => r.storagePath));
  const images = rows.map((r) => toImage(r, urls.get(r.storagePath) ?? ''));
  return { ...report, imageCount: images.length, images };
}

/** Triage: set the status and/or the note shown to the reporter. */
export const updateBugReport = withAction(
  async (id: UUID, patch: BugReportPatch): Promise<BugReport> => {
    await requireTriager();
    const reportId = uuid.parse(id);
    const data = bugReportPatchSchema.parse(patch);

    return withTx(async (tx) => {
      if (Object.keys(data).length > 0) {
        const updated = await tx
          .update(bugReports)
          .set(data)
          .where(eq(bugReports.id, reportId))
          .returning({ id: bugReports.id });
        if (updated.length === 0) throw new ActionError('NOT_FOUND', REPORT_NOT_FOUND);
      }
      return reportById(tx, reportId);
    });
  },
);

/** Delete a report: its stored objects (finalized or not) first, then the row (images cascade). */
export const deleteBugReport = withAction(async (id: UUID): Promise<void> => {
  await requireTriager();
  const reportId = uuid.parse(id);

  await withTx(async (tx) => {
    const [row] = await tx
      .select({ id: bugReports.id })
      .from(bugReports)
      .where(eq(bugReports.id, reportId))
      .for('update');
    if (!row) throw new ActionError('NOT_FOUND', REPORT_NOT_FOUND);

    const images = await tx
      .select({ path: bugReportImages.storagePath })
      .from(bugReportImages)
      .where(eq(bugReportImages.reportId, reportId));
    const stray = await listFolderObjects(bugFolder(reportId));
    await removeObjects([...new Set([...images.map((i) => i.path), ...stray])]);
    await tx.delete(bugReports).where(eq(bugReports.id, reportId));
  });
});

// ---------- Images ----------

async function imagesOf(conn: DB | Tx, reportId: string): Promise<number> {
  const [row] = await conn
    .select({ n: count() })
    .from(bugReportImages)
    .where(eq(bugReportImages.reportId, reportId));
  return row?.n ?? 0;
}

/** The report, when `user` filed it; NOT_FOUND otherwise (others' reports aren't revealed). */
async function ownReport(conn: DB | Tx, reportId: string, user: AppUser, lock = false) {
  const query = conn
    .select({ id: bugReports.id, createdBy: bugReports.createdBy, createdAt: bugReports.createdAt })
    .from(bugReports)
    .where(eq(bugReports.id, reportId));
  const [report] = lock ? await query.for('update') : await query;
  if (!report || report.createdBy !== user.id) throw new ActionError('NOT_FOUND', REPORT_NOT_FOUND);
  return report;
}

/** Start a screenshot upload: returns where to PUT the file and the pending id to finalize. */
export const createBugImageUpload = withAction(
  async (reportId: UUID, input: ImageUploadInput): Promise<BugImageUploadTicket> => {
    const user = await requireReporter();
    const id = uuid.parse(reportId);
    const data = bugImageUploadSchema.parse(input);

    const report = await ownReport(db, id, user);
    if (!withinImageWindow(report.createdAt)) {
      throw new ActionError('FORBIDDEN', WINDOW_CLOSED);
    }
    if ((await imagesOf(db, id)) >= MAX_IMAGES_PER_BUG) {
      throw new ActionError('VALIDATION', LIMIT_REACHED, { images: [LIMIT_REACHED] });
    }

    const imageId = crypto.randomUUID();
    const uploadUrl = await createUploadUrl(bugImagePath(id, imageId, data.mimeType));
    const pendingId = encodePendingId({
      imageId,
      requestId: id,
      fileName: data.fileName,
      mimeType: data.mimeType,
      sizeBytes: data.sizeBytes,
      userId: user.id,
      expiresAt: Date.now() + PENDING_TTL_MS,
    });
    return { pendingId, uploadUrl };
  },
);

/** Verify the uploaded object and save its row. Idempotent for an already-saved image. */
export const finalizeBugImage = withAction(async (pendingId: string): Promise<BugReportImage> => {
  const user = await requireReporter();
  const pending = decodePendingId(z.string().max(2048).parse(pendingId));
  if (!pending || pending.userId !== user.id) throw new ActionError('NOT_FOUND', UPLOAD_NOT_FOUND);
  const reportId = pending.requestId;
  const path = bugImagePath(reportId, pending.imageId, pending.mimeType);

  const outcome = await withTx(async (tx): Promise<BugReportImage | { rejected: string }> => {
    // Locks the report row: serializes finalizes of one report, so the limit holds.
    const report = await ownReport(tx, reportId, user, true);

    const [existing] = await tx
      .select()
      .from(bugReportImages)
      .where(eq(bugReportImages.id, pending.imageId));
    if (existing) return toImage(existing, '');

    if (!withinImageWindow(report.createdAt)) {
      await removeObjects([path]);
      throw new ActionError('FORBIDDEN', WINDOW_CLOSED);
    }

    const object = await objectInfo(path);
    if (!object) throw new ActionError('VALIDATION', 'The image has not finished uploading.');

    let reason: string | null = null;
    if (object.size !== pending.sizeBytes) {
      reason = 'The uploaded image does not match the selected file. Please try again.';
    } else if (!sniffImage(await readObjectHead(path), pending.mimeType)) {
      reason = 'That file is not a valid PNG, JPEG, WebP or GIF image.';
    } else if ((await imagesOf(tx, reportId)) >= MAX_IMAGES_PER_BUG) {
      reason = LIMIT_REACHED;
    }
    if (reason) {
      await removeObjects([path]);
      return { rejected: reason };
    }

    const [row] = await tx
      .insert(bugReportImages)
      .values({
        id: pending.imageId,
        reportId,
        storagePath: path,
        fileName: pending.fileName,
        mimeType: pending.mimeType,
        sizeBytes: object.size,
        createdBy: user.id,
      })
      .returning();
    return toImage(row!, '');
  });

  if ('rejected' in outcome) {
    throw new ActionError('VALIDATION', outcome.rejected, { file: [outcome.rejected] });
  }
  const urls = await signedReadUrls([path]);
  return { ...outcome, url: urls.get(path) ?? '' };
});

function toImage(row: typeof bugReportImages.$inferSelect, url: string): BugReportImage {
  return {
    id: row.id,
    reportId: row.reportId,
    fileName: row.fileName,
    mimeType: row.mimeType as ImageMimeType,
    sizeBytes: row.sizeBytes,
    createdAt: row.createdAt.toISOString(),
    url,
  };
}

/** Triage: remove a saved screenshot (the stored object, then the row). */
export const deleteBugImage = withAction(async (imageId: UUID): Promise<void> => {
  await requireTriager();
  const id = uuid.parse(imageId);
  await withTx(async (tx) => {
    const [row] = await tx
      .select()
      .from(bugReportImages)
      .where(eq(bugReportImages.id, id))
      .for('update');
    if (!row) throw new ActionError('NOT_FOUND', IMAGE_NOT_FOUND);
    await removeObjects([row.storagePath]);
    await tx.delete(bugReportImages).where(eq(bugReportImages.id, id));
  });
});
