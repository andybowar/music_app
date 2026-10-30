// @vitest-environment node
// Integration: needs local Supabase (`pnpm db:start`). CI sets the env vars; locally they come
// from .env.local, which Vitest doesn't load on its own. The session guard is mocked to return
// a throwaway admin; everything else (DB, triggers, audit) is real.
import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';

import type { AppUser, Role } from '@/types/domain';

vi.mock('server-only', () => ({}));

const auth = vi.hoisted(() => ({ requireUser: vi.fn() }));
vi.mock('@/lib/auth', () => auth);

if (!process.env.DATABASE_URL && existsSync('.env.local')) process.loadEnvFile('.env.local');

const { and, asc, eq, inArray, sql } = await import('drizzle-orm');
const { auditLog, composers, songComposers, songs, users } = await import('@/db/schema');
const { getDb } = await import('@/lib/db');
const { createComposer, mergeComposers, searchComposers, setComposerPop, setSongComposers } =
  await import('./composers');

const run = randomUUID().slice(0, 8);
const actorId = randomUUID();
const songIds: string[] = [];

function as(role: Role) {
  const user: AppUser = {
    id: actorId,
    email: `${actorId}@example.test`,
    name: 'LIB-03 test',
    branchId: null,
    role,
    authProvider: 'password',
    disabledAt: null,
    accessStatus: 'approved',
  };
  auth.requireUser.mockResolvedValue(user);
}

async function newComposer(name: string, pop: 'none' | 'past' | 'current' = 'none') {
  const result = await createComposer(`${name} ${run}`);
  if (!result.ok) throw new Error(result.error.message);
  if (pop !== 'none') await setComposerPop(result.data.id, pop);
  return result.data;
}

async function newSong(composerIds: string[] = []) {
  const [row] = await getDb()
    .insert(songs)
    .values({ title: `LIB-03 song ${run}` })
    .returning({ id: songs.id });
  if (!row) throw new Error('song insert failed');
  songIds.push(row.id);
  if (composerIds.length) {
    await getDb()
      .insert(songComposers)
      .values(composerIds.map((composerId, i) => ({ songId: row.id, composerId, sortOrder: i })));
  }
  return row.id;
}

async function creditsOf(songId: string) {
  return getDb()
    .select({ composerId: songComposers.composerId, sortOrder: songComposers.sortOrder })
    .from(songComposers)
    .where(eq(songComposers.songId, songId))
    .orderBy(asc(songComposers.sortOrder));
}

async function composerNamesOf(songId: string) {
  const [row] = await getDb()
    .select({ names: songs.composerNames })
    .from(songs)
    .where(eq(songs.id, songId));
  return row?.names;
}

beforeAll(async () => {
  // users.id references auth.users, so the actor needs an auth row first.
  await getDb().execute(
    sql`insert into auth.users (id, email) values (${actorId}, ${`${actorId}@example.test`})`,
  );
  await getDb()
    .insert(users)
    .values({
      id: actorId,
      email: `${actorId}@example.test`,
      name: 'LIB-03 test',
      authProvider: 'password',
      role: 'admin',
    });
});

afterAll(async () => {
  const db = getDb();
  if (songIds.length) await db.delete(songs).where(inArray(songs.id, songIds)); // cascades credits
  await db.delete(composers).where(sql`${composers.name} like ${`% ${run}`}`);
  await db.delete(auditLog).where(eq(auditLog.actorId, actorId));
  await db.execute(sql`delete from auth.users where id = ${actorId}`); // cascades to users
  await db.$client.end();
});

beforeEach(() => as('admin'));

describe('createComposer', () => {
  test('dedupes case- and whitespace-insensitively and audits only the first create', async () => {
    const first = await createComposer(`Ada Lovelace ${run}`);
    const again = await createComposer(`  ADA   lovelace ${run.toUpperCase()} `);
    expect(first.ok && again.ok).toBe(true);
    if (!first.ok || !again.ok) return;

    expect(again.data).toEqual(first.data);
    expect(first.data).toMatchObject({ name: `Ada Lovelace ${run}`, popMember: 'none' });

    const rows = await getDb()
      .select()
      .from(composers)
      .where(sql`lower(${composers.name}) = lower(${`Ada Lovelace ${run}`})`);
    expect(rows).toHaveLength(1);

    const audits = await getDb()
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.entity, 'composer'), eq(auditLog.entityId, first.data.id)));
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ action: 'create', actorId });
  });

  test('contributors may create; members may not', async () => {
    as('contributor');
    expect(await createComposer(`Contrib ${run}`)).toMatchObject({ ok: true });
    as('member');
    expect(await createComposer(`Member ${run}`)).toMatchObject({ ok: false });
  });
});

