// @vitest-environment node
// Integration: needs local Supabase (`pnpm db:start`). CI sets the env vars; locally
// they come from .env.local, which Vitest doesn't load on its own.
//
// The job is global, so assertions are scoped to the songs/branches this file creates.
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';

import { afterAll, beforeAll, expect, test, vi } from 'vitest';

vi.mock('server-only', () => ({}));

if (!process.env.DATABASE_URL && existsSync('.env.local')) process.loadEnvFile('.env.local');

const { and, eq, inArray, sql } = await import('drizzle-orm');
const { branches, branchUsage, listItems, lists, songs, users } = await import('@/db/schema');
const { getDb } = await import('@/lib/db');
const { runUsageJob } = await import('./job');

// Today in Chicago is 2026-06-15, so the window is 2025-06-16 … 2026-06-15.
const NOW = new Date('2026-06-15T17:00:00Z');
const IN_WINDOW = '2026-03-01';

const ownerId = randomUUID();
const branchIds: string[] = [];
const songIds: string[] = [];
const listIds: string[] = [];
let A: string;
let B: string;
let hymn: string; // 6 setlists at A → high; manual 'none' + 3 setlists at B → stays manual
let anthem: string; // 2 setlists at A (+ ones that mustn't count) → low; stale derived at B → removed
let chant: string; // 1 setlist at A, listed twice in it → rare
let retired: string; // soft-deleted song in a setlist at A → no row

/** Random 3-letter code starting with Z, so it can't clash with seeded branches. */
function code(): string {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const pick = () => letters[Math.floor(Math.random() * letters.length)];
  return `Z${pick()}${pick()}`;
}

async function addList(
  branchId: string | null,
  items: string[],
  opts: { type?: 'setlist' | 'playlist'; eventDate?: string | null; deleted?: boolean } = {},
) {
  const type = opts.type ?? 'setlist';
  const [list] = await getDb()
    .insert(lists)
    .values({
      type,
      name: `BR-03 ${type} ${listIds.length}`,
      eventDate: opts.eventDate === undefined ? IN_WINDOW : opts.eventDate,
      ownerId,
      branchId,
      deletedAt: opts.deleted ? new Date() : null,
    })
    .returning({ id: lists.id });
  listIds.push(list!.id);
  await getDb()
    .insert(listItems)
    .values(items.map((songId, position) => ({ listId: list!.id, songId, position })));
}

async function usage() {
  const rows = await getDb()
    .select({
      songId: branchUsage.songId,
      branchId: branchUsage.branchId,
      level: branchUsage.level,
      source: branchUsage.source,
    })
    .from(branchUsage)
    .where(inArray(branchUsage.songId, songIds));
  return Object.fromEntries(
    rows.map((r) => [`${r.songId}:${r.branchId}`, { level: r.level, source: r.source }]),
  );
}

beforeAll(async () => {
  const email = `${ownerId}@example.test`;
  await getDb().execute(sql`insert into auth.users (id, email) values (${ownerId}, ${email})`);
  await getDb()
    .insert(users)
    .values({ id: ownerId, email, name: 'BR-03 test', authProvider: 'password' });

  const codes: string[] = [];
  while (codes.length < 2) {
    const c = code();
    if (!codes.includes(c)) codes.push(c);
  }
  const inserted = await getDb()
    .insert(branches)
    .values(codes.map((c) => ({ name: `BR-03 ${c} ${ownerId}`, code: c })))
    .returning({ id: branches.id, code: branches.code });
  for (const c of codes) branchIds.push(inserted.find((b) => b.code === c)!.id);
  [A, B] = branchIds as [string, string];

  const made = await getDb()
    .insert(songs)
    .values([
      { title: `BR-03 hymn ${ownerId}` },
      { title: `BR-03 anthem ${ownerId}` },
      { title: `BR-03 chant ${ownerId}` },
      { title: `BR-03 retired ${ownerId}`, deletedAt: new Date() },
    ])
    .returning({ id: songs.id });
  songIds.push(...made.map((s) => s.id));
  [hymn, anthem, chant, retired] = songIds as [string, string, string, string];

  // Branch A.
  for (let i = 0; i < 6; i++) await addList(A, [hymn]);
  await addList(A, [anthem, chant, chant, retired]);
  await addList(A, [anthem], { eventDate: '2026-06-15' }); // today: counts
  await addList(A, [anthem], { eventDate: '2025-06-15' }); // 366 days ago: too old
  await addList(A, [anthem], { eventDate: '2026-06-16' }); // tomorrow: planned, not used
  await addList(A, [anthem], { deleted: true });
  await addList(A, [anthem], { type: 'playlist', eventDate: null });
  await addList(null, [anthem]); // no branch

  // Branch B.
  for (let i = 0; i < 3; i++) await addList(B, [hymn]);
  await getDb()
    .insert(branchUsage)
    .values([
      { songId: hymn, branchId: B, level: 'none', source: 'manual' },
      { songId: anthem, branchId: B, level: 'high', source: 'derived' },
    ]);
});

afterAll(async () => {
  await getDb().delete(lists).where(inArray(lists.id, listIds)); // cascades items
  await getDb().delete(songs).where(inArray(songs.id, songIds)); // cascades usage
  await getDb().delete(branches).where(inArray(branches.id, branchIds));
  await getDb().execute(sql`delete from auth.users where id = ${ownerId}`);
  await getDb().$client.end();
});

test('derives levels from setlist history without touching manual rows', async () => {
  const { updated } = await runUsageJob(NOW);
  // At least: 3 inserts at A + 1 stale derived row deleted at B.
  expect(updated).toBeGreaterThanOrEqual(4);

  expect(await usage()).toEqual({
    [`${hymn}:${A}`]: { level: 'high', source: 'derived' },
    [`${anthem}:${A}`]: { level: 'low', source: 'derived' },
    [`${chant}:${A}`]: { level: 'rare', source: 'derived' },
    [`${hymn}:${B}`]: { level: 'none', source: 'manual' },
  });
});

test('a second run with no new history changes nothing', async () => {
  expect(await runUsageJob(NOW)).toEqual({ updated: 0 });
});

test('updates a changed derived level and still skips manual rows', async () => {
  // Two more setlists at A make the chant 'low'; the manual hymn row at B stays.
  await addList(A, [chant, hymn]);
  await addList(B, [hymn]);
  await getDb()
    .update(branchUsage)
    .set({ level: 'rare' })
    .where(and(eq(branchUsage.songId, hymn), eq(branchUsage.branchId, B)));

  const { updated } = await runUsageJob(NOW);
  expect(updated).toBe(1);

  const rows = await usage();
  expect(rows[`${chant}:${A}`]).toEqual({ level: 'low', source: 'derived' });
  expect(rows[`${hymn}:${A}`]).toEqual({ level: 'high', source: 'derived' });
  expect(rows[`${hymn}:${B}`]).toEqual({ level: 'rare', source: 'manual' });
});

test('drops derived rows whose history falls out of the window', async () => {
  // A year later every setlist above is too old, except the one that was dated
  // "tomorrow" (2026-06-16), which is now inside the window.
  await runUsageJob(new Date('2027-06-15T17:00:00Z'));
  expect(await usage()).toEqual({
    [`${anthem}:${A}`]: { level: 'rare', source: 'derived' },
    [`${hymn}:${B}`]: { level: 'rare', source: 'manual' },
  });
});
