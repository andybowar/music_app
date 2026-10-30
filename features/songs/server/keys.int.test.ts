// @vitest-environment node
// Integration: needs local Supabase (`pnpm db:start`). CI sets the env vars; locally
// they come from .env.local, which Vitest doesn't load on its own.
import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';

import type { AppUser } from '@/types/domain';
import type { SongKeyInput } from '@/types/validation';

vi.mock('server-only', () => ({}));

const actorId = randomUUID();
const actor: AppUser = {
  id: actorId,
  email: `${actorId}@example.test`,
  name: 'LIB-02 test',
  branchId: null,
  role: 'contributor',
  authProvider: 'password',
  disabledAt: null,
  accessStatus: 'approved',
};
vi.mock('@/lib/auth', () => ({ requireUser: async () => actor }));

if (!process.env.DATABASE_URL && existsSync('.env.local')) process.loadEnvFile('.env.local');

const { and, eq, inArray, sql } = await import('drizzle-orm');
const { auditLog, resources, songKeys, songs, users } = await import('@/db/schema');
const { getDb } = await import('@/lib/db');
const { setSongKeys } = await import('./keys');

const songIds: string[] = [];

beforeAll(async () => {
  // users.id references auth.users, so the actor needs an auth row first.
  await getDb().execute(
    sql`insert into auth.users (id, email) values (${actorId}, ${actor.email})`,
  );
  await getDb().insert(users).values({
    id: actorId,
    email: actor.email,
    name: actor.name,
    role: 'contributor',
    authProvider: 'password',
    accessStatus: 'approved',
  });
});

afterAll(async () => {
  if (songIds.length > 0) await getDb().delete(songs).where(inArray(songs.id, songIds));
  await getDb().delete(auditLog).where(eq(auditLog.actorId, actorId));
  await getDb().execute(sql`delete from auth.users where id = ${actorId}`);
  await getDb().$client.end();
});

let songId: string;

beforeEach(async () => {
  const [song] = await getDb()
    .insert(songs)
    .values({ title: `LIB-02 test ${randomUUID().slice(0, 8)}` })
    .returning({ id: songs.id });
  songId = song!.id;
  songIds.push(songId);
});

const k = (key: string, isPrimary = false, firstChords: SongKeyInput['firstChords'] = {}) => ({
  key,
  isPrimary,
  firstChords,
});

async function save(keys: SongKeyInput[]) {
  const res = await setSongKeys(songId, keys);
  if (!res.ok) throw new Error(`${res.error.code}: ${res.error.message}`);
  return res.data;
}

async function addFile(songKeyId: string, label: string) {
  const id = randomUUID();
  await getDb()
    .insert(resources)
    .values({
      id,
      songId,
      songKeyId,
      kind: 'lead_sheet',
      format: 'pdf',
      label,
      storagePath: `songs/${songId}/${songKeyId}/${id}.pdf`,
    });
  return id;
}

const keyRows = () => getDb().select().from(songKeys).where(eq(songKeys.songId, songId));

