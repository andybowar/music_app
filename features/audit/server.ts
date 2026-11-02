'use server';

/**
 * Change history (contracts/api.md, LIB-19; REQ-LIB-12).
 *
 * `getAuditTrail(entity, entityId)` is the read helper: newest first, at most `TRAIL_LIMIT`
 * entries, `audit:read` (contributors and up). For `entity = 'song'` the trail is the song's whole
 * history: the song row plus its composers, themes, branch usage, keys and files (see
 * `trail.ts`). Diffs are cleaned before they leave the server (ids → names, storage details
 * dropped, lyrics narrowed to the sections that changed). Actors are shown by name only.
 *
 * Only song-related entities have a trail here. Others (e.g. 'user', 'branch', whose diffs
 * hold emails and admin details) return `[]`, so `audit:read` can't be used to read them.
 *
 * Client components call it through `loadAuditTrail` in `actions.ts`.
 */

import 'server-only';

import { and, desc, eq, inArray, or, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';

import { auditLog, branches, composers, users } from '@/db/schema';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { assertCan } from '@/lib/permissions';
import type { AuditEntry } from '@/types/domain';

import { cleanDiff, collectRefs, SONG_CHILD_ENTITIES, SONG_ENTITIES, TRAIL_LIMIT } from './trail';

/** Entities whose trail `audit:read` may see. */
const READABLE_ENTITIES: ReadonlySet<string> = new Set([
  ...SONG_ENTITIES,
  ...SONG_CHILD_ENTITIES,
  'composer',
  'theme',
]);

const argsSchema = z.object({
  entity: z.string().min(1).max(64),
  entityId: z.string().uuid(),
});

/** Rows about the song itself or any of its keys and files (current or deleted). */
function songScope(songId: string): SQL {
  // Written out in full: a deleted key/file row is gone, so its audit rows are matched on the
  // `songId` the snapshot carried. Table names are explicit because this is raw SQL.
  const mentionsSong = sql`(("audit_log"."diff" -> 'songId' ->> 'from') = ${songId} or ("audit_log"."diff" -> 'songId' ->> 'to') = ${songId})`;
  const isKeyOfSong = sql`"audit_log"."entity_id" in (select "song_keys"."id" from "song_keys" where "song_keys"."song_id" = ${songId})`;
  const isFileOfSong = sql`"audit_log"."entity_id" in (select "resources"."id" from "resources" where "resources"."song_id" = ${songId})`;

  return or(
    and(inArray(auditLog.entity, [...SONG_ENTITIES]), eq(auditLog.entityId, songId)),
    and(eq(auditLog.entity, 'song_key'), or(isKeyOfSong, mentionsSong)),
    and(eq(auditLog.entity, 'resource'), or(isFileOfSong, mentionsSong)),
  )!;
}

/** The change history of one entity, newest first. Needs `audit:read`. */
export async function getAuditTrail(entity: string, entityId: string): Promise<AuditEntry[]> {
  const user = await requireUser();
  assertCan(user, 'audit:read');

  const args = argsSchema.safeParse({ entity, entityId });
  if (!args.success || !READABLE_ENTITIES.has(args.data.entity)) return [];
  const { entity: e, entityId: id } = args.data;

  const where =
    e === 'song' ? songScope(id) : and(eq(auditLog.entity, e), eq(auditLog.entityId, id))!;

  const rows = await db
    .select({
      id: auditLog.id,
      actorName: users.name,
      entity: auditLog.entity,
      entityId: auditLog.entityId,
      action: auditLog.action,
      diff: auditLog.diff,
      createdAt: auditLog.createdAt,
    })
    .from(auditLog)
    .leftJoin(users, eq(users.id, auditLog.actorId))
    .where(where)
    .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
    .limit(TRAIL_LIMIT);

  const refs = collectRefs(rows.map((r) => r.diff ?? {}));
  const [composerRows, branchRows] = await Promise.all([
    refs.composerIds.length > 0
      ? db
          .select({ id: composers.id, name: composers.name })
          .from(composers)
          .where(inArray(composers.id, refs.composerIds))
      : [],
    refs.branchIds.length > 0
      ? db
          .select({ id: branches.id, code: branches.code })
          .from(branches)
          .where(inArray(branches.id, refs.branchIds))
      : [],
  ]);
  const names = {
    composers: new Map(composerRows.map((c) => [c.id, c.name])),
    branches: new Map(branchRows.map((b) => [b.id, b.code])),
  };

  return rows.map((r) => ({
    id: r.id,
    actorName: r.actorName ?? 'Unknown user',
    entity: r.entity,
    entityId: r.entityId,
    action: r.action,
    diff: cleanDiff(r.diff ?? {}, names),
    createdAt: r.createdAt.toISOString(),
  }));
}
