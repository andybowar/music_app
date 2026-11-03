'use server';

/**
 * Read-only share links for lists (contracts/api.md, SHR-01; REQ-SHARE-01, REQ-SHARE-03).
 *
 * - `createShare` mints a link for a list the caller may write: 32 bytes from the CSPRNG,
 *   base64url-encoded (43 chars, 256 bits). Optional expiry, which must be in the future.
 * - `revokeShare` sets `revoked_at` (idempotent: the first revocation time is kept).
 * - `listShares` returns every link of a list, newest first, for callers with `list:write`.
 * - `getSharedList` is the public read used by `/share/[token]`: no session, so it reads
 *   through the server's own database connection (the service role, bypassing RLS) and is
 *   gated by the token alone. It returns `null` for malformed, unknown, revoked or expired
 *   tokens and for soft-deleted lists, without saying which. The `ListDetail` it returns keeps
 *   the overrides but never a resource `url` or `storagePath`: those columns are not even
 *   selected, and every resource is scrubbed again before returning (opening files needs
 *   sign-in, REQ-SHARE-03).
 *
 * Actions follow requireUser → assertCan → Zod → work → `ActionResult` via `withAction`.
 * A list the caller cannot read (or a soft-deleted one) is NOT_FOUND rather than FORBIDDEN,
 * like the list actions, so its existence is not revealed.
 *
 * - `sendShareEmail` (SHR-03, REQ-SHARE-02) emails a summary of the list and its link to up to
 *   20 recipients, in BCC so nobody sees the others' addresses. Each email gets its own
 *   never-expiring link from `createShare` (revocable like any other). Each user may send 10 share emails an hour, counted from
 *   `audit_log` rows (entity `share_email`, recipient count only, never addresses); the SMTP
 *   server's own sending limit (Gmail's daily quota) is also RATE_LIMITED.
 *
 * Tokens are stored as issued, as contracts/schema.md and `Share.token` define them, so a link
 * can be shown again in the share dialog. RLS keeps `shares` readable only by users who can
 * write the list (db/migrations/0003_rls.sql).
 */

import 'server-only';

import type { AppUser, ListDetail, ListItem, Resource, Share, UUID } from '@/types/domain';

import { randomBytes } from 'node:crypto';

import { createElement } from 'react';

import { and, asc, count, desc, eq, gt, gte, inArray, isNull, or, sql } from 'drizzle-orm';
import { z } from 'zod';

import {
  auditLog,
  branches,
  composers,
  listItems,
  lists,
  resources,
  shares,
  songComposers,
  songKeys,
  songs,
  users,
} from '@/db/schema';
import { ShareList, shareListSubject } from '@/emails/ShareList';
import { assembleSongDetail } from '@/features/songs/server/assemble';
import { ActionError, withAction } from '@/lib/action';
import { requireUser } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { EmailRateLimitError, isEmailConfigured, sendEmail } from '@/lib/email';
import { env } from '@/lib/env';
import { resolveItemDisplay } from '@/lib/lists/resolve';
import { reportError } from '@/lib/log';
import { assertCan, can } from '@/lib/permissions';

/** A share plus the public link to it. */
export type ShareWithUrl = Share & { url: string };

const TOKEN_BYTES = 32;
/** base64url of 32 bytes, unpadded: exactly 43 characters of [A-Za-z0-9_-]. */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

const LIST_NOT_FOUND = 'List not found.';
const SHARE_NOT_FOUND = 'Share link not found.';
const EXPIRY_IN_PAST = 'Expiry must be in the future';

const idSchema = z.guid();
const createSchema = z.object({
  listId: idSchema,
  expiresAt: z.iso
    .datetime({ offset: true })
    .nullable()
    .optional()
    .refine((v) => v == null || Date.parse(v) > Date.now(), { error: EXPIRY_IN_PAST }),
});

