/**
 * Nightly derived branch usage job (BR-03; REQ-BR-02). Called by `app/api/cron/usage/route.ts`.
 *
 * For every (song, branch) pair, counts the branch's setlists (type 'setlist', not deleted,
 * `lists.branch_id` = branch) whose `event_date` falls in the 365 days ending today in
 * America/Chicago and that include the song (not deleted). Each count maps to a level via
 * `deriveUsageLevel`, then in one transaction:
 *   - pairs with history are upserted with `source = 'derived'`; a pair that already has a
 *     **manual** row is left alone (manual values take precedence and are never overwritten);
 *   - derived rows whose pair no longer has any history are deleted (missing row = 'none').
 *
 * `updated` counts rows inserted, changed or deleted; unchanged derived rows aren't counted.
 * Runs with no user, so it writes no audit rows (audit_log needs an actor).
 */

import 'server-only';

import { and, between, countDistinct, eq, isNotNull, isNull, sql } from 'drizzle-orm';

import { branchUsage, listItems, lists, songs } from '@/db/schema';
import { withTx } from '@/lib/db';

import { deriveUsageLevel, usageWindow } from './derive';

/** Rows per INSERT, well under Postgres's 65,535 bind-parameter limit. */
const CHUNK = 1000;

/** Arbitrary key for the transaction-scoped advisory lock that serialises overlapping runs. */
const LOCK_KEY = 4_803_202_603;

export async function runUsageJob(now: Date = new Date()): Promise<{ updated: number }> {
  const { from, to } = usageWindow(now);

  return withTx(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${LOCK_KEY})`);

    const counts = await tx
      .select({
        songId: listItems.songId,
        branchId: lists.branchId,
        count: countDistinct(lists.id),
      })
      .from(listItems)
      .innerJoin(lists, eq(lists.id, listItems.listId))
      .innerJoin(songs, eq(songs.id, listItems.songId))
      .where(
        and(
          eq(lists.type, 'setlist'),
          isNull(lists.deletedAt),
          isNotNull(lists.branchId),
          between(lists.eventDate, from, to),
          isNull(songs.deletedAt),
        ),
      )
      .groupBy(listItems.songId, lists.branchId);

    const rows = counts.map((c) => ({
      songId: c.songId,
      // reason: the WHERE clause excludes null branch ids.
      branchId: c.branchId as string,
      level: deriveUsageLevel(Number(c.count)),
      source: 'derived' as const,
    }));

    let updated = 0;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const written = await tx
        .insert(branchUsage)
        .values(rows.slice(i, i + CHUNK))
        .onConflictDoUpdate({
          target: [branchUsage.songId, branchUsage.branchId],
          set: { level: sql`excluded.level`, updatedAt: sql`now()` },
          // Qualified explicitly: Drizzle drops table names on columns inside sql``.
          setWhere: sql`"branch_usage"."source" = 'derived' and "branch_usage"."level" <> excluded.level`,
        })
        .returning({ songId: branchUsage.songId });
      updated += written.length;
    }

    // Same predicate as the count above, written with explicit table names.
    const deleted = await tx.execute(sql`
      delete from "branch_usage"
      where "branch_usage"."source" = 'derived'
        and not exists (
          select 1
          from "list_items"
          join "lists" on "lists"."id" = "list_items"."list_id"
          join "songs" on "songs"."id" = "list_items"."song_id"
          where "list_items"."song_id" = "branch_usage"."song_id"
            and "lists"."branch_id" = "branch_usage"."branch_id"
            and "lists"."type" = 'setlist'
            and "lists"."deleted_at" is null
            and "lists"."event_date" between ${from} and ${to}
            and "songs"."deleted_at" is null
        )
    `);
    updated += deleted.count;

    return { updated };
  });
}
