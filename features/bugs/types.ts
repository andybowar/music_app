/**
 * Bug reports (ADM-08; REQ-ADM-03): feature-local types, constants and Zod schemas. Pure (no
 * I/O, no `server-only`), so the server actions, the client UI and the Drizzle schema
 * (`db/schema/bugs.ts`) share one source for the enum values and limits.
 *
 * Image limits, types and the upload ticket come from ADM-06's backlog
 * (`features/admin/backlog/types.ts`): bug screenshots go through the same flow.
 */
import { z } from 'zod';

import {
  imageUploadSchema,
  type ImageMimeType,
  type ImageUploadInput,
  type PutFile,
} from '@/features/admin/backlog/types';
import type { ActionResult, ISODateTime, UUID } from '@/types/domain';

export {
  IMAGE_MIME_TYPES,
  isImageMimeType,
  MAX_IMAGE_BYTES,
  type ImageMimeType,
  type ImageUploadInput,
  type PutFile,
} from '@/features/admin/backlog/types';

// ---------- Enum (Postgres `bug_report_status`) ----------

export const BUG_REPORT_STATUSES = ['new', 'confirmed', 'fixed', 'wont_fix', 'duplicate'] as const;
export type BugReportStatus = (typeof BUG_REPORT_STATUSES)[number];

export const BUG_STATUS_LABEL: Record<BugReportStatus, string> = {
  new: 'New',
  confirmed: 'Confirmed',
  fixed: 'Fixed',
  wont_fix: "Won't fix",
  duplicate: 'Duplicate',
};

/** Statuses still waiting on someone (the /admin dashboard shows these). */
export const OPEN_BUG_STATUSES = ['new', 'confirmed'] as const satisfies readonly BugReportStatus[];

export function isBugReportStatus(value: unknown): value is BugReportStatus {
  return typeof value === 'string' && (BUG_REPORT_STATUSES as readonly string[]).includes(value);
}

// ---------- Limits ----------

export const BUG_TITLE_MAX = 200;
export const BUG_DESCRIPTION_MAX = 10_000;
export const BUG_EXPECTED_MAX = 2_000;
export const BUG_ADMIN_NOTE_MAX = 2_000;
export const BUG_PAGE_PATH_MAX = 2_000;
export const BUG_USER_AGENT_MAX = 1_000;
export const BUG_VIEWPORT_MAX = 40;
export const MAX_IMAGES_PER_BUG = 5;
/** Reports one user may file in an hour; the next one gets `RATE_LIMITED`. */
export const BUG_REPORTS_PER_HOUR = 10;
/** How long after filing a report its creator may still add screenshots. */
export const BUG_IMAGE_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Whether `reportsInLastHour` already uses up the hourly allowance. */
export function isOverHourlyLimit(reportsInLastHour: number): boolean {
  return reportsInLastHour >= BUG_REPORTS_PER_HOUR;
}

/** Whether a report filed at `createdAt` still accepts screenshots at `now`. */
export function withinImageWindow(createdAt: Date, now = Date.now()): boolean {
  return now - createdAt.getTime() < BUG_IMAGE_WINDOW_MS;
}

// ---------- Entities ----------

export interface BugReport {
  id: UUID;
  title: string;
  description: string;
  expected: string | null;
  pagePath: string | null;
  userAgent: string | null;
  viewport: string | null;
  appVersion: string | null;
  status: BugReportStatus;
  /** Shown to the reporter. */
  adminNote: string | null;
  createdBy: UUID;
  /** The reporter's display name (null if the user row is gone). */
  createdByName: string | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  imageCount: number;
}

export interface BugReportImage {
  id: UUID;
  reportId: UUID;
  fileName: string;
  mimeType: ImageMimeType;
  sizeBytes: number;
  createdAt: ISODateTime;
  /** Short-lived signed read URL (SIGNED_URL_TTL_SECONDS). */
  url: string;
}

export interface BugReportDetail extends BugReport {
  images: BugReportImage[];
}

/** What `createBugImageUpload` returns (contracts/api.md). */
export interface BugImageUploadTicket {
  /** Opaque pending image id; pass it to `finalizeBugImage`. */
  pendingId: string;
  uploadUrl: string;
}

// ---------- Validation ----------

