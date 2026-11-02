// @vitest-environment node
// Unit (SRCH-03): the fuzzy statement compiled without a database, and how fuzzyFallback merges
// it with full-text results. Behaviour against real data is in fuzzy.int.test.ts.
import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import type { FuzzyRow } from './fuzzy';
import type { SearchRow } from './query';

vi.mock('server-only', () => ({}));

const { buildFuzzyQuery, fuzzyFallback, shouldFallback, FUZZY_THRESHOLD } = await import('./fuzzy');

const dialect = new PgDialect();
const squash = (s: string) => s.replace(/\s+/g, ' ');
const page = { offset: 0, limit: 50, excludeIds: [] as string[] };
const compile = (...args: Parameters<typeof buildFuzzyQuery>) =>
  dialect.sqlToQuery(buildFuzzyQuery(...args));

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function row(n: number, over: Partial<SearchRow> = {}): SearchRow {
  return {
    id: id(n),
    title: `Song ${n}`,
    year: null,
    tempoBpm: null,
    timeSignature: null,
    energyLevel: null,
    primaryKey: null,
    composers: [],
    addedByBranchCode: null,
    resourceCount: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    rank: 0,
    total: 0,
    ...over,
  };
}

function fuzzyRow(n: number | null, fuzzyTotal: number, didYouMean: string | null): FuzzyRow {
  const base = n === null ? emptyRow() : row(n, { rank: 0.5 });
  return { ...base, fuzzyTotal, didYouMean };
}

function emptyRow(): FuzzyRow {
  const r = row(0);
  return Object.fromEntries(Object.keys(r).map((k) => [k, null])) as unknown as FuzzyRow;
}

describe('shouldFallback', () => {
  test('needs q and fewer than 3 full-text matches', () => {
    expect(shouldFallback({}, 0)).toBe(false);
    expect(shouldFallback({ q: '   ' }, 0)).toBe(false);
    expect(shouldFallback({ q: 'x' }, 0)).toBe(true);
    expect(shouldFallback({ q: 'x' }, 2)).toBe(true);
    expect(shouldFallback({ q: 'x' }, 3)).toBe(false);
  });

  test('only when the title field is searched', () => {
    expect(shouldFallback({ q: 'x', fields: [] }, 0)).toBe(true);
    expect(shouldFallback({ q: 'x', fields: ['title', 'lyrics'] }, 0)).toBe(true);
    expect(shouldFallback({ q: 'x', fields: ['lyrics', 'themes'] }, 0)).toBe(false);
  });
});

describe('buildFuzzyQuery', () => {
  test('trigram similarity on title and alt titles, lower-cased q, threshold bound', () => {
    const { sql, params } = compile({ q: '  HaleLujahs ' }, page);
    const s = squash(sql);
    expect(s).toContain('extensions.similarity(lower(c.txt)');
    expect(s).toContain('unnest(array[s.title] || s.alt_titles)');
    expect(s).toContain('s.deleted_at is null');
    expect(params).toContain('halelujahs');
    expect(params).toContain(FUZZY_THRESHOLD);
    expect(s).toContain('order by m.score desc');
  });

  test('page offset/limit and exclusions are bound', () => {
    const { params } = compile({ q: 'x' }, { offset: 3, limit: 7, excludeIds: [id(1), id(2)] });
    expect(params.slice(-2)).toEqual([7, 3]);
    expect(params).toContain(`{${id(1)},${id(2)}}`);
    expect(compile({ q: 'x' }, page).params).toContain('{}');
  });

  test('filters apply; branch joins usage with default levels', () => {
    const { sql, params } = compile(
      {
        q: 'x',
        energy: ['high_praise'],
        key: ['G'],
        decade: [1990],
        branch: 'SB',
        chordChorus: ['C'],
        chordVerse: ['D'],
        chordBridge: ['E'],
      },
      page,
    );
    const s = squash(sql);
    expect(s).toContain('s.energy_level in ($');
    expect(s).toContain('k.key in ($');
    expect(s).toContain('s.year >= $');
    expect(s).toContain('left join branch_usage su');
    expect(s).toContain('pk.chorus_chord in');
    expect(s).toContain('pk.verse_chord in');
    expect(s).toContain('pk.bridge_chord in');
    expect(params).toEqual(expect.arrayContaining(['SB', 'high', 'low', 'rare', 1990, 2000]));
    expect(compile({ q: 'x' }, page).sql).not.toContain('branch_usage');
    expect(compile({ q: 'x', branch: 'SB', usage: ['none'] }, page).params).not.toContain('high');
  });

  test('user input is bound, never interpolated', () => {
    const evil = "x'); drop table songs; --";
    const { sql } = compile({ q: evil, branch: evil, key: [evil as never] }, page);
    expect(sql).not.toContain('drop table');
  });
});

