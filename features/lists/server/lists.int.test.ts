// @vitest-environment node
// Integration: needs local Supabase (`pnpm db:start`). CI sets the env vars; locally
// they come from .env.local, which Vitest doesn't load on its own.
import type { AppUser, List, Role } from '@/types/domain';

import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('server-only', () => ({}));

if (!process.env.DATABASE_URL && existsSync('.env.local')) process.loadEnvFile('.env.local');

const { eq, inArray, sql } = await import('drizzle-orm');
const { branches, listItems, lists, songKeys, songs, users } = await import('@/db/schema');
const { getDb } = await import('@/lib/db');

let actor: AppUser;
vi.mock('@/lib/auth', () => ({ requireUser: async () => actor }));

const { createList, deleteList, getList, listLists, renameList } = await import('./lists');

const tag = randomUUID().slice(0, 8);
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const code = () =>
  Array.from({ length: 3 }, () => LETTERS[Math.floor(Math.random() * 26)]).join('');

let branchA: { id: string; code: string };
let branchB: { id: string; code: string };

function makeUser(name: string, role: Role, branchId: string | null): AppUser {
  const id = randomUUID();
  return {
    id,
    email: `${id}@example.test`,
    name: `LIST-01 ${name} ${tag}`,
    branchId,
    role,
    authProvider: 'password',
    disabledAt: null,
    accessStatus: 'approved',
  };
}

let owner: AppUser; // member, branch A
let sameBranch: AppUser; // member, branch A
let leaderA: AppUser; // music leader, branch A
let leaderB: AppUser; // music leader, branch B
let admin: AppUser;
let allUsers: AppUser[];

const songIds: string[] = [];
const listIds: string[] = [];

