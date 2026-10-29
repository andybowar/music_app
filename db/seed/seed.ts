/**
 * Seed runner (DB-04). Loads `fixtures/` into a local database; safe to run repeatedly.
 *
 * - Auth users go through the Supabase admin API (service-role key), which creates the
 *   `auth.users` + `auth.identities` rows GoTrue needs for password sign-in.
 * - Everything else is upserted by fixture id via Drizzle in one transaction, connected as
 *   `postgres` (bypasses RLS). An upsert only updates a row whose values differ, so a second
 *   run is a no-op and doesn't fire DB-02's song triggers again.
 * - Child rows of fixture songs/lists that aren't in the fixtures are deleted, so a dirty
 *   local database is brought back to the fixture state.
 * - Derived song columns come from DB-02's triggers; the seed never writes them. The one
 *   exception to "triggers decide" is `songs.updated_at`, which the triggers stamp with
 *   now(); it is reset to the fixture value with only the `songs_derive_lines` trigger off,
 *   so seeded songs deep-equal their fixtures.
 */
import { createClient } from '@supabase/supabase-js';
import { and, eq, getTableColumns, inArray, notInArray, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import type { PgColumn, PgTable, PgUpdateSetSource } from 'drizzle-orm/pg-core';
import postgres from 'postgres';

import * as schema from '@/db/schema';
import type { AppUser } from '@/types/domain';

import { buildSeedData, DEV_PASSWORD } from './data';
import { assertLocalTargets } from './guard';

export type SeedOptions = {
  databaseUrl: string | undefined;
  supabaseUrl: string | undefined;
  serviceRoleKey: string | undefined;
  /** Allow non-local targets. */
  force?: boolean;
  log?: (message: string) => void;
};

/** Long enough to mean "forever" for a disabled dev user. */
const DISABLED_BAN = '876000h';

export async function seed(opts: SeedOptions): Promise<{ counts: Record<string, number> }> {
  const log = opts.log ?? (() => {});
  assertLocalTargets(
    { DATABASE_URL: opts.databaseUrl, NEXT_PUBLIC_SUPABASE_URL: opts.supabaseUrl },
    opts.force ?? false,
  );
  if (!opts.serviceRoleKey) throw new Error('Seed needs SUPABASE_SERVICE_ROLE_KEY to be set.');

  const data = buildSeedData();
  await seedAuthUsers(opts.supabaseUrl!, opts.serviceRoleKey, data.users);
  log(`auth users: ${data.users.length}`);

  const client = postgres(opts.databaseUrl!, { max: 1, onnotice: () => {} });
  try {
    const db = drizzle(client, { schema });
    const counts = await db.transaction(async (tx) => {
      const counts: Record<string, number> = {};
      const run = async <T extends PgTable>(
        name: string,
        table: T,
        rows: T['$inferInsert'][],
        target: PgColumn[],
        skipOnUpdate: string[] = [],
      ) => {
        await upsert(tx, table, rows, target, skipOnUpdate);
        counts[name] = rows.length;
      };

      const s = schema;
      await run('branches', s.branches, data.branches, [s.branches.id]);
      await run('users', s.users, data.userRows, [s.users.id]);
      await run('composers', s.composers, data.composers, [s.composers.id]);
      await run('themes', s.themes, data.themes, [s.themes.id]);
      // updated_at is fixed up at the end; comparing it here would re-update every run.
      await run('songs', s.songs, data.songs, [s.songs.id], ['updatedAt']);

      const songIds = data.songs.map((r) => r.id!);
      const listIds = data.lists.map((r) => r.id!);

      // Drop stale children of fixture parents before inserting, so unique keys can't clash.
      await tx.delete(s.listItems).where(
        and(
          inArray(s.listItems.listId, listIds),
          notInArray(
            s.listItems.id,
            data.listItems.map((r) => r.id!),
          ),
        ),
      );
      await tx.delete(s.resources).where(
        and(
          inArray(s.resources.songId, songIds),
          notInArray(
            s.resources.id,
            data.resources.map((r) => r.id!),
          ),
        ),
      );
      await tx.delete(s.songKeys).where(
        and(
          inArray(s.songKeys.songId, songIds),
          notInArray(
            s.songKeys.id,
            data.songKeys.map((r) => r.id!),
          ),
        ),
      );
      await tx.delete(s.songComposers).where(
        and(
          inArray(s.songComposers.songId, songIds),
          notInArray(
            pairKey(s.songComposers.songId, s.songComposers.composerId),
            data.songComposers.map((r) => `${r.songId}:${r.composerId}`),
          ),
        ),
      );
      await tx.delete(s.songThemes).where(
        and(
          inArray(s.songThemes.songId, songIds),
          notInArray(
            sql`${s.songThemes.songId}::text || ':' || ${s.songThemes.themeId}::text || ':' || ${s.songThemes.section}::text`,
            data.songThemes.map((r) => `${r.songId}:${r.themeId}:${r.section}`),
          ),
        ),
      );
      await tx.delete(s.branchUsage).where(
        and(
          inArray(s.branchUsage.songId, songIds),
          notInArray(
            pairKey(s.branchUsage.songId, s.branchUsage.branchId),
            data.branchUsage.map((r) => `${r.songId}:${r.branchId}`),
          ),
        ),
      );

      await run('song_composers', s.songComposers, data.songComposers, [
        s.songComposers.songId,
        s.songComposers.composerId,
      ]);
      await run('song_keys', s.songKeys, data.songKeys, [s.songKeys.id]);
      await run('resources', s.resources, data.resources, [s.resources.id]);
      await run('song_themes', s.songThemes, data.songThemes, [
        s.songThemes.songId,
        s.songThemes.themeId,
        s.songThemes.section,
      ]);
      await run('branch_usage', s.branchUsage, data.branchUsage, [
        s.branchUsage.songId,
        s.branchUsage.branchId,
      ]);
      await run('lists', s.lists, data.lists, [s.lists.id]);
      await run('list_items', s.listItems, data.listItems, [s.listItems.id]);

      await restoreSongUpdatedAt(tx, data.songs);
      return counts;
    });
    for (const [name, n] of Object.entries(counts)) log(`${name}: ${n}`);
    return { counts: { auth_users: data.users.length, ...counts } };
  } finally {
    await client.end();
  }
}

type Tx = Parameters<Parameters<ReturnType<typeof drizzle<typeof schema>>['transaction']>[0]>[0];

function pairKey(a: PgColumn, b: PgColumn): SQL {
  return sql`${a}::text || ':' || ${b}::text`;
}

/**
 * Insert `rows`; on a key conflict, update the row only if some supplied column differs.
 * Tables whose every column is in the key just skip existing rows.
 */
async function upsert<T extends PgTable>(
  tx: Tx,
  table: T,
  rows: T['$inferInsert'][],
  target: PgColumn[],
  skipOnUpdate: string[],
) {
  if (!rows.length) return;
  const columns = getTableColumns(table) as Record<string, PgColumn>;
  const targetNames = new Set(target.map((c) => c.name));
  const updatable = Object.keys(rows[0]!)
    .filter((key) => !skipOnUpdate.includes(key))
    .map((key) => [key, columns[key]!] as const)
    .filter(([, col]) => !targetNames.has(col.name));

  const insert = tx.insert(table).values(rows);
  if (!updatable.length) {
    await insert.onConflictDoNothing({ target });
    return;
  }
  // Keys come from the table's own columns, which TS can't follow through a generic `T`.
  const set = Object.fromEntries(
    updatable.map(([key, col]) => [key, sql.raw(`excluded."${col.name}"`)]),
  ) as PgUpdateSetSource<T>;
  const current = sql.join(
    updatable.map(([, col]) => sql`${col}`),
    sql`, `,
  );
  const incoming = sql.raw(updatable.map(([, col]) => `excluded."${col.name}"`).join(', '));
  await insert.onConflictDoUpdate({
    target,
    set,
    setWhere: sql`(${current}) is distinct from (${incoming})`,
  });
}

/** Put each song's updated_at back to its fixture value without the trigger re-stamping it. */
async function restoreSongUpdatedAt(tx: Tx, rows: { id?: string; updatedAt?: Date }[]) {
  const s = schema.songs;
  const current = await tx
    .select({ id: s.id, updatedAt: s.updatedAt })
    .from(s)
    .where(
      inArray(
        s.id,
        rows.map((r) => r.id!),
      ),
    );
  const want = new Map(rows.map((r) => [r.id!, r.updatedAt!.getTime()]));
  const stale = current.filter((r) => r.updatedAt.getTime() !== want.get(r.id));
  if (!stale.length) return;

  await tx.execute(sql`alter table public.songs disable trigger songs_derive_lines`);
  for (const row of stale) {
    await tx
      .update(s)
      .set({ updatedAt: new Date(want.get(row.id)!) })
      .where(eq(s.id, row.id));
  }
  await tx.execute(sql`alter table public.songs enable trigger songs_derive_lines`);
}

/** Create or reset each user's auth row (same id, email and dev password). */
async function seedAuthUsers(url: string, serviceRoleKey: string, users: AppUser[]) {
  const supabase = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  for (const u of users) {
    const existing = await supabase.auth.admin.getUserById(u.id);
    const bannedUntil = existing.data.user?.banned_until;
    const alreadyBanned = !!bannedUntil && new Date(bannedUntil) > new Date();
    const attrs = {
      email: u.email,
      password: DEV_PASSWORD,
      email_confirm: true,
      user_metadata: { name: u.name },
      // Re-banning would move banned_until on every run; leave an existing ban alone.
      ...(u.disabledAt
        ? alreadyBanned
          ? {}
          : { ban_duration: DISABLED_BAN }
        : { ban_duration: 'none' }),
    };
    const { error } = existing.data.user
      ? await supabase.auth.admin.updateUserById(u.id, attrs)
      : await supabase.auth.admin.createUser({ id: u.id, ...attrs });
    if (error) throw new Error(`Seeding auth user ${u.email} failed: ${error.message}`);
  }
}
