// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from 'vitest';

import type { AppUser } from '@/types/domain';

import type * as QueryModule from './query';
import type { SearchRow } from './query';

vi.mock('server-only', () => ({}));

const h = vi.hoisted(() => ({
  user: null as AppUser | null,
  results: [] as unknown[][],
  execute: vi.fn(),
  build: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  requireUser: async () => {
    if (!h.user) {
      const e = new Error('signed out') as Error & { code: string };
      e.name = 'ActionError';
      e.code = 'UNAUTHENTICATED';
      throw e;
    }
    return h.user;
  },
}));
vi.mock('@/lib/db', () => ({ getDb: () => ({ execute: h.execute }) }));
vi.mock('./query', async (orig) => {
  const actual = await orig<typeof QueryModule>();
  return {
    ...actual,
    buildSearchQuery: (...args: Parameters<typeof actual.buildSearchQuery>) => {
      h.build(...args);
      return actual.buildSearchQuery(...args);
    },
  };
});

const { normalizeSearchParams, rowToSummary, searchSongs } = await import('./search');

const member: AppUser = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'member@example.test',
  name: 'Member',
  branchId: '00000000-0000-4000-8000-0000000000b1',
  role: 'member',
  authProvider: 'password',
  disabledAt: null,
  accessStatus: 'approved',
};

function row(over: Partial<SearchRow> = {}): SearchRow {
  return {
    id: '00000000-0000-4000-8000-00000000000a',
    title: 'Sample song',
    year: 1999,
    tempoBpm: 72,
    timeSignature: '4/4',
    energyLevel: 'mid_worship',
    primaryKey: 'G',
    composers: [
      { name: 'B Writer', popMember: 'current' },
      { name: 'A Writer', popMember: 'none' },
    ],
    addedByBranchCode: 'SV',
    resourceCount: 3,
    createdAt: '2026-01-02T03:04:05.000Z',
    rank: 0,
    total: 7,
    ...over,
  };
}

beforeEach(() => {
  h.user = member;
  h.results = [];
  h.execute.mockReset();
  h.execute.mockImplementation(async () => h.results.shift() ?? []);
  h.build.mockReset();
});

describe('rowToSummary', () => {
  test('maps every SongSummary field and keeps composer order', () => {
    expect(rowToSummary(row())).toEqual({
      id: '00000000-0000-4000-8000-00000000000a',
      title: 'Sample song',
      year: 1999,
      tempoBpm: 72,
      timeSignature: '4/4',
      energyLevel: 'mid_worship',
      primaryKey: 'G',
      composers: [
        { name: 'B Writer', popMember: 'current' },
        { name: 'A Writer', popMember: 'none' },
      ],
      addedByBranchCode: 'SV',
      resourceCount: 3,
      createdAt: '2026-01-02T03:04:05.000Z',
    });
  });

  test('drops extra columns and coerces counts', () => {
    const s = rowToSummary(row({ resourceCount: '4' as unknown as number, composers: [] }));
    expect(s).not.toHaveProperty('total');
    expect(s).not.toHaveProperty('rank');
    expect(s.resourceCount).toBe(4);
    expect(s.composers).toEqual([]);
  });
});

describe('normalizeSearchParams', () => {
  test('empty stays empty', () => {
    expect(normalizeSearchParams({})).toEqual({});
  });

  test('drops invalid values and defaults', () => {
    expect(
      normalizeSearchParams({
        q: '  grace ',
        energy: ['bogus' as never, 'deep_worship'],
        page: 1,
        pageSize: 50,
        sort: 'date',
      }),
    ).toEqual({ q: 'grace', energy: ['deep_worship'], sort: 'date' });
  });

  test('keeps page and pageSize when not default', () => {
    expect(normalizeSearchParams({ page: 3, pageSize: 20 })).toEqual({ page: 3, pageSize: 20 });
  });
});

describe('searchSongs', () => {
  test('default view: empty params, page 1 of 50, total from the window count', async () => {
    h.results = [[row(), row({ id: '00000000-0000-4000-8000-00000000000b' })]];
    const result = await searchSongs();
    expect(h.build).toHaveBeenCalledWith({}, { userBranchId: member.branchId });
    expect(result.items.map((i) => i.id)).toEqual([
      '00000000-0000-4000-8000-00000000000a',
      '00000000-0000-4000-8000-00000000000b',
    ]);
    expect(result).toMatchObject({ total: 7, page: 1, pageSize: 50 });
    expect(result).not.toHaveProperty('didYouMean');
    expect(h.execute).toHaveBeenCalledTimes(1);
  });

  test('no matches on page 1: total 0, one query', async () => {
    h.results = [[]];
    expect(await searchSongs({ q: 'nothing' })).toEqual({
      items: [],
      total: 0,
      page: 1,
      pageSize: 50,
    });
    expect(h.execute).toHaveBeenCalledTimes(1);
  });

  test('page past the end: total read from page 1', async () => {
    h.results = [[], [row({ total: 12 })]];
    const result = await searchSongs({ page: 5, pageSize: 10 });
    expect(result).toEqual({ items: [], total: 12, page: 5, pageSize: 10 });
    expect(h.build).toHaveBeenLastCalledWith(
      { page: 1, pageSize: 1 },
      { userBranchId: member.branchId },
    );
  });

  test('page past the end of an empty set: total 0', async () => {
    h.results = [[], []];
    expect((await searchSongs({ page: 2 })).total).toBe(0);
  });

  test('signed out: throws and never reads the DB', async () => {
    h.user = null;
    await expect(searchSongs()).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    expect(h.execute).not.toHaveBeenCalled();
  });

  test('disabled user: denied before any DB read', async () => {
    h.user = { ...member, disabledAt: '2026-01-01T00:00:00Z' };
    await expect(searchSongs()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(h.execute).not.toHaveBeenCalled();
  });
});
