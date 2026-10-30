// @vitest-environment node
// Integration (LIB-01): song actions against the local Supabase stack, on top of the DB-04
// seed (run here; it's idempotent). Env comes from CI or .env.local. The signed-in user is
// stubbed by mocking `requireUser`, so each test picks a seeded fixture user by role.
import { existsSync } from 'node:fs';

import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';

import type { AppUser, SongDetail } from '@/types/domain';

vi.mock('server-only', () => ({}));

let currentUser: AppUser | null = null;
vi.mock('@/lib/auth', async () => {
  const { ActionError } = await import('@/lib/action');
  return {
    requireUser: async () => {
      if (!currentUser) throw new ActionError('UNAUTHENTICATED', 'Sign in.');
      return currentUser;
    },
  };
});

if (!process.env.DATABASE_URL && existsSync('.env.local')) process.loadEnvFile('.env.local');

const { and, eq, inArray } = await import('drizzle-orm');
const { auditLog, songs: songsTable } = await import('@/db/schema');
const { getDb } = await import('@/lib/db');
const { seed } = await import('@/db/seed/seed');
const fixtures = await import('@/fixtures');
const { createSong, deleteSong, getSong, getSongs, updateSong } = await import('./songs');

const byRole = (role: AppUser['role']) =>
  fixtures.users.find((u) => u.role === role && u.accessStatus === 'approved' && !u.disabledAt)!;
const admin = byRole('admin');
const contributor = byRole('contributor');
const member = byRole('member');

const [composerA, composerB] = fixtures.composers;
const created: string[] = [];

function input(overrides: Record<string, unknown> = {}) {
  return {
    title: `LIB-01 test song ${created.length}`,
    altTitles: ['Alt title'],
    composerIds: [composerB!.id, composerA!.id],
    sourceGroup: 'Test group',
    year: 2020,
    tempoBpm: 72,
    timeSignature: '6/8',
    energyLevel: 'deep_worship',
    energyNotes: null,
    lyrics: { chorus: 'Chorus line one\nline two', verse_1: '\nVerse one first line' },
    arrangement: ['verse_1', 'chorus', 'chorus'],
    ...overrides,
  };
}

async function create(as: AppUser, overrides: Record<string, unknown> = {}) {
  currentUser = as;
  const result = await createSong(input(overrides));
  if (result.ok) created.push(result.data.id);
  return result;
}

async function auditRows(songId: string) {
  return getDb()
    .select()
    .from(auditLog)
    .where(and(eq(auditLog.entity, 'song'), eq(auditLog.entityId, songId)))
    .orderBy(auditLog.createdAt);
}

const iso = (s: string) => new Date(s).toISOString();

beforeAll(async () => {
  await seed({
    databaseUrl: process.env.DATABASE_URL,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  });
}, 60_000);

afterAll(async () => {
  if (created.length) {
    await getDb().delete(auditLog).where(inArray(auditLog.entityId, created));
    await getDb().delete(songsTable).where(inArray(songsTable.id, created));
  }
  await getDb().$client.end();
});

describe('getSong', () => {
  test('seeded "A Thousand Hallelujahs" deep-equals its fixture', async () => {
    currentUser = member;
    const song = await getSong(fixtures.SONG_IDS.thousandHallelujahs);
    const want: SongDetail = {
      ...fixtures.thousandHallelujahs,
      createdAt: iso(fixtures.thousandHallelujahs.createdAt),
      updatedAt: iso(fixtures.thousandHallelujahs.updatedAt),
      resources: fixtures.thousandHallelujahs.resources.map((r) => ({
        ...r,
        createdAt: iso(r.createdAt),
      })),
    };
    expect(song).toEqual(want);
  });

  test('unknown or malformed ids give null; signed-out callers are rejected', async () => {
    currentUser = member;
    expect(await getSong('00000000-0000-4000-8000-0000000000ff')).toBeNull();
    expect(await getSong('not-a-uuid')).toBeNull();
    currentUser = null;
    await expect(getSong(fixtures.SONG_IDS.agnusDei)).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
  });

  test('getSongs returns live songs in the order asked, skipping unknown ids', async () => {
    currentUser = member;
    const { agnusDei, holySpirit } = fixtures.SONG_IDS;
    const got = await getSongs([holySpirit, '00000000-0000-4000-8000-0000000000ff', agnusDei]);
    expect(got.map((s) => s.id)).toEqual([holySpirit, agnusDei]);
    expect(await getSongs([])).toEqual([]);
  });
});

