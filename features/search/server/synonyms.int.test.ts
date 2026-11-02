// @vitest-environment node
// Integration (H-02): theme synonym expansion in buildSearchQuery, setThemeSynonyms and the
// vocabulary import against the local Supabase database. Needs migrations applied
// (`pnpm db:start && pnpm db:migrate`). CI exports the stack's env; locally it comes from
// .env.local, which Vitest doesn't load on its own. The signed-in user is stubbed. Every theme
// and song this suite creates has a random letters-only tag in its name and is removed
// afterwards; the full v1 vocabulary is only imported inside a rolled-back transaction, so
// other suites never see its synonyms.
import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';

import type { AppUser, Role, SearchParams } from '@/types/domain';

import type { SearchRow } from './query';

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
const { buildSearchQuery } = await import('./query');
const { applyThemeVocabulary, loadAdminThemes, SYNONYM_REWRITE_RULES, THEME_VOCABULARY_V1 } =
  await import('./synonyms');
const { createTheme, mergeThemes, setThemeSynonyms } = await import('@/features/themes/server');

/** Letters only, so each tagged word is one plain lexeme. */
const tag = Array.from(randomUUID().replace(/-/g, '').slice(0, 10), (c) =>
  String.fromCharCode(97 + (parseInt(c, 16) % 26)),
).join('');
const w = (word: string) => `${word}${tag}`;
const actorId = randomUUID();
const songIds: string[] = [];