/**
 * Whether `value` is a same-origin path: starts with one `/` (not `//` or `/\`, which browsers
 * treat as another host), no scheme, no control characters or whitespace.
 */
export function isSafePagePath(value: string): boolean {
  if (value.length === 0 || value.length > BUG_PAGE_PATH_MAX) return false;
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return false;
  // Whitespace, control characters and backslashes.
  if (/[\s\u0000-\u001f\u007f\\]/.test(value)) return false;
  try {
    return new URL(value, 'http://app.invalid').origin === 'http://app.invalid';
  } catch {
    return false;
  }
}

/** `from` from `/bugs/new?from=…`, when it is a safe path; otherwise undefined. */
export function pagePathFrom(raw: string | string[] | undefined): string | undefined {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value && isSafePagePath(value) ? value : undefined;
}

const optionalText = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .transform((s) => (s === '' ? null : s))
    .nullish();

const title = z
  .string()
  .trim()
  .min(1, 'Tell us what went wrong')
  .max(BUG_TITLE_MAX, `Keep this to ${BUG_TITLE_MAX} characters or fewer`);

const description = z
  .string()
  .trim()
  .min(1, 'Describe what happened')
  .max(
    BUG_DESCRIPTION_MAX,
    `Keep this to ${BUG_DESCRIPTION_MAX.toLocaleString('en-US')} characters or fewer`,
  );

export const bugReportInputSchema = z
  .object({
    title,
    description,
    expected: optionalText(
      BUG_EXPECTED_MAX,
      `Keep this to ${BUG_EXPECTED_MAX.toLocaleString('en-US')} characters or fewer`,
    ),
    pagePath: z
      .string()
      .trim()
      .refine((v) => v === '' || isSafePagePath(v), 'The page must be a path in this app')
      .transform((s) => (s === '' ? null : s))
      .nullish(),
    // Captured by the browser, not typed: trim to the column limits rather than reject.
    userAgent: z
      .string()
      .trim()
      .transform((s) => s.slice(0, BUG_USER_AGENT_MAX) || null)
      .nullish(),
    viewport: z
      .string()
      .trim()
      .transform((s) => s.slice(0, BUG_VIEWPORT_MAX) || null)
      .nullish(),
  })
  .strict();
export type BugReportInput = z.input<typeof bugReportInputSchema>;

export const bugReportPatchSchema = z
  .object({
    status: z.enum(BUG_REPORT_STATUSES),
    adminNote: z
      .string()
      .trim()
      .max(
        BUG_ADMIN_NOTE_MAX,
        `Keep the note to ${BUG_ADMIN_NOTE_MAX.toLocaleString('en-US')} characters or fewer`,
      )
      .transform((s) => (s === '' ? null : s))
      .nullable(),
  })
  .partial()
  .strict();
export type BugReportPatch = z.input<typeof bugReportPatchSchema>;

export const listBugReportsSchema = z
  .object({ status: z.enum(BUG_REPORT_STATUSES).optional() })
  .strict()
  .optional();

export const bugImageUploadSchema = imageUploadSchema;

// ---------- UI action seams (contracts/ui.md) ----------

export interface BugReportActions {
  createBugReport(input: BugReportInput): Promise<ActionResult<BugReport>>;
  updateBugReport(id: UUID, patch: BugReportPatch): Promise<ActionResult<BugReport>>;
  deleteBugReport(id: UUID): Promise<ActionResult<void>>;
  createBugImageUpload(
    reportId: UUID,
    input: ImageUploadInput,
  ): Promise<ActionResult<BugImageUploadTicket>>;
  finalizeBugImage(pendingId: string): Promise<ActionResult<BugReportImage>>;
  deleteBugImage(imageId: UUID): Promise<ActionResult<void>>;
  putFile: PutFile;
  /** Client navigation; the gallery stubs it. */
  navigate(href: string): void;
}

// ---------- Hrefs ----------

export const BUGS_HREF = '/bugs';
export const NEW_BUG_HREF = '/bugs/new';
export const ADMIN_BUGS_HREF = '/admin/bugs';

export function bugHref(id: string, admin = false): string {
  return `${admin ? ADMIN_BUGS_HREF : BUGS_HREF}/${id}`;
}