/** Share-email limits (contracts/api.md): recipients per email, emails per user per hour. */
const MAX_SHARE_EMAIL_RECIPIENTS = 20;
const MAX_SHARE_EMAILS_PER_HOUR = 10;
/** `audit_log.entity` of a sent share email; also the rate-limit counter. */
const SHARE_EMAIL_ENTITY = 'share_email';

const recipientSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(320, 'Enter a valid email address.')
  .pipe(z.email({ error: 'Enter a valid email address.' }));
const sendEmailSchema = z.object({
  listId: idSchema,
  to: z
    .array(recipientSchema, { error: 'Add at least one email address.' })
    .transform((list) => [...new Set(list)])
    .pipe(
      z
        .array(z.string())
        .min(1, 'Add at least one email address.')
        .max(
          MAX_SHARE_EMAIL_RECIPIENTS,
          `Send to at most ${MAX_SHARE_EMAIL_RECIPIENTS} people at a time.`,
        ),
    ),
});

// ----- Helpers -----------------------------------------------------------------------------

function newToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

function shareUrl(token: string): string {
  return new URL(`/share/${encodeURIComponent(token)}`, env.APP_URL).toString();
}

interface ShareRow {
  id: string;
  listId: string;
  token: string;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}

const shareColumns = {
  id: shares.id,
  listId: shares.listId,
  token: shares.token,
  expiresAt: shares.expiresAt,
  revokedAt: shares.revokedAt,
  createdAt: shares.createdAt,
};

function toShare(row: ShareRow): ShareWithUrl {
  return {
    id: row.id,
    listId: row.listId,
    token: row.token,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    url: shareUrl(row.token),
  };
}

/**
 * The live list `listId`, checked for `share:create` / `share:revoke` / `list:write`. Lists the
 * caller can't even read are NOT_FOUND rather than FORBIDDEN.
 */
async function assertListAccess(
  user: AppUser,
  listId: UUID,
  action: 'share:create' | 'share:revoke' | 'list:write',
): Promise<void> {
  const [list] = await getDb()
    .select({ type: lists.type, ownerId: lists.ownerId, branchId: lists.branchId })
    .from(lists)
    .where(and(eq(lists.id, listId), isNull(lists.deletedAt)));
  if (!list || !can(user, 'list:read', { list })) {
    throw new ActionError('NOT_FOUND', LIST_NOT_FOUND);
  }
  assertCan(user, action, { list });
}

// ----- Actions -----------------------------------------------------------------------------

/** Mint a read-only link to a list (REQ-SHARE-01). `expiresAt` omitted or null: never expires. */
export const createShare = withAction(
  async (listId: UUID, options: { expiresAt?: string | null } = {}): Promise<ShareWithUrl> => {
    const user = await requireUser();
    const data = createSchema.parse({ listId, expiresAt: options?.expiresAt });
    await assertListAccess(user, data.listId, 'share:create');

    const [row] = await getDb()
      .insert(shares)
      .values({
        listId: data.listId,
        token: newToken(),
        createdBy: user.id,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
      })
      .returning(shareColumns);
    if (!row) throw new Error('Insert returned no row');
    return toShare(row);
  },
);

/** Revoke a link: it stops working at once. Revoking twice keeps the first time. */
export const revokeShare = withAction(async (id: UUID): Promise<void> => {
  const user = await requireUser();
  const shareId = idSchema.parse(id);

  const [share] = await getDb()
    .select({ listId: shares.listId })
    .from(shares)
    .where(eq(shares.id, shareId));
  if (!share) throw new ActionError('NOT_FOUND', SHARE_NOT_FOUND);
  await assertListAccess(user, share.listId, 'share:revoke');

  await getDb()
    .update(shares)
    .set({ revokedAt: sql`now()` })
    .where(and(eq(shares.id, shareId), isNull(shares.revokedAt)));
});

/** Every link of a list, newest first, revoked and expired ones included (`list:write`). */
export const listShares = withAction(async (listId: UUID): Promise<ShareWithUrl[]> => {
  const user = await requireUser();
  const id = idSchema.parse(listId);
  await assertListAccess(user, id, 'list:write');

  const rows = await getDb()
    .select(shareColumns)
    .from(shares)
    .where(eq(shares.listId, id))
    .orderBy(desc(shares.createdAt), desc(shares.id));
  return rows.map(toShare);
});

