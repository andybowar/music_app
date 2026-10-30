// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from 'vitest';

import type { AppUser } from '@/types/domain';

vi.mock('server-only', () => ({}));

const h = vi.hoisted(() => ({
  user: null as AppUser | null,
  results: [] as unknown[][],
  execute: vi.fn(),
  cacheOptions: undefined as unknown,
  cacheKeyParts: undefined as unknown,
}));

vi.mock('next/cache', () => ({
  unstable_cache: (fn: () => unknown, keyParts: unknown, options: unknown) => {
    h.cacheKeyParts = keyParts;
    h.cacheOptions = options;
    return fn;
  },
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

const {
  compareChords,
  compareKeys,
  FACETS_CACHE_TAG,
  FACETS_REVALIDATE_SECONDS,
  getFacetOptions,
  loadFacetOptions,
  rootPitch,
} = await import('./facets');

const member: AppUser = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'member@example.test',
  name: 'Member',
  branchId: null,
  role: 'member',
  authProvider: 'password',
  disabledAt: null,
  accessStatus: 'approved',
};

const branchRows = [
  { id: 'b1', name: 'Portland', code: 'OR', ssoGroup: null },
  { id: 'b2', name: 'Servant', code: 'SV', ssoGroup: 'pop-sv' },
];

beforeEach(() => {
  h.user = member;
  h.results = [
    [{ key: 'Em' }, { key: 'G' }, { key: 'Db' }, { key: 'C#' }, { key: 'C' }, { key: 'Am' }],
    [{ decade: 2010 }, { decade: '1970' }, { decade: 1990 }],
    [
      { chorus: 'G', verse: 'D/F#', bridge: null },
      { chorus: 'C', verse: 'D/F#', bridge: 'Em' },
      { chorus: 'G', verse: null, bridge: 'Am7' },
    ],
    [...branchRows].reverse(),
  ];
  h.execute.mockReset();
  h.execute.mockImplementation(async () => h.results.shift() ?? []);
});

describe('rootPitch', () => {
  test('naturals, sharps and flats', () => {
    expect(rootPitch('C')).toBe(0);
    expect(rootPitch('C#m')).toBe(1);
    expect(rootPitch('Db')).toBe(1);
    expect(rootPitch('B')).toBe(11);
    expect(rootPitch('Cb')).toBe(11);
    expect(rootPitch('B#')).toBe(0);
  });
  test('null without a root', () => {
    expect(rootPitch('X')).toBeNull();
    expect(rootPitch('')).toBeNull();
  });
});

describe('compareKeys', () => {
  test('majors first, then pitch from C, sharp before flat', () => {
    const keys = ['Am', 'G', 'Bb', 'C#m', 'C', 'Db', 'C#', 'F#m', 'Em', 'A'];
    expect([...keys].sort(compareKeys)).toEqual([
      'C',
      'C#',
      'Db',
      'G',
      'A',
      'Bb',
      'C#m',
      'Em',
      'F#m',
      'Am',
    ]);
  });
});

describe('compareChords', () => {
  test('root pitch, then spelling; unrecognised roots last', () => {
    const chords = ['G', 'Cm', 'C/E', 'zz', 'C', 'Db', 'C#', 'Am7', 'C7', 'yy'];
    expect([...chords].sort(compareChords)).toEqual([
      'C',
      'C/E',
      'C7',
      'Cm',
      'C#',
      'Db',
      'G',
      'Am7',
      'yy',
      'zz',
    ]);
  });
});

describe('loadFacetOptions', () => {
  test('sorts keys and decades, dedupes chords per slot, maps branches', async () => {
    const facets = await loadFacetOptions();
    expect(h.execute).toHaveBeenCalledTimes(4);
    expect(facets).toEqual({
      keys: ['C', 'C#', 'Db', 'G', 'Em', 'Am'],
      decades: [1970, 1990, 2010],
      chords: { chorus: ['C', 'G'], verse: ['D/F#'], bridge: ['Em', 'Am7'] },
      branches: branchRows,
    });
  });

  test('empty library', async () => {
    h.results = [];
    expect(await loadFacetOptions()).toEqual({
      keys: [],
      decades: [],
      chords: { chorus: [], verse: [], bridge: [] },
      branches: [],
    });
  });
});

describe('getFacetOptions', () => {
  test('cached for 5 minutes under the facets tag', () => {
    expect(FACETS_REVALIDATE_SECONDS).toBe(300);
    expect(h.cacheOptions).toEqual({ revalidate: 300, tags: [FACETS_CACHE_TAG] });
    expect(h.cacheKeyParts).toEqual(['search', 'facet-options']);
  });

  test('returns options for a signed-in member', async () => {
    const facets = await getFacetOptions();
    expect(facets.keys).toEqual(['C', 'C#', 'Db', 'G', 'Em', 'Am']);
  });

  test('signed out: throws and never reads the DB', async () => {
    h.user = null;
    await expect(getFacetOptions()).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    expect(h.execute).not.toHaveBeenCalled();
  });

  test('disabled user: assertCan denies before any DB read', async () => {
    h.user = { ...member, disabledAt: '2026-01-01T00:00:00Z' };
    const result = getFacetOptions();
    await expect(result).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(h.execute).not.toHaveBeenCalled();
  });
});
