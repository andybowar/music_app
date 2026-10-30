// @vitest-environment node
// Integration: needs local Supabase (`pnpm db:start`). CI sets the env vars; locally
// they come from .env.local, which Vitest doesn't load on its own.
import type { AppUser, Role } from '@/types/domain';

import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('server-only', () => ({}));

function makeUser(name: string, role: Role, branchId: string | null = null): AppUser {
  const id = randomUUID();
  return {
    id,
    email: `${id}@example.test`,
    name,
    branchId,
    role,
    authProvider: 'password',
    disabledAt: null,
    accessStatus: 'approved',
  };
}

const owner = makeUser('LIST-02 owner', 'member');
const stranger = makeUser('LIST-02 stranger', 'member');
const admin = makeUser('LIST-02 admin', 'admin');
const allUsers = [owner, stranger, admin];

let actor: AppUser = owner;
vi.mock('@/lib/auth', () => ({ requireUser: async () => actor }));

if (!process.env.DATABASE_URL && existsSync('.env.local')) process.loadEnvFile('.env.local');

const { asc, eq, inArray, sql } = await import('drizzle-orm');
const { listItems, lists, resources, songKeys, songs, users } = await import('@/db/schema');
const { getDb } = await import('@/lib/db');
const { addListItem, removeListItem, reorderList, updateListItem } = await import('./items');

const songIds: string[] = [];
const listIds: string[] = [];
let songA: string;
let songB: string;
let songC: string;
let audioA: string;
let videoA: string;
let chartA: string;
let audioB: string;

async function makeSong(title: string) {
  const [song] = await getDb()
    .insert(songs)
    .values({ title: `${title} ${owner.id}` })
    .returning({ id: songs.id });
  songIds.push(song!.id);
  return song!.id;
}

async function makeResource(
  songId: string,
  kind: 'audio' | 'video_link' | 'chord_chart',
): Promise<string> {
  const [key] = await getDb()
    .insert(songKeys)
    .values({ songId, key: 'D', isPrimary: false })
    .onConflictDoNothing()
    .returning({ id: songKeys.id });
  const keyId =
    key?.id ??
    (
      await getDb().select({ id: songKeys.id }).from(songKeys).where(eq(songKeys.songId, songId))
    )[0]!.id;
  const [row] = await getDb()
    .insert(resources)
    .values(
      kind === 'chord_chart'
        ? { songId, songKeyId: keyId, kind, format: 'pdf', label: 'Chart', storagePath: 'x.pdf' }
        : {
            songId,
            songKeyId: keyId,
            kind,
            format: 'url',
            label: kind,
            url: 'https://example.com',
          },
    )
    .returning({ id: resources.id });
  return row!.id;
}

async function makeList(type: 'setlist' | 'playlist', ownerId = owner.id) {
  const [row] = await getDb()
    .insert(lists)
    .values({
      type,
      name: `LIST-02 ${type}`,
      eventDate: type === 'setlist' ? '2026-11-01' : null,
      ownerId,
    })
    .returning({ id: lists.id });
  listIds.push(row!.id);
  return row!.id;
}

async function positions(listId: string) {
  return getDb()
    .select({ id: listItems.id, songId: listItems.songId, position: listItems.position })
    .from(listItems)
    .where(eq(listItems.listId, listId))
    .orderBy(asc(listItems.position));
}

async function add(listId: string, songId: string) {
  const result = await addListItem(listId, songId);
  if (!result.ok) throw new Error(result.error.message);
  return result.data;
}

beforeAll(async () => {
  for (const u of allUsers) {
    await getDb().execute(sql`insert into auth.users (id, email) values (${u.id}, ${u.email})`);
    await getDb()
      .insert(users)
      .values({ id: u.id, email: u.email, name: u.name, role: u.role, authProvider: 'password' });
  }
  songA = await makeSong('LIST-02 A');
  songB = await makeSong('LIST-02 B');
  songC = await makeSong('LIST-02 C');
  audioA = await makeResource(songA, 'audio');
  videoA = await makeResource(songA, 'video_link');
  chartA = await makeResource(songA, 'chord_chart');
  audioB = await makeResource(songB, 'audio');
});

afterAll(async () => {
  if (listIds.length) await getDb().delete(lists).where(inArray(lists.id, listIds));
  if (songIds.length) await getDb().delete(songs).where(inArray(songs.id, songIds));
  for (const u of allUsers) await getDb().execute(sql`delete from auth.users where id = ${u.id}`);
  await getDb().$client.end();
});

