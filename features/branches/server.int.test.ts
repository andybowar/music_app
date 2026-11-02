// @vitest-environment node
// Integration (BR-01): branch activity against the local Supabase database. Needs migrations
// applied (`pnpm db:start && pnpm db:migrate`). CI exports the stack's env; locally it comes
// from .env.local, which Vitest doesn't load on its own.
//
// The suite seeds two fresh branches with dated setlists relative to today (so the 90-day
// window never drifts), and only asserts on those branches: other suites share the database.
import type { AppUser, Role } from '@/types/domain';

import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';

vi.mock('server-only', () => ({}));

if (!process.env.DATABASE_URL && existsSync('.env.local')) process.loadEnvFile('.env.local');

let actor: AppUser | null = null;
vi.mock('@/lib/auth', () => ({
  requireUser: async () => {
    if (!actor) throw Object.assign(new Error('signed out'), { code: 'UNAUTHENTICATED' });
    return actor;
  },
}));

const { eq, inArray, sql } = await import('drizzle-orm');
const { branches, composers, listItems, lists, resources, songComposers, songKeys, songs, users } =
  await import('@/db/schema');
const { getDb } = await import('@/lib/db');
const { getBranchActivity, RECENT_LIMIT, TOP_LIMIT } = await import('./server');

const tag = randomUUID().slice(0, 8);
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const code = () =>
  Array.from({ length: 3 }, () => LETTERS[Math.floor(Math.random() * 26)]).join('');

let branchA: { id: string; code: string };
let branchB: { id: string; code: string };
let leaderA: AppUser;
let memberB: AppUser;
const songIds: string[] = [];
const listIds: string[] = [];
const composerIds: string[] = [];

function makeUser(name: string, role: Role, branchId: string | null): AppUser {
  const id = randomUUID();
  return {
    id,
    email: `${id}@example.test`,
    name: `BR-01 ${name} ${tag}`,
    branchId,
    role,
    authProvider: 'password',
    disabledAt: null,
    accessStatus: 'approved',
  };
}

