// @vitest-environment node
// Integration: needs local Supabase (`pnpm db:start`). CI sets the env vars; locally
// they come from .env.local, which Vitest doesn't load on its own.
import type { AppUser, Role } from '@/types/domain';

import { existsSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';

import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('server-only', () => ({}));

if (!process.env.DATABASE_URL && existsSync('.env.local')) process.loadEnvFile('.env.local');

const { eq, inArray, sql } = await import('drizzle-orm');
const { branches, listItems, lists, resources, shares, songKeys, songs, users } =
  await import('@/db/schema');
const { getDb } = await import('@/lib/db');

let actor: AppUser;
const requireUser = vi.fn(async () => actor);
vi.mock('@/lib/auth', () => ({ requireUser: () => requireUser() }));

const { createShare, getSharedList, listShares, revokeShare } = await import('./server');

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
    name: `SHR-01 ${name} ${tag}`,
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

async function insertList(type: 'setlist' | 'playlist', ownerUser: AppUser) {
  const [row] = await getDb()
    .insert(lists)
    .values({
      type,
      name: `SHR-01 ${type} ${tag}`,
      eventDate: type === 'setlist' ? '2030-01-06' : null,
      ownerId: ownerUser.id,
      branchId: ownerUser.branchId,
    })
    .returning({ id: lists.id });
  listIds.push(row!.id);
  return row!.id;
}

const newRawToken = () => randomUUID().replace(/-/g, '').padEnd(43, 'x');

/** Insert a share row directly (for states createShare refuses to make, like a past expiry). */
async function insertShare(listId: string, values: { expiresAt?: Date; revokedAt?: Date } = {}) {
  const token = newRawToken();
  await getDb()
    .insert(shares)
    .values({
      listId,
      tokenHash: createHash('sha256').update(token).digest(),
      tokenPrefix: token.slice(0, 6),
      createdBy: owner.id,
      ...values,
    });
  return token;
}

/** The raw token: only ever in the url `createShare` returns. */
const tokenOf = (share: { url: string }) =>
  decodeURIComponent(new URL(share.url).pathname.split('/').pop()!);

async function create(listId: string, expiresAt?: string) {
  const result = await createShare(listId, { expiresAt });
  if (!result.ok) throw new Error(`createShare failed: ${result.error.code}`);
  return result.data;
}

beforeAll(async () => {
  const codes = new Set<string>();
  while (codes.size < 2) codes.add(code());
  const [a, b] = [...codes];
  const inserted = await getDb()
    .insert(branches)
    .values([
      { name: `SHR-01 A ${tag}`, code: a! },
      { name: `SHR-01 B ${tag}`, code: b! },
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
  // Shares cascade with their lists.
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
  requireUser.mockClear();
});

describe('createShare', () => {
  test('returns the link once; stores only the sha256 and a 6-char prefix', async () => {
    const listId = await insertList('playlist', owner);
    const share = await create(listId);
    const token = tokenOf(share);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(share.url).toBe(new URL(`/share/${token}`, process.env.APP_URL).toString());
    expect(share).toMatchObject({
      listId,
      tokenPrefix: token.slice(0, 6),
      expiresAt: null,
      revokedAt: null,
    });
    expect(share).not.toHaveProperty('token');

    const [row] = await getDb().select().from(shares).where(eq(shares.id, share.id));
    expect(row).toMatchObject({ token: null, createdBy: owner.id, listId });
    expect(row!.tokenHash).toEqual(createHash('sha256').update(token).digest());
    expect(row!.tokenPrefix).toBe(token.slice(0, 6));
    const stored = await getDb().execute(sql`select * from shares where id = ${share.id}`);
    expect(JSON.stringify(stored)).not.toContain(token);
  });

  test('keeps a future expiry; refuses a past one', async () => {
    const listId = await insertList('playlist', owner);
    const expiresAt = new Date(Date.now() + 7 * 86_400_000).toISOString();
    expect((await create(listId, expiresAt)).expiresAt).toBe(expiresAt);

    const past = await createShare(listId, { expiresAt: '2020-01-01T00:00:00Z' });
    expect(past).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
  });

  test('permissions: owner, admin and same-branch leader may share a setlist', async () => {
    const listId = await insertList('setlist', owner);
    for (const u of [owner, admin, leaderA]) {
      actor = u;
      expect((await createShare(listId)).ok).toBe(true);
    }
    for (const u of [sameBranch, leaderB]) {
      actor = u;
      expect(await createShare(listId)).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
    }
  });

  test("someone else's playlist, a deleted list and an unknown list are NOT_FOUND", async () => {
    const playlist = await insertList('playlist', owner);
    actor = leaderA;
    expect(await createShare(playlist)).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });

    actor = owner;
    const deleted = await insertList('setlist', owner);
    await getDb().update(lists).set({ deletedAt: new Date() }).where(eq(lists.id, deleted));
    expect(await createShare(deleted)).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
    expect(await createShare(randomUUID())).toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND' },
    });
  });
});