function signInAs(role: Role) {
  auth.current = {
    id: actorId,
    email: `${actorId}@example.test`,
    name: 'H-02 test',
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

async function newSong(title: string, opts: { themeId?: string; lyrics?: string } = {}) {
  const [row] = await getDb()
    .insert(songs)
    .values({ title: `${title} ${tag}`, chorusLyrics: opts.lyrics ?? null })
    .returning({ id: songs.id });
  if (!row) throw new Error('song insert failed');
  songIds.push(row.id);
  if (opts.themeId) {
    await getDb().insert(songThemes).values({
      songId: row.id,
      themeId: opts.themeId,
      section: 'chorus',
    });
  }
  return row.id;
}

/** Ids of this suite's songs matching `params`. */
async function found(params: SearchParams): Promise<string[]> {
  const rows = [
    ...(await getDb().execute<SearchRow>(buildSearchQuery({ pageSize: 100, ...params }))),
  ];
  return rows.map((r) => r.id).filter((id) => songIds.includes(id));
}

async function synonymsOf(themeId: string): Promise<string[]> {
  const rows = await getDb()
    .select({ synonym: themeSynonyms.synonym })
    .from(themeSynonyms)
    .where(eq(themeSynonyms.themeId, themeId));
  return rows.map((r) => r.synonym).sort();
}

beforeAll(async () => {
  await getDb().execute(
    sql`insert into auth.users (id, email) values (${actorId}, ${`${actorId}@example.test`})`,
  );
  await getDb()
    .insert(users)
    .values({
      id: actorId,
      email: `${actorId}@example.test`,
      name: 'H-02 test',
      authProvider: 'password',
    });
  // Nested suites' beforeAll hooks create themes before any beforeEach runs.
  signInAs('music_leader');
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

describe('query expansion', () => {
  let gloryId = '';
  let glorySong = '';
  let lyricSong = '';

  beforeAll(async () => {
    gloryId = await newTheme(w('glory'));
    glorySong = await newSong('Tagged', { themeId: gloryId });
    // Mentions the theme word in its lyrics but isn't tagged with it.
    lyricSong = await newSong('Lyric only', { lyrics: `sing of ${w('glory')}` });
  });

  test('without a synonym, the word finds nothing', async () => {
    expect(await found({ q: w('honor'), fields: ['themes'] })).toEqual([]);
  });

  test('a synonym finds songs tagged with its theme, only through the themes field', async () => {
    expect(await setThemeSynonyms(gloryId, [w('honor')])).toEqual({ ok: true, data: undefined });

    expect(await found({ q: w('honor'), fields: ['themes'] })).toEqual([glorySong]);
    expect(await found({ q: w('honor') })).toEqual([glorySong]);
    expect(await found({ q: w('honor'), fields: ['title', 'themes'] })).toEqual([glorySong]);
    // Title or lyrics only: no expansion.
    expect(await found({ q: w('honor'), fields: ['title', 'lyrics'] })).toEqual([]);
    // The theme word itself still finds both the tagged and the lyric song.
    expect((await found({ q: w('glory') })).sort()).toEqual([glorySong, lyricSong].sort());
  });

  test('expansion matches theme tags, never lyrics', async () => {
    expect(await found({ q: w('honor') })).not.toContain(lyricSong);
  });

  test('combines with the other query words', async () => {
    const kingSong = await newSong(w('king'), { themeId: gloryId });
    expect(await found({ q: `${w('honor')} ${w('king')}` })).toEqual([kingSong]);
    expect(await found({ q: `${w('honor')} -${w('king')}` })).toEqual([glorySong]);
    expect(await found({ q: `${w('honor')} or ${w('missing')}` })).toContain(glorySong);
  });

  test('multi-word synonyms match their words in any order', async () => {
    expect(await setThemeSynonyms(gloryId, [w('honor'), `${w('crown')} ${w('splendor')}`])).toEqual(
      { ok: true, data: undefined },
    );
    const hits = await found({ q: `${w('splendor')} ${w('crown')}`, fields: ['themes'] });
    expect(hits).toContain(glorySong);
    // One of the two words alone isn't the synonym.
    expect(await found({ q: w('crown'), fields: ['themes'] })).toEqual([]);
  });

  test('removing the synonym stops the expansion', async () => {
    expect(await setThemeSynonyms(gloryId, [])).toEqual({ ok: true, data: undefined });
    expect(await found({ q: w('honor'), fields: ['themes'] })).toEqual([]);
  });

  test('merging "honor" into "glory" makes honor find glory songs', async () => {
    const honorId = await newTheme(w('honor'));
    const honorSong = await newSong('Honor tagged', { themeId: honorId });
    expect(await mergeThemes(gloryId, honorId)).toEqual({ ok: true, data: undefined });
    const hits = await found({ q: w('honor'), fields: ['themes'] });
    expect(hits).toContain(glorySong);
    expect(hits).toContain(honorSong);
    expect(await synonymsOf(gloryId)).toEqual([w('honor')]);
  });
});

describe('setThemeSynonyms', () => {
  let themeId = '';
  let otherId = '';

  beforeAll(async () => {
    themeId = await newTheme(w('mercy'));
    otherId = await newTheme(w('grace'));
    await getDb()
      .insert(themeSynonyms)
      .values({ themeId: otherId, synonym: w('favor') });
  });

  test('replaces all synonyms, normalized and deduplicated, and audits the change', async () => {
    expect(
      await setThemeSynonyms(themeId, [`  ${w('Merciful')} `, w('merciful'), w('compassion')]),
    ).toEqual({ ok: true, data: undefined });
    expect(await synonymsOf(themeId)).toEqual([w('compassion'), w('merciful')].sort());

    expect(await setThemeSynonyms(themeId, [w('compassion'), w('mercy')])).toEqual({
      ok: true,
      data: undefined,
    });
    // The theme's own name is dropped silently.
    expect(await synonymsOf(themeId)).toEqual([w('compassion')]);

    const audits = await getDb()
      .select({ action: auditLog.action, diff: auditLog.diff })
      .from(auditLog)
      .where(
        and(
          eq(auditLog.actorId, actorId),
          eq(auditLog.entity, 'theme'),
          eq(auditLog.entityId, themeId),
          eq(auditLog.action, 'update'),
        ),
      )
      .orderBy(auditLog.createdAt);
    expect(audits.map((a) => a.diff)).toEqual([
      { synonyms: { from: [], to: [w('compassion'), w('merciful')].sort() } },
      { synonyms: { from: [w('compassion'), w('merciful')].sort(), to: [w('compassion')] } },
    ]);
  });

  test('no change, no audit', async () => {
    const count = async () =>
      (
        await getDb()
          .select({ id: auditLog.id })
          .from(auditLog)
          .where(eq(auditLog.entityId, themeId))
      ).length;
    const before = await count();
    expect(await setThemeSynonyms(themeId, [w('compassion')])).toEqual({
      ok: true,
      data: undefined,
    });
    expect(await count()).toBe(before);
  });

  test('a theme name or another theme’s synonym is rejected by index', async () => {
    const result = await setThemeSynonyms(themeId, [w('ok'), w('grace'), w('favor')]);
    expect(result).toMatchObject({
      ok: false,
      error: {
        code: 'VALIDATION',
        fieldErrors: {
          'synonyms.1': [expect.stringContaining('is a theme')],
          'synonyms.2': [expect.stringContaining(`synonym of "${w('grace')}"`)],
        },
      },
    });
    expect(await synonymsOf(themeId)).toEqual([w('compassion')]);
  });

  test('missing theme → NOT_FOUND; contributor → FORBIDDEN', async () => {
    expect(await setThemeSynonyms(randomUUID(), [w('x')])).toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND' },
    });
    signInAs('contributor');
    expect(await setThemeSynonyms(themeId, [])).toMatchObject({
      ok: false,
      error: { code: 'FORBIDDEN' },
    });
    expect(await synonymsOf(themeId)).toEqual([w('compassion')]);
  });

  test('loadAdminThemes returns synonyms and song counts', async () => {
    await newSong('Mercy one', { themeId });
    await newSong('Mercy two', { themeId });
    const rows = (await loadAdminThemes(getDb())).filter((t) => t.name.includes(tag));
    expect(rows.find((t) => t.id === themeId)).toEqual({
      id: themeId,
      name: w('mercy'),
      synonyms: [w('compassion')],
      songCount: 2,
    });
    expect(rows.find((t) => t.id === otherId)).toMatchObject({
      synonyms: [w('favor')],
      songCount: 0,
    });
    const names = rows.map((t) => t.name);
    expect(names).toEqual([...names].sort());
  });
});

describe('applyThemeVocabulary', () => {
  test('creates missing themes and synonyms, skips conflicts, and is idempotent', async () => {
    const existing = await newTheme(w('peace'));
    const vocabulary = [
      { name: w('peace'), synonyms: [w('calm'), w('rest')] },
      { name: w('joy'), synonyms: [w('gladness'), w('peace'), w('calm')] },
    ];
    const first = await getDb().transaction((tx) => applyThemeVocabulary(tx, actorId, vocabulary));
    expect(first).toEqual({
      themesCreated: 1,
      synonymsAdded: 3,
      skipped: [
        { theme: w('joy'), synonym: w('peace'), reason: 'theme_name' },
        { theme: w('joy'), synonym: w('calm'), reason: 'other_theme' },
      ],
    });
    expect(await synonymsOf(existing)).toEqual([w('calm'), w('rest')]);
    const [joy] = await getDb()
      .select()
      .from(themes)
      .where(eq(themes.name, w('joy')));
    expect(joy?.createdBy).toBe(actorId);
    expect(await synonymsOf(joy!.id)).toEqual([w('gladness')]);

    const second = await getDb().transaction((tx) => applyThemeVocabulary(tx, actorId, vocabulary));
    expect(second).toEqual({ themesCreated: 0, synonymsAdded: 0, skipped: first.skipped });
  });

  test('the full v1 vocabulary imports and its rules run in a search (rolled back)', async () => {
    const rollback = new Error('rollback');
    let checked = false;
    await expect(
      getDb().transaction(async (tx) => {
        const result = await applyThemeVocabulary(tx, actorId, THEME_VOCABULARY_V1);
        expect(result.synonymsAdded).toBeGreaterThan(300);
        // "abba" is a v1 synonym of "god the father"; the rewrite must parse and run.
        const rows = [
          ...(await tx.execute<SearchRow>(
            buildSearchQuery({ q: 'abba heavenly father', fields: ['themes'] }),
          )),
        ];
        expect(Array.isArray(rows)).toBe(true);
        const [rewritten] = [
          ...(await tx.execute<{ q: string }>(
            sql`select ts_rewrite(websearch_to_tsquery('english', 'abba'),
                  ${SYNONYM_REWRITE_RULES}::text)::text as q`,
          )),
        ];
        expect(rewritten?.q).toBe(`'abba' | 'god':B <2> 'father':B`);
        checked = true;
        throw rollback;
      }),
    ).rejects.toBe(rollback);
    expect(checked).toBe(true);
    const leftover = await getDb()
      .select({ id: themeSynonyms.themeId })
      .from(themeSynonyms)
      .where(eq(themeSynonyms.synonym, 'abba'));
    expect(leftover).toEqual([]);
  });
});