beforeEach(() => {
  actor = owner;
});

describe('addListItem', () => {
  test('appends at the next position and returns the item', async () => {
    const listId = await makeList('playlist');
    const first = await add(listId, songA);
    const second = await add(listId, songB);
    expect(first).toMatchObject({ listId, songId: songA, position: 0, overrideKey: null });
    expect(second.position).toBe(1);
  });

  test('allows the same song twice', async () => {
    const listId = await makeList('setlist');
    await add(listId, songA);
    expect((await add(listId, songA)).position).toBe(1);
  });

  test('NOT_FOUND for an unknown or soft-deleted song', async () => {
    const listId = await makeList('playlist');
    const missing = await addListItem(listId, randomUUID());
    expect(missing.ok === false && missing.error.code).toBe('NOT_FOUND');

    const gone = await makeSong('LIST-02 deleted');
    await getDb().update(songs).set({ deletedAt: new Date() }).where(eq(songs.id, gone));
    const deleted = await addListItem(listId, gone);
    expect(deleted.ok === false && deleted.error.code).toBe('NOT_FOUND');
  });

  test('NOT_FOUND for a soft-deleted list', async () => {
    const listId = await makeList('setlist');
    await getDb().update(lists).set({ deletedAt: new Date() }).where(eq(lists.id, listId));
    const result = await addListItem(listId, songA);
    expect(result.ok === false && result.error.code).toBe('NOT_FOUND');
  });

  test("another member's playlist looks missing; their setlist is denied", async () => {
    const playlist = await makeList('playlist');
    const setlist = await makeList('setlist');
    actor = stranger;
    const hidden = await addListItem(playlist, songA);
    expect(hidden.ok === false && hidden.error.code).toBe('NOT_FOUND');
    const denied = await addListItem(setlist, songA);
    expect(denied.ok).toBe(false);
    expect(await positions(setlist)).toHaveLength(0);
  });

  test('an admin may add to anyone’s list', async () => {
    const listId = await makeList('playlist');
    actor = admin;
    expect((await addListItem(listId, songA)).ok).toBe(true);
  });

  test('concurrent adds keep positions contiguous', async () => {
    const listId = await makeList('setlist');
    const results = await Promise.all(
      [songA, songB, songC, songA, songB].map((s) => addListItem(listId, s)),
    );
    expect(results.every((r) => r.ok)).toBe(true);
    expect((await positions(listId)).map((r) => r.position)).toEqual([0, 1, 2, 3, 4]);
  });
});

describe('removeListItem', () => {
  test('deletes the item and closes the gap', async () => {
    const listId = await makeList('setlist');
    const a = await add(listId, songA);
    const b = await add(listId, songB);
    const c = await add(listId, songC);
    expect(await removeListItem(b.id)).toEqual({ ok: true, data: undefined });
    expect(await positions(listId)).toEqual([
      { id: a.id, songId: songA, position: 0 },
      { id: c.id, songId: songC, position: 1 },
    ]);
  });

  test('NOT_FOUND for an unknown item; denied for a non-owner', async () => {
    const missing = await removeListItem(randomUUID());
    expect(missing.ok === false && missing.error.code).toBe('NOT_FOUND');

    const listId = await makeList('setlist');
    const item = await add(listId, songA);
    actor = stranger;
    expect((await removeListItem(item.id)).ok).toBe(false);
    expect(await positions(listId)).toHaveLength(1);
  });
});

