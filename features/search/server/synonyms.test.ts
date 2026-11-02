// Unit (H-02): synonym expansion as compiled SQL, the import planner, input validation and the
// guard rails of setThemeSynonyms. Behaviour against real data is in synonyms.int.test.ts.
import { readFileSync } from 'node:fs';

import { sql } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { users as fixtureUsers } from '@/fixtures';
import type { AppUser, Role } from '@/types/domain';

vi.mock('server-only', () => ({}));

const auth = vi.hoisted(() => ({ requireUser: vi.fn() }));
vi.mock('@/lib/auth', () => auth);

const db = vi.hoisted(() => ({
  getDb: vi.fn(() => {
    throw new Error('unexpected DB access');
  }),
  withTx: vi.fn(() => {
    throw new Error('unexpected DB access');
  }),
}));
vi.mock('@/lib/db', () => db);

const {
  expandThemeSynonyms,
  planVocabularyImport,
  SYNONYM_REWRITE_RULES,
  THEME_VOCABULARY_V1,
  themeSynonymsInputSchema,
  MAX_SYNONYMS,
} = await import('./synonyms');
const { buildSearchQuery } = await import('./query');
const { setThemeSynonyms } = await import('@/features/themes/server');

const dialect = new PgDialect();
const compile = (...args: Parameters<typeof buildSearchQuery>) =>
  dialect.sqlToQuery(buildSearchQuery(...args));

const THEME = '70000000-0000-4000-8000-000000000001';

describe('query expansion', () => {
  test('wraps the english query in ts_rewrite with the fixed rules', () => {
    const compiled = dialect.sqlToQuery(expandThemeSynonyms(sql`q`));
    expect(compiled.sql).toMatch(/^ts_rewrite\(q, \$\d+::text\)$/);
    const { params } = compiled;
    expect(params).toContain(SYNONYM_REWRITE_RULES);
  });

  test('buildSearchQuery expands only when themes are searched', () => {
    for (const fields of [undefined, [], ['themes'], ['title', 'themes']] as const) {
      const { sql, params } = compile({ q: 'honor', fields: fields as never });
      expect(sql, String(fields)).toContain('ts_rewrite(websearch_to_tsquery(');
      expect(params).toContain(SYNONYM_REWRITE_RULES);
    }
    for (const fields of [['title'], ['lyrics', 'composer']] as const) {
      const { sql, params } = compile({ q: 'honor', fields: [...fields] });
      expect(sql).not.toContain('ts_rewrite');
      expect(params).not.toContain(SYNONYM_REWRITE_RULES);
    }
  });

  test('no text, no expansion', () => {
    expect(compile({ fields: ['themes'] }).sql).not.toContain('ts_rewrite');
  });

  test('user text stays bound; the composer (simple) query is not expanded', () => {
    const evil = "honor'); drop table songs; --";
    const { sql, params } = compile({ q: evil });
    expect(sql).not.toContain('drop table');
    expect(params).toContain(evil);
    expect(sql).toMatch(/websearch_to_tsquery\('simple', extensions\.unaccent\(\$\d+\)\) as si/);
  });

  test('rules label theme lexemes with the themes weight and skip stop-word-only text', () => {
    expect(SYNONYM_REWRITE_RULES).toContain(`'\\&:B'`);
    expect(SYNONYM_REWRITE_RULES).toContain('plainto_tsquery');
    expect(SYNONYM_REWRITE_RULES).toContain('phraseto_tsquery');
    expect(SYNONYM_REWRITE_RULES).toMatch(/where r\.target is not null and r\.theme is not null/);
    // Runs inside ts_rewrite via SPI: every table is schema-qualified.
    expect(SYNONYM_REWRITE_RULES).toContain('from public.theme_synonyms');
    expect(SYNONYM_REWRITE_RULES).toContain('join public.themes');
  });
});

describe('themeSynonymsInputSchema', () => {
  test('normalizes like theme names and keeps input order', () => {
    expect(
      themeSynonymsInputSchema.parse({ themeId: THEME, synonyms: ['  Honor ', 'GLORY  of  god'] }),
    ).toEqual({ themeId: THEME, synonyms: ['honor', 'glory of god'] });
  });

  test('rejects blanks, long entries, too many and bad ids, keyed by index', () => {
    const blank = themeSynonymsInputSchema.safeParse({ themeId: THEME, synonyms: ['ok', '  '] });
    expect(blank.success).toBe(false);
    expect(blank.error?.issues[0]?.path).toEqual(['synonyms', 1]);
    expect(
      themeSynonymsInputSchema.safeParse({ themeId: THEME, synonyms: ['x'.repeat(61)] }).success,
    ).toBe(false);
    expect(
      themeSynonymsInputSchema.safeParse({
        themeId: THEME,
        synonyms: Array.from({ length: MAX_SYNONYMS + 1 }, (_, i) => `s${i}`),
      }).success,
    ).toBe(false);
    expect(themeSynonymsInputSchema.safeParse({ themeId: 'nope', synonyms: [] }).success).toBe(
      false,
    );
  });
});