describe('searchComposers', () => {
  test('prefix-matches names and later words, name-starts first, case-insensitive', async () => {
    const tag = `Zq${run}`;
    const bravo = await newComposer(`${tag} Bravo`);
    const alpha = await newComposer(`${tag.toLowerCase()} alpha`);
    const word = await newComposer(`Aaron ${tag}x`);
    await newComposer(`Unrelated ${run}`);

    const found = await searchComposers(tag.toUpperCase());
    expect(found.map((c) => c.id)).toEqual([alpha.id, bravo.id, word.id]);
    expect(found[0]).toEqual(alpha);
  });

  test('treats LIKE wildcards literally', async () => {
    await newComposer(`Wild${run}card`);
    expect(await searchComposers(`Wild${run.slice(0, 7)}_`)).toEqual([]);
    expect(await searchComposers(`%${run}`)).toEqual([]);
    expect(await searchComposers(`Wild${run}`)).toHaveLength(1);
  });

  test('blank prefix returns at most 20 composers', async () => {
    expect((await searchComposers('  ')).length).toBeLessThanOrEqual(20);
  });
});

describe('setSongComposers', () => {
  test('replaces credits in the given order and refreshes composer_names', async () => {
    const a = await newComposer('Order A');
    const b = await newComposer('Order B');
    const c = await newComposer('Order C');
    const songId = await newSong([a.id, b.id]);

    expect(await setSongComposers(songId, [c.id, a.id])).toEqual({ ok: true, data: undefined });
    expect(await creditsOf(songId)).toEqual([
      { composerId: c.id, sortOrder: 0 },
      { composerId: a.id, sortOrder: 1 },
    ]);
    expect(await composerNamesOf(songId)).toBe(`${c.name} ${a.name}`);

    const [audit] = await getDb()
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.entity, 'song_composers'), eq(auditLog.entityId, songId)));
    expect(audit?.diff).toEqual({
      composerIds: { from: [a.id, b.id], to: [c.id, a.id] },
    });
  });

  test('unknown song → NOT_FOUND; unknown composer → VALIDATION, nothing changed', async () => {
    const a = await newComposer('Missing A');
    const songId = await newSong([a.id]);

    expect(await setSongComposers(randomUUID(), [a.id])).toMatchObject({
      error: { code: 'NOT_FOUND' },
    });
    expect(await setSongComposers(songId, [a.id, randomUUID()])).toMatchObject({
      error: { code: 'VALIDATION', fieldErrors: { composerIds: expect.any(Array) } },
    });
    expect(await creditsOf(songId)).toEqual([{ composerId: a.id, sortOrder: 0 }]);
  });
});

describe('setComposerPop', () => {
  test('sets the flag (music leader); contributors are refused', async () => {
    const c = await newComposer('Pop');
    as('music_leader');
    expect(await setComposerPop(c.id, 'current')).toEqual({ ok: true, data: undefined });
    as('contributor');
    expect(await setComposerPop(c.id, 'past')).toMatchObject({ ok: false });

    const [row] = await getDb().select().from(composers).where(eq(composers.id, c.id));
    expect(row?.popMember).toBe('current');
    as('admin');
    expect(await setComposerPop(randomUUID(), 'past')).toMatchObject({
      error: { code: 'NOT_FOUND' },
    });
  });
});

describe('mergeComposers', () => {
  test('re-points credits, collapses duplicates at the earlier position, deletes the drop', async () => {
    const keep = await newComposer('Keep');
    const drop = await newComposer('Drop', 'past');
    const other = await newComposer('Other');

    const s1 = await newSong([other.id, drop.id]); // drop only
    const s2 = await newSong([drop.id, other.id, keep.id]); // both; drop earlier
    const s3 = await newSong([keep.id, drop.id]); // both; keep earlier

    expect(await mergeComposers(keep.id, drop.id)).toEqual({ ok: true, data: undefined });

    expect(await creditsOf(s1)).toEqual([
      { composerId: other.id, sortOrder: 0 },
      { composerId: keep.id, sortOrder: 1 },
    ]);
    expect(await creditsOf(s2)).toEqual([
      { composerId: keep.id, sortOrder: 0 },
      { composerId: other.id, sortOrder: 1 },
    ]);
    expect(await creditsOf(s3)).toEqual([{ composerId: keep.id, sortOrder: 0 }]);
    expect(await composerNamesOf(s2)).toBe(`${keep.name} ${other.name}`);

    expect(await getDb().select().from(composers).where(eq(composers.id, drop.id))).toEqual([]);
    const [kept] = await getDb().select().from(composers).where(eq(composers.id, keep.id));
    expect(kept?.popMember).toBe('past'); // adopted from drop since keep was 'none'

    const songAudits = await getDb()
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.entity, 'song_composers'), inArray(auditLog.entityId, [s1, s2, s3])));
    expect(songAudits).toHaveLength(3);
  });

  test('missing composer → NOT_FOUND; same id → VALIDATION; contributor denied', async () => {
    const keep = await newComposer('Keep solo');
    expect(await mergeComposers(keep.id, randomUUID())).toMatchObject({
      error: { code: 'NOT_FOUND' },
    });
    expect(await mergeComposers(keep.id, keep.id)).toMatchObject({
      error: { code: 'VALIDATION' },
    });
    // Code not pinned: assertCan denials map to INTERNAL until CR LIB-07-assertcan-actionerror lands.
    as('contributor');
    expect(await mergeComposers(keep.id, randomUUID())).toMatchObject({ ok: false });
  });
});