describe('reorderList', () => {
  test('sets positions from the given order', async () => {
    const listId = await makeList('setlist');
    const a = await add(listId, songA);
    const b = await add(listId, songB);
    const c = await add(listId, songC);
    expect((await reorderList(listId, [c.id, a.id, b.id])).ok).toBe(true);
    expect((await positions(listId)).map((r) => r.id)).toEqual([c.id, a.id, b.id]);
    expect((await positions(listId)).map((r) => r.position)).toEqual([0, 1, 2]);
  });

  test('CONFLICT when the id set differs from the current items', async () => {
    const listId = await makeList('setlist');
    const a = await add(listId, songA);
    const b = await add(listId, songB);
    const other = await add(await makeList('setlist'), songC);

    for (const ids of [[a.id], [a.id, b.id, other.id], [a.id, other.id]]) {
      const result = await reorderList(listId, ids);
      expect(result.ok === false && result.error.code).toBe('CONFLICT');
    }
    expect((await positions(listId)).map((r) => r.id)).toEqual([a.id, b.id]);
  });

  test('VALIDATION for duplicate ids', async () => {
    const listId = await makeList('setlist');
    const a = await add(listId, songA);
    const result = await reorderList(listId, [a.id, a.id]);
    expect(result.ok === false && result.error.code).toBe('VALIDATION');
  });

  test('an empty list reorders to nothing', async () => {
    const listId = await makeList('playlist');
    expect((await reorderList(listId, [])).ok).toBe(true);
  });

  test('two concurrent reorders: last write wins, positions stay contiguous', async () => {
    const listId = await makeList('setlist');
    const a = await add(listId, songA);
    const b = await add(listId, songB);
    const c = await add(listId, songC);
    const first = [c.id, b.id, a.id];
    const second = [b.id, a.id, c.id];

    const results = await Promise.all([reorderList(listId, first), reorderList(listId, second)]);
    expect(results.every((r) => r.ok)).toBe(true);

    const rows = await positions(listId);
    expect(rows.map((r) => r.position)).toEqual([0, 1, 2]);
    // The list row lock serializes them; whichever committed last is the final order.
    expect([first, second]).toContainEqual(rows.map((r) => r.id));

    // Sequentially, the later call always wins.
    await reorderList(listId, first);
    await reorderList(listId, second);
    expect((await positions(listId)).map((r) => r.id)).toEqual(second);
  });
});

describe('updateListItem', () => {
  test('sets and clears overrides; omitted fields are untouched', async () => {
    const listId = await makeList('setlist');
    const item = await add(listId, songA);

    const set = await updateListItem(item.id, {
      overrideKey: 'Eb',
      overrideBpm: 96,
      overrideEnergy: 'high_praise',
      notes: 'Capo 1',
    });
    expect(set.ok && set.data).toMatchObject({
      overrideKey: 'Eb',
      overrideBpm: 96,
      overrideEnergy: 'high_praise',
      notes: 'Capo 1',
    });

    const cleared = await updateListItem(item.id, { overrideBpm: null });
    expect(cleared.ok && cleared.data).toMatchObject({
      overrideKey: 'Eb',
      overrideBpm: null,
      overrideEnergy: 'high_praise',
      notes: 'Capo 1',
    });

    const noop = await updateListItem(item.id, {});
    expect(noop.ok && noop.data.overrideKey).toBe('Eb');
  });

  test('accepts an audio or video resource of the same song', async () => {
    const listId = await makeList('playlist');
    const item = await add(listId, songA);
    const audio = await updateListItem(item.id, { resourceId: audioA });
    expect(audio.ok && audio.data.resourceId).toBe(audioA);
    const video = await updateListItem(item.id, { resourceId: videoA });
    expect(video.ok && video.data.resourceId).toBe(videoA);
    const cleared = await updateListItem(item.id, { resourceId: null });
    expect(cleared.ok && cleared.data.resourceId).toBeNull();
  });

  test.each([
    ['another song’s resource', () => audioB],
    ['a non-audio resource', () => chartA],
    ['an unknown resource', () => randomUUID()],
  ])('VALIDATION for %s', async (_label, resourceId) => {
    const listId = await makeList('playlist');
    const item = await add(listId, songA);
    const result = await updateListItem(item.id, { resourceId: resourceId() });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('VALIDATION');
      expect(result.error.fieldErrors).toHaveProperty('resourceId');
    }
  });

  test('VALIDATION for a bad key or BPM', async () => {
    const listId = await makeList('setlist');
    const item = await add(listId, songA);
    const key = await updateListItem(item.id, { overrideKey: 'H' });
    expect(key.ok === false && key.error.code).toBe('VALIDATION');
    const bpm = await updateListItem(item.id, { overrideBpm: 400 });
    expect(bpm.ok === false && bpm.error.code).toBe('VALIDATION');
  });

  test('denied for a member who does not own the setlist', async () => {
    const listId = await makeList('setlist');
    const item = await add(listId, songA);
    actor = stranger;
    expect((await updateListItem(item.id, { overrideBpm: 100 })).ok).toBe(false);
    const [row] = await getDb().select().from(listItems).where(eq(listItems.id, item.id));
    expect(row?.overrideBpm).toBeNull();
  });
});