describe('revokeShare and listShares', () => {
  test('revoking stops the link; a second revoke keeps the first time', async () => {
    const listId = await insertList('setlist', owner);
    const share = await create(listId);
    expect(await getSharedList(tokenOf(share))).not.toBeNull();

    expect(await revokeShare(share.id)).toEqual({ ok: true, data: undefined });
    expect(await getSharedList(tokenOf(share))).toBeNull();
    const [first] = await getDb().select().from(shares).where(eq(shares.id, share.id));
    expect(first!.revokedAt).not.toBeNull();

    expect((await revokeShare(share.id)).ok).toBe(true);
    const [second] = await getDb().select().from(shares).where(eq(shares.id, share.id));
    expect(second!.revokedAt).toEqual(first!.revokedAt);
  });

  test('others cannot revoke; unknown shares are NOT_FOUND', async () => {
    const listId = await insertList('setlist', owner);
    const share = await create(listId);
    actor = sameBranch;
    expect(await revokeShare(share.id)).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
    expect(await revokeShare(randomUUID())).toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND' },
    });
    actor = owner;
    expect(await getSharedList(tokenOf(share))).not.toBeNull();
  });

  test('lists every link of the list, newest first, for writers only', async () => {
    const listId = await insertList('setlist', owner);
    const older = await create(listId);
    const newer = await create(listId);
    await revokeShare(older.id);

    const result = await listShares(listId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.map((s) => s.id)).toEqual([newer.id, older.id]);
    expect(result.data[1]!.revokedAt).not.toBeNull();
    expect(result.data[0]!.tokenPrefix).toBe(newer.tokenPrefix);
    for (const s of result.data) {
      expect(Object.keys(s).sort()).toEqual(
        ['createdAt', 'expiresAt', 'id', 'listId', 'revokedAt', 'tokenPrefix'].sort(),
      );
    }
    expect(JSON.stringify(result.data)).not.toContain(tokenOf(newer));

    actor = sameBranch;
    expect(await listShares(listId)).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
  });
});

describe('getSharedList', () => {
  test('needs no session; returns overrides and notes but no file locations', async () => {
    const [song] = await getDb()
      .insert(songs)
      .values({ title: `SHR-01 Song ${tag}`, tempoBpm: 80 })
      .returning({ id: songs.id });
    songIds.push(song!.id);
    const [key] = await getDb()
      .insert(songKeys)
      .values({ songId: song!.id, key: 'E', isPrimary: true, chorusChord: 'A' })
      .returning({ id: songKeys.id });
    await getDb()
      .insert(resources)
      .values([
        {
          songId: song!.id,
          songKeyId: key!.id,
          kind: 'chord_chart',
          format: 'pdf',
          label: 'Chart',
          storagePath: `songs/${song!.id}/${key!.id}/secret-${tag}.pdf`,
        },
        {
          songId: song!.id,
          songKeyId: null,
          kind: 'projection',
          format: 'url',
          label: 'Slides',
          url: `https://example.test/secret-${tag}`,
        },
      ]);

    const listId = await insertList('setlist', owner);
    await getDb()
      .insert(listItems)
      .values({ listId, songId: song!.id, position: 0, overrideBpm: 96, notes: 'Capo 2' });
    const share = await create(listId);

    requireUser.mockClear();
    const list = await getSharedList(tokenOf(share));
    expect(requireUser).not.toHaveBeenCalled();
    expect(list).toMatchObject({
      id: listId,
      ownerName: owner.name,
      branchCode: branchA.code,
      itemCount: 1,
    });
    const [item] = list!.items;
    expect(item).toMatchObject({
      key: 'E',
      bpm: 96,
      isOverridden: { key: false, bpm: true, energy: false },
      firstChords: { chorus: 'A' },
      item: { notes: 'Capo 2' },
    });
    expect(item!.resources.map((r) => r.label).sort()).toEqual(['Chart', 'Slides']);
    for (const r of item!.resources) {
      expect(r.url).toBeNull();
      expect(r.storagePath).toBeNull();
    }
    const json = JSON.stringify(list);
    expect(json).not.toContain(`secret-${tag}`);
    expect(json).not.toContain(owner.email);
    expect(json).not.toContain(tokenOf(share));
  });

  test('expired, revoked, unknown and malformed tokens → null', async () => {
    const listId = await insertList('playlist', owner);
    const expired = await insertShare(listId, { expiresAt: new Date(Date.now() - 1000) });
    const revoked = await insertShare(listId, { revokedAt: new Date() });
    const live = await insertShare(listId, { expiresAt: new Date(Date.now() + 60_000) });

    expect(await getSharedList(expired)).toBeNull();
    expect(await getSharedList(revoked)).toBeNull();
    expect(await getSharedList('B'.repeat(43))).toBeNull();
    expect(await getSharedList('nope')).toBeNull();
    // A playlist link works for anyone holding it, even though the playlist is private.
    expect((await getSharedList(live))?.id).toBe(listId);
  });

  test('links from before 0009 still open: a raw-token row gets its hash (old-build insert)', async () => {
    // What the previous build does during the deploy, and what the backfill did to old rows.
    const listId = await insertList('setlist', owner);
    const token = newRawToken();
    await getDb().execute(
      sql`insert into shares (list_id, token, created_by) values (${listId}, ${token}, ${owner.id})`,
    );
    expect((await getSharedList(token))?.id).toBe(listId);
    const result = await listShares(listId);
    expect(result.ok && result.data[0]!.tokenPrefix).toBe(token.slice(0, 6));
  });

  test('a deleted list → null', async () => {
    const listId = await insertList('setlist', owner);
    const share = await create(listId);
    await getDb().update(lists).set({ deletedAt: new Date() }).where(eq(lists.id, listId));
    expect(await getSharedList(tokenOf(share))).toBeNull();
  });
});
