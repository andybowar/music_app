'use server';

/**
 * Manual per-branch usage levels (contracts/api.md; REQ-LIB-05, REQ-BR-02).
 *
 * `setBranchUsage(songId, entries)` replaces the song's **manual** usage rows
 * (CR LIB-15-set-branch-usage-semantics):
 *   - each entry is upserted with `source = 'manual'` (overriding a derived row for that branch);
 *   - manual rows whose branch is not in `entries` are deleted;
 *   - derived rows are kept unless an entry overrides them.
 *
 * requireUser → assertCan('usage:write') → Zod (`usageInputSchema`; `fieldErrors` keys index
 * into `entries`, e.g. `0.level`) → write + one audit row in a single transaction.
 */

import 'server-only';

import type { UsageLevel, UsageSource } from '@/types/domain';

import { and, eq, isNull, notInArray, sql } from 'drizzle-orm';
import { z } from 'zod';

import { branches, branchUsage, songs } from '@/db/schema';
import { ActionError, withAction } from '@/lib/action';
import { recordAudit } from '@/lib/audit';
import { requireUser } from '@/lib/auth';
import { withTx } from '@/lib/db';
import { assertCan } from '@/lib/permissions';
import { usageInputSchema } from '@/types/validation';

const SONG_NOT_FOUND = 'Song not found.';
const INVALID_SONG_ID = 'Invalid song id.';
const UNKNOWN_BRANCH = 'Unknown branch.';

type UsageSnapshot = Record<string, { level: UsageLevel; source: UsageSource }>;

/** Audit snapshot of a song's usage rows, keyed by branch code (readable in the song history). */
function snapshot(
  rows: { branchId: string; level: UsageLevel; source: UsageSource }[],
  codeById: Map<string, string>,
): UsageSnapshot {
  const out: UsageSnapshot = {};
  for (const row of rows) {
    out[codeById.get(row.branchId) ?? row.branchId] = { level: row.level, source: row.source };
  }
  return out;
}

/** Replace the song's manual branch usage with `entries` (see module comment). */
export const setBranchUsage = withAction(
  async (songId: string, entries: z.input<typeof usageInputSchema>): Promise<void> => {
    const user = await requireUser();
    assertCan(user, 'usage:write');
    const sid = z.uuid().safeParse(songId);
    if (!sid.success) {
      throw new ActionError('VALIDATION', INVALID_SONG_ID, { songId: [INVALID_SONG_ID] });
    }
    const data = usageInputSchema.parse(entries);

    await withTx(async (tx) => {
      // Lock the song so concurrent saves of its usage serialise.
      const [song] = await tx
        .select({ id: songs.id })
        .from(songs)
        .where(and(eq(songs.id, sid.data), isNull(songs.deletedAt)))
        .for('update');
      if (!song) throw new ActionError('NOT_FOUND', SONG_NOT_FOUND);

      const allBranches = await tx.select({ id: branches.id, code: branches.code }).from(branches);
      const codeById = new Map(allBranches.map((b) => [b.id, b.code]));
      const fieldErrors: Record<string, string[]> = {};
      data.forEach((entry, i) => {
        if (!codeById.has(entry.branchId)) fieldErrors[`${i}.branchId`] = [UNKNOWN_BRANCH];
      });
      if (Object.keys(fieldErrors).length > 0) {
        throw new ActionError('VALIDATION', UNKNOWN_BRANCH, fieldErrors);
      }

      const columns = {
        branchId: branchUsage.branchId,
        level: branchUsage.level,
        source: branchUsage.source,
      };
      const before = await tx
        .select(columns)
        .from(branchUsage)
        .where(eq(branchUsage.songId, sid.data));

      // Manual rows for branches no longer in `entries` fall back to derived/none.
      const keep = data.map((e) => e.branchId);
      await tx
        .delete(branchUsage)
        .where(
          and(
            eq(branchUsage.songId, sid.data),
            eq(branchUsage.source, 'manual'),
            keep.length > 0 ? notInArray(branchUsage.branchId, keep) : undefined,
          ),
        );

      if (data.length > 0) {
        await tx
          .insert(branchUsage)
          .values(
            data.map((e) => ({
              songId: sid.data,
              branchId: e.branchId,
              level: e.level,
              source: 'manual' as const,
            })),
          )
          .onConflictDoUpdate({
            target: [branchUsage.songId, branchUsage.branchId],
            set: { level: sql`excluded.level`, source: 'manual', updatedAt: sql`now()` },
          });
      }

      const after = await tx
        .select(columns)
        .from(branchUsage)
        .where(eq(branchUsage.songId, sid.data));

      const beforeSnap = snapshot(before, codeById);
      const afterSnap = snapshot(after, codeById);
      // recordAudit writes even an empty diff; skip no-op saves.
      const changed = new Set([...Object.keys(beforeSnap), ...Object.keys(afterSnap)]);
      const anyChange = [...changed].some(
        (k) =>
          beforeSnap[k]?.level !== afterSnap[k]?.level ||
          beforeSnap[k]?.source !== afterSnap[k]?.source,
      );
      if (!anyChange) return;

      await recordAudit(tx, {
        actorId: user.id,
        entity: 'branch_usage',
        entityId: sid.data,
        action: 'update',
        before: beforeSnap,
        after: afterSnap,
      });
    });
  },
);