/**
 * A fresh never-expiring link for an email, made by `createShare` so the email gets exactly
 * the link a user would copy. Only the returned `url` is used, never a stored token (CR
 * SHR-01-hash-share-tokens: tokens will be stored hashed). The token in the url's last path
 * segment is what `/share/[token]` itself reads.
 */
async function shareForEmail(listId: UUID): Promise<{ url: string; token: string }> {
  const result = await createShare(listId);
  if (!result.ok) throw new ActionError(result.error.code, result.error.message);
  const { url } = result.data;
  const token = decodeURIComponent(new URL(url).pathname.split('/').pop() ?? '');
  return { url, token };
}

/** Share emails `userId` sent in the last hour. */
async function shareEmailsInLastHour(userId: UUID): Promise<number> {
  const [row] = await getDb()
    .select({ n: count() })
    .from(auditLog)
    .where(
      and(
        eq(auditLog.actorId, userId),
        eq(auditLog.entity, SHARE_EMAIL_ENTITY),
        gte(auditLog.createdAt, sql`now() - interval '1 hour'`),
      ),
    );
  return Number(row?.n ?? 0);
}

/**
 * Email a summary of a list (keys and overrides included) and its read-only link
 * (REQ-SHARE-02). At most 20 recipients, sent in BCC; at most 10 emails per user per hour.
 */
export const sendShareEmail = withAction(async (listId: UUID, to: string[]): Promise<void> => {
  const user = await requireUser();
  const data = sendEmailSchema.parse({ listId, to });
  await assertListAccess(user, data.listId, 'share:create');

  if (!isEmailConfigured() && process.env.NODE_ENV === 'production') {
    // Dev and tests log the message instead; a deployed site without SMTP must say so.
    throw new ActionError(
      'INTERNAL',
      "Email isn't set up on this site yet. Copy the link instead.",
    );
  }
  if ((await shareEmailsInLastHour(user.id)) >= MAX_SHARE_EMAILS_PER_HOUR) {
    throw new ActionError(
      'RATE_LIMITED',
      'You have sent a lot of share emails in the last hour. Try again later.',
    );
  }

  const share = await shareForEmail(data.listId);
  const list = await getSharedList(share.token);
  if (!list) throw new ActionError('NOT_FOUND', LIST_NOT_FOUND);

  try {
    await sendEmail({
      bcc: data.to,
      replyTo: user.email,
      subject: shareListSubject(list, user.name),
      react: createElement(ShareList, { list, url: share.url, senderName: user.name }),
    });
  } catch (error) {
    if (error instanceof EmailRateLimitError) {
      throw new ActionError(
        'RATE_LIMITED',
        'The app has reached its email sending limit for now. Copy the link instead, or try again tomorrow.',
      );
    }
    throw error;
  }

  try {
    await getDb()
      .insert(auditLog)
      .values({
        actorId: user.id,
        entity: SHARE_EMAIL_ENTITY,
        entityId: data.listId,
        action: 'create',
        diff: { recipients: { from: null, to: data.to.length } },
      });
  } catch (error) {
    // The email went out; failing to count it must not report a failed send.
    reportError(error, { handler: 'sendShareEmail' });
  }
});

// ----- Public read -------------------------------------------------------------------------

/** A resource with everything that would open the file removed. */
function scrubResource(resource: Resource): Resource {
  return { ...resource, url: null, storagePath: null };
}

/**
 * The shared list for `token`, or `null` when the token is malformed, unknown, revoked or
 * expired, or the list was deleted. Needs no session. Resources come back without `url` or
 * `storagePath`.
 */
