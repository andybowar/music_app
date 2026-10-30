// @vitest-environment node
// Integration (LIB-04): theme actions against the local Supabase database. Needs migrations
// applied (`pnpm db:start && pnpm db:migrate`). CI exports the stack's env; locally it comes
// from .env.local, which Vitest doesn't load on its own. The signed-in user is stubbed; every
// row this suite creates carries a random tag and is removed afterwards.
import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';

import type { AppUser, Role } from '@/types/domain';

vi.mock('server-only', () => ({}));

const auth = vi.hoisted(() => ({ current: null as AppUser | null }));
vi.mock('@/lib/auth', () => ({
  requireUser: async () => {
    if (!auth.current) throw new Error('no user stubbed');
    return auth.current;
  },
}));

if (!process.env.DATABASE_URL && existsSync('.env.local')) process.loadEnvFile('.env.local');

const { and, eq, inArray, like, sql } = await import('drizzle-orm');
const { auditLog, songs, songThemes, themes, themeSynonyms, users } = await import('@/db/schema');
const { getDb } = await import('@/lib/db');
const { createTheme, mergeThemes, searchThemes, setSongThemes } = await import('./server');

const tag = randomUUID().replace(/-/g, '').slice(0, 8);
const actorId = randomUUID();
const songIds: string[] = [];

function signInAs(role: Role) {
  auth.current = {
    id: actorId,
    email: `${actorId}@example.test`,
    name: 'LIB-04 test',
    branchId: null,
    role,
    authProvider: 'password',
    disabledAt: null,
    accessStatus: 'approved',
  };
}

async function newTheme(name: string): Promise<string> {
  const result = await createTheme(name);
  if (!result.ok) throw new Error(`createTheme failed: ${result.error.message}`);
  return result.data.id;
}

async function newSong(title: string, opts: { deleted?: boolean } = {}): Promise<string> {
  const [row] = await getDb()
    .insert(songs)
    .values({ title: `${title} ${tag}`, deletedAt: opts.deleted ? new Date() : null })
    .returning({ id: songs.id });
  if (!row) throw new Error('song insert failed');
  songIds.push(row.id);
  return row.id;
}

async function tagsOf(songId: string) {
  const rows = await getDb()
    .select({ section: songThemes.section, themeId: songThemes.themeId })
    .from(songThemes)
    .where(eq(songThemes.songId, songId));
  return rows.map((r) => `${r.section}:${r.themeId}`).sort();
}

async function themeNamesOf(songId: string): Promise<string> {
  const [row] = await getDb()
    .select({ themeNames: songs.themeNames })
    .from(songs)
    .where(eq(songs.id, songId));
  return row?.themeNames ?? '';
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
      name: 'LIB-04 test',
      authProvider: 'password',
    });
});

afterAll(async () => {
  const db = getDb();
  if (songIds.length > 0) await db.delete(songs).where(inArray(songs.id, songIds));
  await db.delete(themes).where(like(themes.name, `%${tag}%`));
  await db.delete(auditLog).where(eq(auditLog.actorId, actorId));
  await db.execute(sql`delete from auth.users where id = ${actorId}`);
  await db.$client.end();
});

beforeEach(() => signInAs('music_leader'));

describe('createTheme', () => {
  test('"  Glory  Honor " and "glory honor" resolve to the same theme', async () => {
    const first = await createTheme(`  Glory  Honor ${tag.toUpperCase()} `);
    const second = await createTheme(`glory honor ${tag}`);
    expect(first).toEqual({
      ok: true,
      data: { id: expect.any(String), name: `glory honor ${tag}` },
    });
    expect(second).toEqual(first);

    const rows = await getDb()
      .select()
      .from(themes)
      .where(eq(themes.name, `glory honor ${tag}`));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.createdBy).toBe(actorId);

    const audits = await getDb()
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.entity, 'theme'), eq(auditLog.entityId, rows[0]?.id ?? '')));
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ action: 'create', actorId });
  });
});

describe('searchThemes', () => {
  test('ranks prefix, then word prefix, then close spellings; escapes LIKE wildcards', async () => {
    const prefixed = await newTheme(`q${tag} hallelujah`);
    const wordPrefixed = await newTheme(`praise q${tag}`);
    await newTheme(`zz${tag} unrelated`);

    const hits = await searchThemes(`  Q${tag} `);
    expect(hits.map((t) => t.id).slice(0, 2)).toEqual([prefixed, wordPrefixed]);

    const typo = await searchThemes(`q${tag} halelujah`);
    expect(typo[0]?.id).toBe(prefixed);

    // Too short for fuzzy matching, so only a literal "%" prefix could match.
    expect(await searchThemes('%')).toEqual([]);
    expect(await searchThemes('_')).toEqual([]);
    expect(await searchThemes(`q${tag}`, 1)).toHaveLength(1);
  });

  test('members can search', async () => {
    signInAs('member');
    const hits = await searchThemes(`glory honor ${tag}`);
    expect(hits.map((t) => t.name)).toContain(`glory honor ${tag}`);
  });
});