describe('THEME_VOCABULARY_V1', () => {
  test('is content/themes-v1.json, already normalized', () => {
    const raw = JSON.parse(readFileSync('content/themes-v1.json', 'utf8')) as unknown;
    expect(THEME_VOCABULARY_V1).toEqual(raw);
    expect(THEME_VOCABULARY_V1.length).toBeGreaterThan(100);
  });

  test('imports cleanly into an empty database: nothing skipped', () => {
    const plan = planVocabularyImport(THEME_VOCABULARY_V1, { themes: [], synonyms: [] });
    expect(plan.newThemes).toHaveLength(THEME_VOCABULARY_V1.length);
    expect(plan.add).toHaveLength(THEME_VOCABULARY_V1.flatMap((e) => e.synonyms).length);
    expect(plan.skipped).toEqual([]);
  });
});

describe('planVocabularyImport', () => {
  const state = {
    themes: [
      { id: 'g', name: 'glory' },
      { id: 'h', name: 'honor' },
      { id: 'k', name: 'king' },
    ],
    synonyms: [
      { themeId: 'g', synonym: 'glorious' },
      { themeId: 'k', synonym: 'reign' },
      { themeId: 'missing', synonym: 'orphan' },
    ],
  };

  test('creates missing themes once and adds only new synonyms', () => {
    const plan = planVocabularyImport(
      [
        { name: 'glory', synonyms: ['glorious', 'splendor', 'splendor'] },
        { name: 'mercy', synonyms: ['merciful', 'orphan'] },
        { name: 'mercy', synonyms: ['compassion'] },
      ],
      state,
    );
    expect(plan.newThemes).toEqual(['mercy']);
    expect(plan.add).toEqual([
      { theme: 'glory', synonym: 'splendor' },
      { theme: 'mercy', synonym: 'merciful' },
      { theme: 'mercy', synonym: 'orphan' },
      { theme: 'mercy', synonym: 'compassion' },
    ]);
    expect(plan.skipped).toEqual([]);
  });

  test('skips synonyms that are theme names or belong to another theme', () => {
    const plan = planVocabularyImport(
      [
        { name: 'glory', synonyms: ['honor', 'reign', 'majesty'] },
        { name: 'majesty', synonyms: [] },
        { name: 'power', synonyms: ['mighty'] },
        { name: 'strength', synonyms: ['mighty'] },
      ],
      state,
    );
    expect(plan.newThemes).toEqual(['majesty', 'power', 'strength']);
    expect(plan.add).toEqual([{ theme: 'power', synonym: 'mighty' }]);
    expect(plan.skipped).toEqual([
      { theme: 'glory', synonym: 'honor', reason: 'theme_name' },
      { theme: 'glory', synonym: 'reign', reason: 'other_theme' },
      { theme: 'glory', synonym: 'majesty', reason: 'theme_name' },
      { theme: 'strength', synonym: 'mighty', reason: 'other_theme' },
    ]);
  });

  test('a second run of the same file plans nothing', () => {
    const vocab = [{ name: 'mercy', synonyms: ['merciful'] }];
    const after = {
      themes: [...state.themes, { id: 'm', name: 'mercy' }],
      synonyms: [...state.synonyms, { themeId: 'm', synonym: 'merciful' }],
    };
    expect(planVocabularyImport(vocab, after)).toEqual({ newThemes: [], add: [], skipped: [] });
  });
});

function userWith(role: Role): AppUser {
  const base = fixtureUsers[0];
  if (!base) throw new Error('fixture users missing');
  return { ...base, role, disabledAt: null, accessStatus: 'approved' };
}

describe('setThemeSynonyms guard rails', () => {
  beforeEach(() => {
    auth.requireUser.mockReset();
    db.withTx.mockClear();
  });

  test('signed out → UNAUTHENTICATED, no DB', async () => {
    const { ActionError } = await import('@/lib/action');
    auth.requireUser.mockRejectedValue(new ActionError('UNAUTHENTICATED', 'Sign in.'));
    const result = await setThemeSynonyms(THEME, ['honor']);
    expect(result).toMatchObject({ ok: false, error: { code: 'UNAUTHENTICATED' } });
    expect(db.withTx).not.toHaveBeenCalled();
  });

  test.each<Role>(['member', 'contributor'])('%s → FORBIDDEN', async (role) => {
    auth.requireUser.mockResolvedValue(userWith(role));
    const result = await setThemeSynonyms(THEME, ['honor']);
    expect(result).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
    expect(db.withTx).not.toHaveBeenCalled();
  });

  test('invalid input → VALIDATION keyed by index, no DB', async () => {
    auth.requireUser.mockResolvedValue(userWith('music_leader'));
    const result = await setThemeSynonyms(THEME, ['fine', '   ']);
    expect(result).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION', fieldErrors: { 'synonyms.1': expect.any(Array) } },
    });
    expect(db.withTx).not.toHaveBeenCalled();
  });
});