describe('fuzzyFallback', () => {
  const execute = vi.fn();
  const results: unknown[][] = [];
  const db = { execute } as unknown as Parameters<typeof fuzzyFallback>[0];

  beforeEach(() => {
    results.length = 0;
    execute.mockReset();
    execute.mockImplementation(async () => results.shift() ?? []);
  });

  test('not applicable: null, no query', async () => {
    expect(await fuzzyFallback(db, { q: 'grace' }, {}, [], 3)).toBeNull();
    expect(await fuzzyFallback(db, {}, {}, [], 0)).toBeNull();
    expect(execute).not.toHaveBeenCalled();
  });

  test('no full-text matches: fuzzy rows, total, did-you-mean; one query', async () => {
    results.push([fuzzyRow(5, 2, '1000 Hallelujahs'), fuzzyRow(6, 2, '1000 Hallelujahs')]);
    const r = await fuzzyFallback(db, { q: 'halelujahs' }, {}, [], 0);
    expect(r!.rows.map((x) => x.id)).toEqual([id(5), id(6)]);
    expect(r!.rows[0]).not.toHaveProperty('fuzzyTotal');
    expect(r!.rows[0]!.total).toBe(2);
    expect(r).toMatchObject({ total: 2, didYouMean: '1000 Hallelujahs' });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  test('full-text matches come first and are excluded from the fuzzy part', async () => {
    results.push([fuzzyRow(5, 1, 'Grace')]);
    const fts = [row(1, { total: 1 })];
    const r = await fuzzyFallback(db, { q: 'grac' }, {}, fts, 1);
    expect(r!.rows.map((x) => x.id)).toEqual([id(1), id(5)]);
    expect(r!.total).toBe(2);
    const { params } = dialect.sqlToQuery(execute.mock.calls[0]![0]);
    expect(params).toContain(`{${id(1)}}`);
    expect(params.slice(-2)).toEqual([49, 0]);
  });

  test('no fuzzy matches: empty totals row, no did-you-mean', async () => {
    results.push([fuzzyRow(null, 0, null)]);
    const r = await fuzzyFallback(db, { q: 'zzzz' }, {}, [], 0);
    expect(r).toEqual({ rows: [], total: 0 });
  });

  test('no rows at all is treated as no matches', async () => {
    results.push([]);
    expect(await fuzzyFallback(db, { q: 'zzzz' }, {}, [], 0)).toEqual({ rows: [], total: 0 });
  });

  test('did-you-mean equal to q (ignoring case) is dropped', async () => {
    results.push([fuzzyRow(5, 1, 'Grace')]);
    const r = await fuzzyFallback(db, { q: 'GRACE' }, {}, [], 0);
    expect(r).not.toHaveProperty('didYouMean');
  });

  test('later page: re-reads the full-text matches, then offsets the fuzzy part', async () => {
    results.push([row(1, { total: 2 }), row(2, { total: 2 })], [fuzzyRow(9, 5, 'Xylophone')]);
    const r = await fuzzyFallback(db, { q: 'x', page: 2, pageSize: 3 }, {}, [], 2);
    expect(execute).toHaveBeenCalledTimes(2);
    // Page 2 of size 3 is combined positions 3..5: fuzzy positions 1..3.
    const { params } = dialect.sqlToQuery(execute.mock.calls[1]![0]);
    expect(params.slice(-2)).toEqual([3, 1]);
    expect(r).toMatchObject({ total: 7, didYouMean: 'Xylophone' });
    expect(r!.rows.map((x) => x.id)).toEqual([id(9)]);
  });

  test('page smaller than the full-text matches: slices them, no fuzzy rows on the page', async () => {
    results.push([row(1, { total: 2 }), row(2, { total: 2 })], [fuzzyRow(null, 4, 'Y')]);
    const r = await fuzzyFallback(db, { q: 'x', pageSize: 1 }, {}, [row(1)], 2);
    expect(r!.rows.map((x) => x.id)).toEqual([id(1)]);
    const { params } = dialect.sqlToQuery(execute.mock.calls[1]![0]);
    expect(params.slice(-2)).toEqual([0, 0]);
    expect(r).toMatchObject({ total: 6, didYouMean: 'Y' });
  });
});
