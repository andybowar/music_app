// @vitest-environment node
// Integration: needs local Supabase (`pnpm db:start`). CI sets the env vars; locally
// they come from .env.local, which Vitest doesn't load on its own.
import type { AppUser } from '@/types/domain';

import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';

import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const actorId = randomUUID();
const actor: AppUser = {
  id: actorId,
  email: `${actorId}@example.test`,
  name: 'LIB-05 test',
  branchId: null,
  role: 'contributor',
  authProvider: 'password',
  disabledAt: null,
  accessStatus: 'approved',
};
let currentUser: AppUser = actor;
vi.mock('@/lib/auth', () => ({ requireUser: async () => currentUser }));

if (!process.env.DATABASE_URL && existsSync('.env.local')) process.loadEnvFile('.env.local');

const { and, eq, inArray, sql } = await import('drizzle-orm');
const { auditLog, branches, branchUsage, songs, users } = await import('@/db/schema');
const { getDb } = await import('@/lib/db');
const { setBranchUsage } = await import('./usage');

/** Random 3-letter code starting with Z, so it can't clash with seeded branches. */
function code(): string {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const pick = () => letters[Math.floor(Math.random() * letters.length)];
  return `Z${pick()}${pick()}`;
}

const branchIds: string[] = [];
const codes: string[] = [];
let songId: string;
let deletedSongId: string;
let A: string;
let B: string;
let C: string;

async function rows() {
  const out = await getDb()
    .select({
      branchId: branchUsage.branchId,
      level: branchUsage.level,
      source: branchUsage.source,
    })
    .from(branchUsage)
    .where(eq(branchUsage.songId, songId));
  return Object.fromEntries(out.map((r) => [r.branchId, { level: r.level, source: r.source }]));
}

async function audits() {
  return getDb()
    .select()
    .from(auditLog)
    .where(and(eq(auditLog.entity, 'branch_usage'), eq(auditLog.entityId, songId)));
}

beforeAll(async () => {
  await getDb().execute(
    sql`insert into auth.users (id, email) values (${actorId}, ${actor.email})`,
  );
  await getDb()
    .insert(users)
    .values({ id: actorId, email: actor.email, name: actor.name, authProvider: 'password' });

  while (codes.length < 3) {
    const c = code();
    if (!codes.includes(c)) codes.push(c);
  }
  const inserted = await getDb()
    .insert(branches)
    .values(codes.map((c) => ({ name: `LIB-05 ${c} ${actorId}`, code: c })))
    .returning({ id: branches.id, code: branches.code });
  for (const c of codes) branchIds.push(inserted.find((b) => b.code === c)!.id);
  [A, B, C] = branchIds as [string, string, string];

  const [song] = await getDb()
    .insert(songs)
    .values({ title: `LIB-05 song ${actorId}` })
    .returning({ id: songs.id });
  songId = song!.id;
  const [gone] = await getDb()
    .insert(songs)
    .values({ title: `LIB-05 deleted ${actorId}`, deletedAt: new Date() })
    .returning({ id: songs.id });
  deletedSongId = gone!.id;
});

beforeEach(async () => {
  currentUser = actor;
  await getDb().delete(branchUsage).where(eq(branchUsage.songId, songId));
  await getDb().delete(auditLog).where(eq(auditLog.actorId, actorId));
});

afterAll(async () => {
  await getDb().delete(auditLog).where(eq(auditLog.actorId, actorId));
  await getDb()
    .delete(songs)
    .where(inArray(songs.id, [songId, deletedSongId])); // cascades usage
  await getDb().delete(branches).where(inArray(branches.id, branchIds));
  await getDb().execute(sql`delete from auth.users where id = ${actorId}`);
  await getDb().$client.end();
});

describe('setBranchUsage', () => {
  test('inserts manual rows and audits the change by branch code', async () => {
    const result = await setBranchUsage(songId, [
      { branchId: A, level: 'high' },
      { branchId: B, level: 'rare' },
    ]);
    expect(result).toEqual({ ok: true, data: undefined });
    expect(await rows()).toEqual({
      [A]: { level: 'high', source: 'manual' },
      [B]: { level: 'rare', source: 'manual' },
    });

    const audit = await audits();
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ action: 'update', actorId });
    expect(audit[0]?.diff).toEqual({
      [codes[0]!]: { from: null, to: { level: 'high', source: 'manual' } },
      [codes[1]!]: { from: null, to: { level: 'rare', source: 'manual' } },
    });
  });

  test('replaces manual rows: updates levels and deletes branches not in entries', async () => {
    await setBranchUsage(songId, [
      { branchId: A, level: 'high' },
      { branchId: B, level: 'rare' },
    ]);
    const result = await setBranchUsage(songId, [{ branchId: A, level: 'low' }]);
    expect(result.ok).toBe(true);
    expect(await rows()).toEqual({ [A]: { level: 'low', source: 'manual' } });
  });

  test('keeps derived rows not in entries and overrides derived rows that are', async () => {
    await getDb()
      .insert(branchUsage)
      .values([
        { songId, branchId: A, level: 'rare', source: 'derived' },
        { songId, branchId: B, level: 'high', source: 'derived' },
      ]);
    const result = await setBranchUsage(songId, [
      { branchId: B, level: 'none' },
      { branchId: C, level: 'low' },
    ]);
    expect(result.ok).toBe(true);
    expect(await rows()).toEqual({
      [A]: { level: 'rare', source: 'derived' },
      [B]: { level: 'none', source: 'manual' },
      [C]: { level: 'low', source: 'manual' },
    });
  });

  test('an empty list clears manual rows only', async () => {
    await getDb()
      .insert(branchUsage)
      .values([
        { songId, branchId: A, level: 'rare', source: 'derived' },
        { songId, branchId: B, level: 'high', source: 'manual' },
      ]);
    const result = await setBranchUsage(songId, []);
    expect(result.ok).toBe(true);
    expect(await rows()).toEqual({ [A]: { level: 'rare', source: 'derived' } });
  });

  test('a no-op save writes no audit row', async () => {
    await setBranchUsage(songId, [{ branchId: A, level: 'high' }]);
    await setBranchUsage(songId, [{ branchId: A, level: 'high' }]);
    expect(await audits()).toHaveLength(1);
  });

  test('member is denied and nothing is written', async () => {
    currentUser = { ...actor, role: 'member' };
    const result = await setBranchUsage(songId, [{ branchId: A, level: 'high' }]);
    expect(result.ok).toBe(false);
    expect(await rows()).toEqual({});
    expect(await audits()).toHaveLength(0);
  });

  test('unknown branch → VALIDATION keyed by entry index, nothing written', async () => {
    const result = await setBranchUsage(songId, [
      { branchId: A, level: 'high' },
      { branchId: randomUUID(), level: 'low' },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('VALIDATION');
      expect(result.error.fieldErrors).toHaveProperty(['1.branchId']);
    }
    expect(await rows()).toEqual({});
  });

  test.each([
    ['a missing song', () => randomUUID()],
    ['a soft-deleted song', () => deletedSongId],
  ])('%s → NOT_FOUND', async (_label, id) => {
    const result = await setBranchUsage(id(), [{ branchId: A, level: 'high' }]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('NOT_FOUND');
  });
});