export async function getSharedList(token: string): Promise<ListDetail | null> {
  if (typeof token !== 'string' || !TOKEN_PATTERN.test(token)) return null;
  const db = getDb();

  const [row] = await db
    .select({
      id: lists.id,
      type: lists.type,
      name: lists.name,
      eventDate: lists.eventDate,
      ownerId: lists.ownerId,
      ownerName: users.name,
      branchId: lists.branchId,
      branchCode: branches.code,
      createdAt: lists.createdAt,
      updatedAt: lists.updatedAt,
    })
    .from(shares)
    .innerJoin(lists, eq(lists.id, shares.listId))
    .innerJoin(users, eq(users.id, lists.ownerId))
    .leftJoin(branches, eq(branches.id, lists.branchId))
    .where(
      and(
        eq(shares.token, token),
        isNull(shares.revokedAt),
        or(isNull(shares.expiresAt), gt(shares.expiresAt, sql`now()`)),
        isNull(lists.deletedAt),
      ),
    );
  if (!row) return null;

  const itemRows = await db
    .select()
    .from(listItems)
    .where(eq(listItems.listId, row.id))
    .orderBy(asc(listItems.position), asc(listItems.createdAt), asc(listItems.id));
  const items: ListItem[] = itemRows.map((r) => ({
    id: r.id,
    listId: r.listId,
    songId: r.songId,
    position: r.position,
    overrideKey: r.overrideKey,
    overrideBpm: r.overrideBpm,
    overrideEnergy: r.overrideEnergy,
    resourceId: r.resourceId,
    notes: r.notes,
  }));

  const details = await loadSharedSongs(items.map((i) => i.songId));
  const resolved = items.flatMap((item) => {
    const song = details.get(item.songId);
    if (!song) return [];
    const display = resolveItemDisplay(song, item);
    return [{ ...display, resources: display.resources.map(scrubResource) }];
  });

  return {
    id: row.id,
    type: row.type,
    name: row.name,
    eventDate: row.eventDate,
    ownerId: row.ownerId,
    ownerName: row.ownerName,
    branchId: row.branchId,
    branchCode: row.branchCode,
    itemCount: itemRows.length,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    items: resolved,
  };
}

/**
 * Songs for shared list items, soft-deleted ones included (lists keep their rows), keyed by id.
 * Mirrors `getList`'s loader, except that resource `url`, `storage_path` and `uploaded_by` are
 * never read from the database.
 */
async function loadSharedSongs(songIds: readonly string[]) {
  const ids = [...new Set(songIds)];
  if (!ids.length) return new Map<string, ReturnType<typeof assembleSongDetail>>();
  const db = getDb();

  const [songRows, composerRows, keyRows, resourceRows, branchRows] = await Promise.all([
    db.select().from(songs).where(inArray(songs.id, ids)),
    db
      .select({
        songId: songComposers.songId,
        sortOrder: songComposers.sortOrder,
        composer: { id: composers.id, name: composers.name, popMember: composers.popMember },
      })
      .from(songComposers)
      .innerJoin(composers, eq(composers.id, songComposers.composerId))
      .where(inArray(songComposers.songId, ids)),
    db.select().from(songKeys).where(inArray(songKeys.songId, ids)),
    db
      .select({
        id: resources.id,
        songId: resources.songId,
        songKeyId: resources.songKeyId,
        kind: resources.kind,
        format: resources.format,
        label: resources.label,
        sizeBytes: resources.sizeBytes,
        mimeType: resources.mimeType,
        createdAt: resources.createdAt,
      })
      .from(resources)
      .where(inArray(resources.songId, ids)),
    db.select({ id: branches.id, code: branches.code }).from(branches),
  ]);

  const bySong = <T extends { songId: string }>(rows: T[], songId: string) =>
    rows.filter((r) => r.songId === songId);
  return new Map(
    songRows.map((song) => [
      song.id,
      assembleSongDetail({
        song,
        composers: bySong(composerRows, song.id),
        keys: bySong(keyRows, song.id),
        resources: bySong(resourceRows, song.id).map((r) => ({
          ...r,
          url: null,
          storagePath: null,
          uploadedBy: null,
        })),
        themes: [],
        usage: [],
        branches: branchRows,
      }),
    ]),
  );
}