describe('setSongThemes', () => {
  test('replaces all tags, ignores duplicates, refreshes theme_names and audits', async () => {
    const songId = await newSong('Tagged');
    const a = await newTheme(`alpha ${tag}`);
    const b = await newTheme(`beta ${tag}`);

    expect(
      await setSongThemes(songId, [
        { section: 'chorus', themeId: a },
        { section: 'chorus', themeId: a },
        { section: 'verse_1', themeId: b },
      ]),
    ).toEqual({ ok: true, data: undefined });
    expect(await tagsOf(songId)).toEqual([`chorus:${a}`, `verse_1:${b}`].sort());
    expect(await themeNamesOf(songId)).toContain(`alpha ${tag}`);

    expect(await setSongThemes(songId, [{ section: 'bridge', themeId: b }])).toMatchObject({
      ok: true,
    });
    expect(await tagsOf(songId)).toEqual([`bridge:${b}`]);
    expect(await themeNamesOf(songId)).not.toContain(`alpha ${tag}`);

    const audits = await getDb()
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.entity, 'song_themes'), eq(auditLog.entityId, songId)));
    expect(audits).toHaveLength(2);
    expect(audits.map((r) => r.diff)).toContainEqual({
      chorus: { from: [`alpha ${tag}`], to: null },
      verse_1: { from: [`beta ${tag}`], to: null },
      bridge: { from: null, to: [`beta ${tag}`] },
    });

    expect(await setSongThemes(songId, [])).toMatchObject({ ok: true });
    expect(await tagsOf(songId)).toEqual([]);
  });

  test('unknown themes are a validation error and change nothing', async () => {
    const songId = await newSong('Unknown theme');
    const a = await newTheme(`gamma ${tag}`);
    await setSongThemes(songId, [{ section: 'chorus', themeId: a }]);

    const result = await setSongThemes(songId, [
      { section: 'chorus', themeId: a },
      { section: 'verse_2', themeId: randomUUID() },
    ]);
    expect(result).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION', fieldErrors: { 'entries.1.themeId': expect.any(Array) } },
    });
    expect(await tagsOf(songId)).toEqual([`chorus:${a}`]);
  });

  test('missing or deleted songs are NOT_FOUND', async () => {
    const deleted = await newSong('Deleted', { deleted: true });
    for (const id of [deleted, randomUUID()]) {
      expect(await setSongThemes(id, [])).toMatchObject({
        ok: false,
        error: { code: 'NOT_FOUND' },
      });
    }
  });
});

describe('mergeThemes', () => {
  test('moves all song_themes to the kept theme without duplicates', async () => {
    const keep = await newTheme(`keep ${tag}`);
    const drop = await newTheme(`drop ${tag}`);
    await getDb()
      .insert(themeSynonyms)
      .values({ themeId: drop, synonym: `dropped alias ${tag}` });
    const one = await newSong('Merge one');
    const two = await newSong('Merge two');
    await setSongThemes(one, [
      { section: 'chorus', themeId: keep },
      { section: 'chorus', themeId: drop },
      { section: 'verse_1', themeId: drop },
    ]);
    await setSongThemes(two, [{ section: 'bridge', themeId: drop }]);

    expect(await mergeThemes(keep, drop)).toEqual({ ok: true, data: undefined });

    expect(await tagsOf(one)).toEqual([`chorus:${keep}`, `verse_1:${keep}`].sort());
    expect(await tagsOf(two)).toEqual([`bridge:${keep}`]);
    expect(await themeNamesOf(two)).toContain(`keep ${tag}`);
    expect(await themeNamesOf(two)).not.toContain(`drop ${tag}`);

    expect(await getDb().select().from(themes).where(eq(themes.id, drop))).toEqual([]);
    const synonyms = await getDb()
      .select({ synonym: themeSynonyms.synonym })
      .from(themeSynonyms)
      .where(eq(themeSynonyms.themeId, keep));
    expect(synonyms.map((s) => s.synonym).sort()).toEqual(
      [`drop ${tag}`, `dropped alias ${tag}`].sort(),
    );

    const audits = await getDb()
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.entity, 'theme'), eq(auditLog.entityId, drop)));
    expect(audits.map((r) => r.action).sort()).toEqual(['create', 'delete']);
  });

  test('missing themes are NOT_FOUND; contributors are FORBIDDEN', async () => {
    const keep = await newTheme(`lonely ${tag}`);
    expect(await mergeThemes(keep, randomUUID())).toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND' },
    });

    signInAs('contributor');
    const other = await newTheme(`other ${tag}`);
    expect(await mergeThemes(keep, other)).toMatchObject({
      ok: false,
      error: { code: 'FORBIDDEN' },
    });
  });
});