/** `YYYY-MM-DD`, `days` from today (UTC, like Postgres `current_date` in the test DB). */
function dayOffset(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function insertList(
  type: 'setlist' | 'playlist',
  ownerUser: AppUser,
  eventDate: string | null = type === 'setlist' ? dayOffset(7) : null,
  name = `LIST-01 ${type} ${tag}`,
) {
  const [row] = await getDb()
    .insert(lists)
    .values({ type, name, eventDate, ownerId: ownerUser.id, branchId: ownerUser.branchId })
    .returning({ id: lists.id });
  listIds.push(row!.id);
  return row!.id;
}

async function makeSong(title: string, deleted = false) {
  const [song] = await getDb()
    .insert(songs)
    .values({ title: `${title} ${tag}`, tempoBpm: 80, deletedAt: deleted ? new Date() : null })
    .returning({ id: songs.id });
  songIds.push(song!.id);
  return song!.id;
}

const ids = (rows: List[]) => rows.map((l) => l.id).filter((id) => listIds.includes(id));

beforeAll(async () => {
  const codes = new Set<string>();
  while (codes.size < 2) codes.add(code());
  const [a, b] = [...codes];
  const inserted = await getDb()
    .insert(branches)
    .values([
      { name: `LIST-01 A ${tag}`, code: a! },
      { name: `LIST-01 B ${tag}`, code: b! },
    ])
    .returning({ id: branches.id, code: branches.code });
  branchA = inserted.find((r) => r.code === a)!;
  branchB = inserted.find((r) => r.code === b)!;

  owner = makeUser('owner', 'member', branchA.id);
  sameBranch = makeUser('same branch', 'member', branchA.id);
  leaderA = makeUser('leader A', 'music_leader', branchA.id);
  leaderB = makeUser('leader B', 'music_leader', branchB.id);
  admin = makeUser('admin', 'admin', null);
  allUsers = [owner, sameBranch, leaderA, leaderB, admin];

  for (const u of allUsers) {
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
});

afterAll(async () => {
  if (listIds.length) await getDb().delete(lists).where(inArray(lists.id, listIds));
  if (songIds.length) await getDb().delete(songs).where(inArray(songs.id, songIds));
  for (const u of allUsers ?? []) {
    await getDb().delete(users).where(eq(users.id, u.id));
    await getDb().execute(sql`delete from auth.users where id = ${u.id}`);
  }
  if (branchA)
    await getDb()
      .delete(branches)
      .where(inArray(branches.id, [branchA.id, branchB.id]));
  await getDb().$client.end();
});

beforeEach(() => {
  actor = owner;
});

describe('createList', () => {
  test("creates a setlist owned by the caller, tagged with the caller's branch", async () => {
    const result = await createList({
      type: 'setlist',
      name: '  Sunday  ',
      eventDate: dayOffset(3),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    listIds.push(result.data.id);
    expect(result.data).toMatchObject({
      type: 'setlist',
      name: 'Sunday',
      eventDate: dayOffset(3),
      ownerId: owner.id,
      ownerName: owner.name,
      branchId: branchA.id,
      branchCode: branchA.code,
      itemCount: 0,
    });
  });

  test('a playlist may have no date; a user without a branch gets null branch fields', async () => {
    actor = admin;
    const result = await createList({ type: 'playlist', name: 'Practice' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    listIds.push(result.data.id);
    expect(result.data).toMatchObject({ eventDate: null, branchId: null, branchCode: null });
  });

  test('a setlist without a date is a validation error', async () => {
    const result = await createList({ type: 'setlist', name: 'No date' });
    expect(result).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
  });
});

describe('getList', () => {
  test('resolves items in order, with overrides, keeping soft-deleted songs', async () => {
    const songA = await makeSong('LIST-01 A');
    const songB = await makeSong('LIST-01 B', true);
    await getDb()
      .insert(songKeys)
      .values({ songId: songA, key: 'D', isPrimary: true, chorusChord: 'G' });
    const listId = await insertList('setlist', owner);
    await getDb()
      .insert(listItems)
      .values([
        { listId, songId: songB, position: 1 },
        { listId, songId: songA, position: 0, overrideKey: 'E', overrideBpm: 100 },
      ]);

    actor = sameBranch;
    const list = await getList(listId);
    expect(list).not.toBeNull();
    expect(list!.itemCount).toBe(2);
    expect(list!.ownerName).toBe(owner.name);
    expect(list!.items.map((i) => i.song.id)).toEqual([songA, songB]);
    const [first, second] = list!.items;
    expect(first).toMatchObject({
      key: 'E',
      bpm: 100,
      isOverridden: { key: true, bpm: true, energy: false },
      needsUpload: true,
      firstChords: { chorus: 'X' },
    });
    expect(first!.song.primaryKey).toBe('D');
    expect(second).toMatchObject({ key: null, bpm: 80, needsUpload: false });
  });

  test("a member cannot read another user's playlist; an admin can", async () => {
    const listId = await insertList('playlist', owner);
    expect(await getList(listId)).not.toBeNull();
    actor = sameBranch;
    expect(await getList(listId)).toBeNull();
    actor = admin;
    expect(await getList(listId)).not.toBeNull();
  });

  test('any member can read any setlist, even from another branch', async () => {
    const listId = await insertList('setlist', leaderB);
    expect((await getList(listId))?.branchCode).toBe(branchB.code);
  });

  test('null for unknown and soft-deleted lists', async () => {
    expect(await getList(randomUUID())).toBeNull();
    const listId = await insertList('setlist', owner);
    await getDb().update(lists).set({ deletedAt: new Date() }).where(eq(lists.id, listId));
    expect(await getList(listId)).toBeNull();
  });
});

describe('listLists', () => {
  let past: string;
  let farPast: string;
  let today: string;
  let soon: string;
  let later: string;
  let ownPlaylist: string;
  let othersPlaylist: string;
  let otherBranchSetlist: string;
  let deleted: string;

  beforeAll(async () => {
    farPast = await insertList('setlist', owner, dayOffset(-30));
    later = await insertList('setlist', owner, dayOffset(30));
    past = await insertList('setlist', sameBranch, dayOffset(-1));
    today = await insertList('setlist', sameBranch, dayOffset(0));
    soon = await insertList('setlist', owner, dayOffset(2));
    ownPlaylist = await insertList('playlist', owner);
    othersPlaylist = await insertList('playlist', sameBranch);
    otherBranchSetlist = await insertList('setlist', leaderB, dayOffset(1));
    deleted = await insertList('setlist', owner, dayOffset(5));
    await getDb().update(lists).set({ deletedAt: new Date() }).where(eq(lists.id, deleted));
  });

  test('upcoming events first (soonest first), then past (latest first)', async () => {
    const result = ids(await listLists({ type: 'setlist', scope: 'branch' }));
    const mine = [farPast, later, past, today, soon];
    expect(result.filter((id) => mine.includes(id))).toEqual([today, soon, later, past, farPast]);
  });

  test('upcomingFirst false sorts by event date, newest first', async () => {
    const result = ids(await listLists({ type: 'setlist', scope: 'mine', upcomingFirst: false }));
    expect(result.filter((id) => [farPast, later, soon].includes(id))).toEqual([
      later,
      soon,
      farPast,
    ]);
  });

  test('mine: only the caller’s lists, both types when type is omitted', async () => {
    const all = await listLists({ scope: 'mine' });
    // Every list returned, from any suite, is the caller's own.
    expect(all.length).toBeGreaterThan(0);
    expect(all.every((l) => l.ownerId === owner.id)).toBe(true);

    // Earlier describes in this file also create lists for `owner`, so compare only the
    // lists this describe created.
    const created = [farPast, later, past, today, soon, ownPlaylist, othersPlaylist];
    const result = ids(all).filter((id) => created.includes(id));
    expect(result).toEqual([soon, later, farPast, ownPlaylist]);
    expect(result).not.toContain(deleted);
  });

  test("branch: the caller's lists and their branch's setlists, not others' playlists", async () => {
    const result = ids(await listLists({ scope: 'branch' }));
    expect(result).toEqual(expect.arrayContaining([past, today, ownPlaylist]));
    expect(result).not.toContain(othersPlaylist);
    expect(result).not.toContain(otherBranchSetlist);
    expect(result).not.toContain(deleted);
  });

  test('all: setlists from every branch, never another user’s playlist', async () => {
    const result = ids(await listLists({ scope: 'all' }));
    expect(result).toEqual(expect.arrayContaining([otherBranchSetlist, ownPlaylist, past]));
    expect(result).not.toContain(othersPlaylist);
    expect(result).not.toContain(deleted);

    const playlists = ids(await listLists({ type: 'playlist', scope: 'all' }));
    expect(playlists).not.toContain(othersPlaylist);
    expect(playlists).toContain(ownPlaylist);
  });

  test('an admin sees every playlist', async () => {
    actor = admin;
    const result = ids(await listLists({ type: 'playlist', scope: 'all' }));
    expect(result).toEqual(expect.arrayContaining([ownPlaylist, othersPlaylist]));
  });
});

describe('renameList', () => {
  test('the owner renames and moves the date', async () => {
    const listId = await insertList('setlist', owner);
    expect(await renameList(listId, 'Easter', dayOffset(10))).toEqual({
      ok: true,
      data: undefined,
    });
    const [row] = await getDb().select().from(lists).where(eq(lists.id, listId));
    expect(row).toMatchObject({ name: 'Easter', eventDate: dayOffset(10) });
  });

  test('a same-branch music leader can rename a setlist; leaders elsewhere cannot', async () => {
    const listId = await insertList('setlist', owner);
    actor = leaderB;
    expect(await renameList(listId, 'Nope')).toMatchObject({
      ok: false,
      error: { code: 'FORBIDDEN' },
    });
    actor = leaderA;
    expect((await renameList(listId, 'Leader edit')).ok).toBe(true);
    const [row] = await getDb().select().from(lists).where(eq(lists.id, listId));
    expect(row!.name).toBe('Leader edit');
    expect(row!.eventDate).toBe(dayOffset(7));
  });

  test("another user's playlist is NOT_FOUND, even for a same-branch leader", async () => {
    const listId = await insertList('playlist', owner);
    actor = leaderA;
    expect(await renameList(listId, 'x')).toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND' },
    });
  });

  test('clearing a setlist date is a validation error; a playlist date may be cleared', async () => {
    const setlist = await insertList('setlist', owner);
    expect(await renameList(setlist, 'x', null)).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION' },
    });
    const playlist = await insertList('playlist', owner, dayOffset(1));
    expect((await renameList(playlist, 'x', null)).ok).toBe(true);
    const [row] = await getDb().select().from(lists).where(eq(lists.id, playlist));
    expect(row!.eventDate).toBeNull();
  });
});

describe('deleteList', () => {
  test('soft-deletes: the row stays, reads stop returning it', async () => {
    const listId = await insertList('setlist', owner);
    expect(await deleteList(listId)).toEqual({ ok: true, data: undefined });
    const [row] = await getDb().select().from(lists).where(eq(lists.id, listId));
    expect(row!.deletedAt).not.toBeNull();
    expect(await getList(listId)).toBeNull();
    expect(ids(await listLists({ scope: 'mine' }))).not.toContain(listId);
    expect(await deleteList(listId)).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
  });

  test("a member cannot delete another member's setlist", async () => {
    const listId = await insertList('setlist', owner);
    actor = sameBranch;
    expect(await deleteList(listId)).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
  });
});