describe('setSongKeys', () => {
  test('creates keys with first chords, primary first then alphabetical', async () => {
    const saved = await save([
      k('D'),
      k('G', true, { intro: 'G', verse: 'G', chorus: 'C', bridge: null }),
      k('A'),
    ]);
    expect(saved.map((s) => [s.key, s.isPrimary])).toEqual([
      ['G', true],
      ['A', false],
      ['D', false],
    ]);
    expect(saved[0]!.firstChords).toEqual({ intro: 'G', verse: 'G', chorus: 'C', bridge: null });
    expect(saved[1]!.firstChords).toEqual({ intro: null, verse: null, chorus: null, bridge: null });

    const audits = await getDb()
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.entity, 'song_key'), eq(auditLog.actorId, actorId)));
    const created = audits.filter((a) => saved.some((s) => s.id === a.entityId));
    expect(created).toHaveLength(3);
    expect(created.every((a) => a.action === 'create')).toBe(true);
  });

  test('enforces exactly one primary', async () => {
    await save([k('G', true)]);
    for (const keys of [
      [k('G'), k('A')],
      [k('G', true), k('A', true)],
    ]) {
      const res = await setSongKeys(songId, keys);
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error.code).toBe('VALIDATION');
    }
    const rows = await keyRows();
    expect(rows.map((r) => [r.key, r.isPrimary])).toEqual([['G', true]]);
  });

  test('moving primary between kept keys keeps their ids', async () => {
    const before = await save([k('G', true), k('A')]);
    const after = await save([k('G'), k('A', true)]);
    expect(after.map((s) => [s.key, s.isPrimary])).toEqual([
      ['A', true],
      ['G', false],
    ]);
    const id = (list: typeof before, key: string) => list.find((s) => s.key === key)!.id;
    expect(id(after, 'G')).toBe(id(before, 'G'));
    expect(id(after, 'A')).toBe(id(before, 'A'));
  });

  test('renaming a key keeps its id and its resources', async () => {
    const [g] = await save([k('G', true, { intro: 'G' })]);
    const fileId = await addFile(g!.id, 'Lead sheet');

    const [a] = await save([k('A', true, { intro: 'A' })]);
    expect(a).toMatchObject({ id: g!.id, key: 'A', isPrimary: true });
    expect(a!.firstChords.intro).toBe('A');

    const [file] = await getDb().select().from(resources).where(eq(resources.id, fileId));
    expect(file?.songKeyId).toBe(g!.id);

    const [audit] = await getDb()
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.entityId, g!.id), eq(auditLog.action, 'update')));
    expect(audit?.diff).toEqual({
      key: { from: 'G', to: 'A' },
      introChord: { from: 'G', to: 'A' },
    });
  });

  test('unchanged keys are not rewritten or audited', async () => {
    const [g] = await save([k('G', true, { chorus: 'C' })]);
    await save([k('G', true, { chorus: 'C' })]);
    const audits = await getDb().select().from(auditLog).where(eq(auditLog.entityId, g!.id));
    expect(audits.map((a) => a.action)).toEqual(['create']);
  });

  test('deleting a key with files fails with CONFLICT listing them, and changes nothing', async () => {
    const saved = await save([k('G', true), k('D')]);
    const d = saved.find((s) => s.key === 'D')!;
    await addFile(d.id, 'Lead sheet');
    await addFile(d.id, 'Chord chart');

    const res = await setSongKeys(songId, [k('G', true, { intro: 'Em' })]);
    expect(res).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT', fieldErrors: { D: ['Chord chart', 'Lead sheet'] } },
    });
    if (!res.ok) expect(res.error.message).toContain('D (Chord chart, Lead sheet)');

    const rows = await keyRows();
    expect(rows.map((r) => r.key).sort()).toEqual(['D', 'G']);
    expect(rows.find((r) => r.key === 'G')?.introChord).toBeNull();
  });

  test('ambiguous change (two removed, two added) is delete-plus-insert, so CONFLICT applies', async () => {
    const saved = await save([k('G', true), k('D')]);
    await addFile(saved.find((s) => s.key === 'G')!.id, 'Lead sheet');

    const res = await setSongKeys(songId, [k('A', true), k('E')]);
    expect(res).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT', fieldErrors: { G: ['Lead sheet'] } },
    });
    expect((await keyRows()).map((r) => r.key).sort()).toEqual(['D', 'G']);
  });

  test('ambiguous change without files deletes and inserts new ids', async () => {
    const before = await save([k('G', true), k('D')]);
    const after = await save([k('A', true), k('E')]);
    expect(after.map((s) => s.key)).toEqual(['A', 'E']);
    expect(after.some((s) => before.some((b) => b.id === s.id))).toBe(false);
  });

  test('deleting a key without files removes it', async () => {
    await save([k('G', true), k('D')]);
    const saved = await save([k('G', true)]);
    expect(saved.map((s) => s.key)).toEqual(['G']);
    expect(await keyRows()).toHaveLength(1);
  });

  test('a soft-deleted or unknown song is NOT_FOUND', async () => {
    await getDb().update(songs).set({ deletedAt: new Date() }).where(eq(songs.id, songId));
    const res = await setSongKeys(songId, [k('G', true)]);
    expect(res).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });

    const unknown = await setSongKeys(randomUUID(), [k('G', true)]);
    expect(unknown).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
  });
});
