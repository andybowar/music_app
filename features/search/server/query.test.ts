// Unit (SRCH-01): the statement buildSearchQuery emits, compiled without a database.
// Behaviour against real data is covered by query.int.test.ts.
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, test, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { buildSearchQuery, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } = await import('./query');

const dialect = new PgDialect();
const compile = (...args: Parameters<typeof buildSearchQuery>) =>
  dialect.sqlToQuery(buildSearchQuery(...args));
const squash = (s: string) => s.replace(/\s+/g, ' ');

describe('buildSearchQuery', () => {
  test('default: date desc, then title; default page size; no text search', () => {
    const { sql, params } = compile({});
    expect(squash(sql)).toContain(
      'order by s.created_at desc, lower(extensions.unaccent(s.title))',
    );
    expect(sql).not.toContain('websearch_to_tsquery');
    expect(sql).not.toContain('branch_usage su');
    expect(params.slice(-2)).toEqual([DEFAULT_PAGE_SIZE, 0]);
  });

  test('user input is bound, never interpolated', () => {
    const evil = "x'); drop table songs; --";
    const { sql, params } = compile({
      q: evil,
      key: [evil],
      branch: evil,
      chordChorus: [evil],
      energy: [evil as never],
    });
    expect(sql).not.toContain('drop table');
    expect(params.filter((p) => p === evil).length).toBeGreaterThanOrEqual(5);
  });

  test('field selection maps to search_vector weights', () => {
    expect(compile({ q: 'x', fields: ['themes', 'title'] }).params).toContain('{a,b}');
    expect(compile({ q: 'x', fields: ['lyrics'] }).sql).not.toContain('tq.si');
    expect(compile({ q: 'x', fields: ['composer'] }).sql).toContain('tq.si');
    // All fields (or none given): the whole vector, no ts_filter.
    expect(compile({ q: 'x' }).sql).not.toContain('ts_filter');
    expect(compile({ q: 'x', fields: [] }).sql).not.toContain('ts_filter');
  });

  test('relevance only when q is set and sort is not', () => {
    expect(squash(compile({ q: 'x' }).sql)).toContain('order by "rank" desc');
    expect(squash(compile({ q: 'x', sort: 'alpha' }).sql)).not.toContain('order by "rank"');
  });

  test('page size clamps to 1..100; page to >= 1', () => {
    expect(compile({ pageSize: 500 }).params.slice(-2)).toEqual([MAX_PAGE_SIZE, 0]);
    expect(compile({ pageSize: 0, page: 3 }).params.slice(-2)).toEqual([1, 2]);
    expect(compile({ page: -4, pageSize: 10 }).params.slice(-2)).toEqual([10, 0]);
    expect(compile({ page: 2.7, pageSize: 10 }).params.slice(-2)).toEqual([10, 10]);
  });

  test('branch_use joins the filter branch, else the user branch, else none', () => {
    const branch = compile({ sort: 'branch_use', branch: 'SV' }, { userBranchId: 'u' });
    expect(branch.params).toContain('SV');
    expect(branch.params).not.toContain('u');
    const user = compile({ sort: 'branch_use' }, { userBranchId: 'u' });
    expect(user.params).toContain('u');
    expect(compile({ sort: 'branch_use' }).sql).not.toContain('branch_usage su');
    // The user branch is only for sorting; it never filters.
    expect(compile({}, { userBranchId: 'u' }).sql).not.toContain('branch_usage su');
  });

  test('usage defaults to high/low/rare with a branch', () => {
    const { params } = compile({ branch: 'OR' });
    expect(params).toEqual(expect.arrayContaining(['OR', 'high', 'low', 'rare']));
    expect(params).not.toContain('none');
  });
});