describe('createSong', () => {
  test('a contributor creates a song; added-by is their branch; audited', async () => {
    const result = await create(contributor);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const song = (await getSong(result.data.id))!;
    expect(song).toMatchObject({
      title: expect.stringMatching(/^LIB-01 test song/),
      altTitles: ['Alt title'],
      composers: [composerB, composerA],
      addedByBranchId: contributor.branchId,
      addedByBranchCode: fixtures.getBranch(contributor.branchId!).code,
      createdBy: contributor.id,
      arrangement: ['verse_1', 'chorus', 'chorus'],
      chorusLine: 'Chorus line one',
      verse1Line: 'Verse one first line',
      keys: [],
      resources: [],
      themes: [],
    });
    expect(song.lyrics.bridge).toBeNull();
    expect(song.usage).toHaveLength(fixtures.branches.length);
    expect(song.usage.every((u) => u.level === 'none' && u.source === 'manual')).toBe(true);

    const [entry, ...rest] = await auditRows(result.data.id);
    expect(rest).toHaveLength(0);
    expect(entry).toMatchObject({ actorId: contributor.id, action: 'create' });
    expect(entry!.diff.title).toEqual({ from: null, to: song.title });
    expect(entry!.diff.composerIds).toEqual({ from: null, to: [composerB!.id, composerA!.id] });
  });

  test('a member gets FORBIDDEN and nothing is written', async () => {
    const before = await getDb().$count(songsTable);
    const result = await create(member);
    expect(result).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
    expect(await getDb().$count(songsTable)).toBe(before);
  });

  test('an arrangement section without lyrics is a VALIDATION error with fieldErrors', async () => {
    const result = await create(contributor, { arrangement: ['chorus', 'bridge'] });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('VALIDATION');
    expect(result.error.fieldErrors).toEqual({
      'arrangement.1': ['Arrangement uses bridge, which has no lyrics'],
    });
  });

  test('unknown or repeated composers are VALIDATION errors', async () => {
    const unknown = await create(contributor, {
      composerIds: ['00000000-0000-4000-8000-0000000000ff'],
    });
    expect(unknown).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION', fieldErrors: { composerIds: ['Unknown composer'] } },
    });
    const repeated = await create(contributor, { composerIds: [composerA!.id, composerA!.id] });
    expect(repeated).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
  });

  test('only an admin may choose another added-by branch', async () => {
    const other = fixtures.branches.find((b) => b.id !== contributor.branchId)!;
    const denied = await create(contributor, { addedByBranchId: other.id });
    expect(denied).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });

    const same = await create(contributor, { addedByBranchId: contributor.branchId });
    expect(same.ok).toBe(true);

    const allowed = await create(admin, { addedByBranchId: other.id });
    expect(allowed.ok).toBe(true);
    if (!allowed.ok) return;
    expect((await getSong(allowed.data.id))!.addedByBranchId).toBe(other.id);
  });
});

describe('updateSong', () => {
  test('a contributor edits a song; the audit diff lists only what changed', async () => {
    const result = await create(contributor);
    if (!result.ok) throw new Error('create failed');
    const id = result.data.id;

    currentUser = contributor;
    const updated = await updateSong(
      id,
      input({ title: 'Renamed song', composerIds: [composerA!.id], year: 2021 }),
    );
    expect(updated).toEqual({ ok: true, data: undefined });

    const song = (await getSong(id))!;
    expect(song.title).toBe('Renamed song');
    expect(song.composers).toEqual([composerA]);
    expect(song.addedByBranchId).toBe(contributor.branchId);

    const [, update] = await auditRows(id);
    expect(update).toMatchObject({ action: 'update', actorId: contributor.id });
    expect(Object.keys(update!.diff).sort()).toEqual(['composerIds', 'title', 'year']);
    expect(update!.diff.year).toEqual({ from: 2020, to: 2021 });
  });

  test('member FORBIDDEN, missing song NOT_FOUND, bad input VALIDATION', async () => {
    const result = await create(contributor);
    if (!result.ok) throw new Error('create failed');

    currentUser = member;
    expect(await updateSong(result.data.id, input())).toMatchObject({
      ok: false,
      error: { code: 'FORBIDDEN' },
    });
    currentUser = contributor;
    expect(await updateSong('00000000-0000-4000-8000-0000000000ff', input())).toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND' },
    });
    expect(await updateSong(result.data.id, input({ title: '' }))).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION', fieldErrors: { title: expect.any(Array) } },
    });
  });

  test("a contributor can't move added-by; an admin can", async () => {
    const result = await create(contributor);
    if (!result.ok) throw new Error('create failed');
    const other = fixtures.branches.find((b) => b.id !== contributor.branchId)!;

    currentUser = contributor;
    expect(await updateSong(result.data.id, input({ addedByBranchId: other.id }))).toMatchObject({
      ok: false,
      error: { code: 'FORBIDDEN' },
    });

    currentUser = admin;
    expect(await updateSong(result.data.id, input({ addedByBranchId: other.id }))).toEqual({
      ok: true,
      data: undefined,
    });
    expect((await getSong(result.data.id))!.addedByBranchCode).toBe(other.code);
  });
});

describe('deleteSong', () => {
  test('admin soft-deletes; the song disappears from reads; audited', async () => {
    const result = await create(contributor);
    if (!result.ok) throw new Error('create failed');
    const id = result.data.id;

    currentUser = contributor;
    expect(await deleteSong(id)).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });

    currentUser = admin;
    expect(await deleteSong(id)).toEqual({ ok: true, data: undefined });
    expect(await getSong(id)).toBeNull();
    expect(await getSongs([id])).toEqual([]);
    const [row] = await getDb().select().from(songsTable).where(eq(songsTable.id, id));
    expect(row!.deletedAt).not.toBeNull();

    const entries = await auditRows(id);
    expect(entries.at(-1)).toMatchObject({ action: 'delete', actorId: admin.id });

    expect(await deleteSong(id)).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
    expect(await updateSong(id, input())).toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND' },
    });
  });
});