/** `YYYY-MM-DD`, `days` from today (UTC, like Postgres `current_date` in the test DB). */
function dayOffset(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

async function makeSong(
  title: string,
  opts: { branchId?: string | null; createdDaysAgo?: number; deleted?: boolean } = {},
) {
  const [song] = await getDb()
    .insert(songs)
    .values({
      title: `${title} ${tag}`,
      tempoBpm: 80,
      energyLevel: 'mid_worship',
      addedByBranchId: opts.branchId ?? null,
      createdAt: daysAgo(opts.createdDaysAgo ?? 200),
      deletedAt: opts.deleted ? new Date() : null,
    })
    .returning({ id: songs.id });
  songIds.push(song!.id);
  return song!.id;
}

async function makeSetlist(
  owner: AppUser,
  offsetDays: number,
  songsOnIt: string[],
  opts: { deleted?: boolean; type?: 'setlist' | 'playlist'; name?: string } = {},
) {
  const type = opts.type ?? 'setlist';
  const [row] = await getDb()
    .insert(lists)
    .values({
      type,
      name: opts.name ?? `BR-01 ${offsetDays} ${tag}`,
      eventDate: type === 'setlist' ? dayOffset(offsetDays) : null,
      ownerId: owner.id,
      branchId: owner.branchId,
      deletedAt: opts.deleted ? new Date() : null,
    })
    .returning({ id: lists.id });
  listIds.push(row!.id);
  if (songsOnIt.length) {
    await getDb()
      .insert(listItems)
      .values(songsOnIt.map((songId, position) => ({ listId: row!.id, songId, position })));
  }
  return row!.id;
}

// Songs and lists, filled in beforeAll.
const s: Record<string, string> = {};
const l: Record<string, string> = {};

beforeAll(async () => {
  const codes = new Set<string>();
  while (codes.size < 2) codes.add(code());
  const [a, b] = [...codes];
  const inserted = await getDb()
    .insert(branches)
    .values([
      { name: `BR-01 A ${tag}`, code: a! },
      { name: `BR-01 B ${tag}`, code: b! },
    ])
    .returning({ id: branches.id, code: branches.code });
  branchA = inserted.find((r) => r.code === a)!;
  branchB = inserted.find((r) => r.code === b)!;

  leaderA = makeUser('leader A', 'music_leader', branchA.id);
  memberB = makeUser('member B', 'member', branchB.id);
  for (const u of [leaderA, memberB]) {
    await getDb().execute(sql`insert into auth.users (id, email) values (${u.id}, ${u.email})`);
    await getDb().insert(users).values({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      branchId: u.branchId,
      authProvider: 'password',
      accessStatus: 'approved',
    });
  }

  // Recently added by A: newest first; one too old, one deleted.
  s.newA = await makeSong('New A', { branchId: branchA.id, createdDaysAgo: 1 });
  s.olderA = await makeSong('Older A', { branchId: branchA.id, createdDaysAgo: 30 });
  s.edgeA = await makeSong('Edge A', { branchId: branchA.id, createdDaysAgo: 89 });
  s.staleA = await makeSong('Stale A', { branchId: branchA.id, createdDaysAgo: 120 });
  s.deletedA = await makeSong('Deleted A', {
    branchId: branchA.id,
    createdDaysAgo: 2,
    deleted: true,
  });
  // Added by B, recently.
  s.newB = await makeSong('New B', { branchId: branchB.id, createdDaysAgo: 3 });
  // Old library songs used on setlists.
  s.alpha = await makeSong('Alpha');
  s.bravo = await makeSong('Bravo');
  s.charlie = await makeSong('Charlie');
  s.gone = await makeSong('Gone', { deleted: true });

  // Summary columns on `alpha`: primary key, composers in order, a resource.
  const keyRows = await getDb()
    .insert(songKeys)
    .values([
      { songId: s.alpha, key: 'G', isPrimary: true },
      { songId: s.alpha, key: 'A', isPrimary: false },
    ])
    .returning({ id: songKeys.id, key: songKeys.key });
  const comp = await getDb()
    .insert(composers)
    .values([{ name: `Zed ${tag}` }, { name: `Amy ${tag}`, popMember: 'current' }])
    .returning({ id: composers.id, name: composers.name });
  composerIds.push(...comp.map((c) => c.id));
  await getDb()
    .insert(songComposers)
    .values([
      { songId: s.alpha, composerId: comp.find((c) => c.name.startsWith('Zed'))!.id, sortOrder: 0 },
      { songId: s.alpha, composerId: comp.find((c) => c.name.startsWith('Amy'))!.id, sortOrder: 1 },
    ]);
  await getDb()
    .insert(resources)
    .values({
      songId: s.alpha,
      songKeyId: keyRows.find((k) => k.key === 'G')!.id,
      kind: 'lead_sheet',
      format: 'url',
      label: 'Link',
      url: 'https://example.test/x',
    });

  // A's dated setlists. Window (90 days, up to today): alpha ×3 (twice on one list), bravo ×2,
  // charlie ×1, gone ×2 (deleted song). Outside it: old (100 days ago), future, deleted list.
  l.today = await makeSetlist(leaderA, 0, [s.alpha, s.bravo, s.gone]);
  l.past10 = await makeSetlist(leaderA, -10, [s.alpha, s.alpha, s.charlie, s.gone]);
  l.past89 = await makeSetlist(leaderA, -89, [s.alpha, s.bravo]);
  l.past100 = await makeSetlist(leaderA, -100, [s.charlie, s.charlie, s.charlie]);
  l.deletedPast = await makeSetlist(leaderA, -5, [s.charlie], { deleted: true });
  // Upcoming for A, created out of date order; one deleted, one playlist.
  l.in14 = await makeSetlist(leaderA, 14, [s.charlie, s.charlie, s.charlie, s.bravo]);
  l.in3 = await makeSetlist(leaderA, 3, [s.charlie]);
  l.deletedFuture = await makeSetlist(leaderA, 1, [s.charlie], { deleted: true });
  l.playlist = await makeSetlist(leaderA, 0, [s.charlie], { type: 'playlist' });

  // B: one past setlist, one upcoming.
  l.bPast = await makeSetlist(memberB, -1, [s.charlie]);
  l.bFuture = await makeSetlist(memberB, 7, [s.alpha]);
});

afterAll(async () => {
  const db = getDb();
  if (listIds.length) await db.delete(lists).where(inArray(lists.id, listIds));
  if (songIds.length) await db.delete(songs).where(inArray(songs.id, songIds));
  if (composerIds.length) await db.delete(composers).where(inArray(composers.id, composerIds));
  for (const u of [leaderA, memberB]) {
    if (!u) continue;
    await db.delete(users).where(eq(users.id, u.id));
    await db.execute(sql`delete from auth.users where id = ${u.id}`);
  }
  if (branchA) await db.delete(branches).where(inArray(branches.id, [branchA.id, branchB.id]));
  await db.$client.end();
});

async function activityFor(branchId: string, days?: number) {
  const all = await getBranchActivity(days === undefined ? {} : { days });
  const entry = all.find((a) => a.branch.id === branchId);
  if (!entry) throw new Error(`no activity for branch ${branchId}`);
  return { all, entry };
}

describe('getBranchActivity', () => {
  test('rejects a signed-out caller', async () => {
    actor = null;
    await expect(getBranchActivity()).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  });

  test('one entry per branch, ordered by name, with branch fields', async () => {
    actor = memberB;
    const all = await getBranchActivity();
    const ours = all.filter((a) => a.branch.id === branchA.id || a.branch.id === branchB.id);
    expect(ours.map((a) => a.branch)).toEqual([
      { id: branchA.id, name: `BR-01 A ${tag}`, code: branchA.code, ssoGroup: null },
      { id: branchB.id, name: `BR-01 B ${tag}`, code: branchB.code, ssoGroup: null },
    ]);
    expect(new Set(all.map((a) => a.branch.id)).size).toBe(all.length);
  });

  test('recently added: live songs added by the branch within the window, newest first', async () => {
    actor = memberB;
    const { entry: a } = await activityFor(branchA.id);
    expect(a.recentlyAdded.map((x) => x.id)).toEqual([s.newA, s.olderA, s.edgeA]);
    expect(a.recentlyAdded[0]).toMatchObject({
      title: `New A ${tag}`,
      addedByBranchCode: branchA.code,
      tempoBpm: 80,
      energyLevel: 'mid_worship',
      primaryKey: null,
      composers: [],
      resourceCount: 0,
    });
    expect(a.recentlyAdded[0]!.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

    const { entry: b } = await activityFor(branchB.id);
    expect(b.recentlyAdded.map((x) => x.id)).toEqual([s.newB]);
  });

  test('the window narrows recently added and top songs', async () => {
    actor = memberB;
    const { entry: a } = await activityFor(branchA.id, 20);
    expect(a.recentlyAdded.map((x) => x.id)).toEqual([s.newA]);
    // Only today's and 10-days-ago setlists count now.
    expect(a.topSongs.map((x) => [x.id, x.count])).toEqual([
      [s.alpha, 2],
      [s.bravo, 1],
      [s.charlie, 1],
    ]);
  });

  test('upcoming: live setlists from today on, soonest first, as List', async () => {
    actor = memberB;
    const { entry: a } = await activityFor(branchA.id);
    expect(a.upcoming.map((x) => x.id)).toEqual([l.today, l.in3, l.in14]);
    expect(a.upcoming[2]).toMatchObject({
      type: 'setlist',
      name: `BR-01 14 ${tag}`,
      eventDate: dayOffset(14),
      ownerId: leaderA.id,
      ownerName: leaderA.name,
      branchId: branchA.id,
      branchCode: branchA.code,
      itemCount: 4,
    });
    expect(a.upcoming[2]!.createdAt).toMatch(/Z$/);
    expect(a.upcoming[2]!.updatedAt).toMatch(/Z$/);

    const { entry: b } = await activityFor(branchB.id);
    expect(b.upcoming.map((x) => x.id)).toEqual([l.bFuture]);
  });

  test('top songs: distinct live setlists in the last 90 days up to today, most used first', async () => {
    actor = leaderA;
    const { entry: a } = await activityFor(branchA.id);
    expect(a.topSongs.map((x) => [x.id, x.count])).toEqual([
      [s.alpha, 3],
      [s.bravo, 2],
      [s.charlie, 1],
    ]);
    expect(a.topSongs[0]).toMatchObject({
      title: `Alpha ${tag}`,
      primaryKey: 'G',
      composers: [
        { name: `Zed ${tag}`, popMember: 'none' },
        { name: `Amy ${tag}`, popMember: 'current' },
      ],
      addedByBranchCode: null,
      resourceCount: 1,
    });

    const { entry: b } = await activityFor(branchB.id);
    expect(b.topSongs.map((x) => [x.id, x.count])).toEqual([[s.charlie, 1]]);
  });

  test('limits per branch', async () => {
    actor = memberB;
    const { all } = await activityFor(branchA.id);
    for (const a of all) {
      expect(a.recentlyAdded.length).toBeLessThanOrEqual(RECENT_LIMIT);
      expect(a.topSongs.length).toBeLessThanOrEqual(TOP_LIMIT);
    }
  });
});
