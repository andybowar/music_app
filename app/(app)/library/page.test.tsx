// @vitest-environment node
import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LibraryView, type LibraryViewProps } from '@/features/search/ui/LibraryView';
import { SONG_IDS, getSong as fixtureSong, songSummaries, users } from '@/fixtures';
import { ActionError } from '@/lib/action';
import type { AppUser, FacetOptions, SearchParams, SearchResult, SongDetail } from '@/types/domain';

vi.mock('server-only', () => ({}));

const user: AppUser = { ...users[0]!, role: 'member', accessStatus: 'approved', disabledAt: null };

const requirePageUser = vi.fn<(next?: string) => Promise<AppUser>>();
const requireUser = vi.fn<() => Promise<AppUser>>();
vi.mock('@/lib/auth', () => ({
  requirePageUser: (next?: string) => requirePageUser(next),
  requireUser: () => requireUser(),
}));

const searchSongs = vi.fn<(p: SearchParams) => Promise<SearchResult>>();
vi.mock('@/features/search/server/search', () => ({
  searchSongs: (p: SearchParams) => searchSongs(p),
}));

const getFacetOptions = vi.fn<() => Promise<FacetOptions>>();
vi.mock('@/features/search/server/facets', () => ({ getFacetOptions: () => getFacetOptions() }));

const getSong = vi.fn<(id: string) => Promise<SongDetail | null>>();
vi.mock('@/features/songs/server/songs', () => ({ getSong: (id: string) => getSong(id) }));

const getSignedResourceUrl = vi.fn();
vi.mock('@/features/resources/server/files', () => ({ getSignedResourceUrl }));

const reportError = vi.fn();
vi.mock('@/lib/log', () => ({ reportError: (...a: unknown[]) => reportError(...a) }));

const { default: LibraryPage, dynamic } = await import('./page');
const { libraryPath, loadLibrary, SEARCH_ERROR, FACETS_ERROR } = await import('./loadLibrary');
const { loadSongDetail, searchLibraryPage } = await import('./actions');

const facets: FacetOptions = {
  keys: ['D'],
  decades: [2010],
  chords: { chorus: [], verse: [], bridge: [] },
  branches: [],
};
const found: SearchResult = { items: songSummaries.slice(0, 2), total: 2, page: 1, pageSize: 50 };

function findElement<P>(node: ReactNode, type: unknown): ReactElement<P> | null {
  if (!isValidElement(node)) return null;
  if (node.type === type) return node as ReactElement<P>;
  const children = (node.props as { children?: ReactNode }).children;
  for (const child of Array.isArray(children) ? children : [children]) {
    const el = findElement<P>(child, type);
    if (el) return el;
  }
  return null;
}

const page = (sp: Record<string, string | string[] | undefined>) =>
  LibraryPage({ searchParams: Promise.resolve(sp) });

beforeEach(() => {
  vi.clearAllMocks();
  requirePageUser.mockResolvedValue(user);
  requireUser.mockResolvedValue(user);
  searchSongs.mockResolvedValue(found);
  getFacetOptions.mockResolvedValue(facets);
});

describe('library route', () => {
  it('renders dynamically', () => {
    expect(dynamic).toBe('force-dynamic');
  });

  it('runs the default view with no params', async () => {
    const el = findElement<LibraryViewProps>(await page({}), LibraryView);
    expect(requirePageUser).toHaveBeenCalledWith('/library');
    expect(searchSongs).toHaveBeenCalledWith({});
    expect(el?.props).toMatchObject({ result: found, facets, error: null, facetsError: null });
    expect(el?.props.searchMore).toBe(searchLibraryPage);
    expect(el?.props.loadSong).toBe(loadSongDetail);
    expect(el?.props.getSignedResourceUrl).toBe(getSignedResourceUrl);
  });

  it('passes the URL search to searchSongs and the login `next`', async () => {
    await page({ q: 'redemption', fields: 'themes', energy: ['high_praise'], bogus: 'x' });
    expect(searchSongs).toHaveBeenCalledWith(
      expect.objectContaining({ q: 'redemption', fields: ['themes'], energy: ['high_praise'] }),
    );
    expect(requirePageUser).toHaveBeenCalledWith(expect.stringMatching(/^\/library\?.*q=redemption/));
  });

  it('lets the auth redirect through', async () => {
    const redirect = Object.assign(new Error('NEXT_REDIRECT'), {
      digest: 'NEXT_REDIRECT;replace;/login;307;',
    });
    requirePageUser.mockRejectedValue(redirect);
    await expect(page({})).rejects.toBe(redirect);
    expect(searchSongs).not.toHaveBeenCalled();
  });
});

describe('libraryPath', () => {
  it('is the bare path for the default view', () => {
    expect(libraryPath({})).toBe('/library');
    expect(libraryPath({ q: 'grace' })).toBe('/library?q=grace');
  });
});

describe('loadLibrary', () => {
  it('reports a failed search and still returns the facets', async () => {
    const boom = new Error('db down');
    searchSongs.mockRejectedValue(boom);
    const data = await loadLibrary({ page: '2' });
    expect(data).toEqual({
      result: { items: [], total: 0, page: 2, pageSize: 50 },
      error: SEARCH_ERROR,
      facets,
      facetsError: null,
    });
    expect(reportError).toHaveBeenCalledWith(boom, {
      handler: 'LibraryPage',
      step: 'searchSongs',
    });
  });

  it('reports failed facets and still returns the results', async () => {
    getFacetOptions.mockRejectedValue(new Error('cache down'));
    const data = await loadLibrary({});
    expect(data).toEqual({ result: found, error: null, facets: null, facetsError: FACETS_ERROR });
    expect(reportError).toHaveBeenCalledTimes(1);
  });

  it('rethrows Next control-flow errors', async () => {
    const notFound = Object.assign(new Error('NEXT_HTTP_ERROR_FALLBACK;404'), {
      digest: 'NEXT_HTTP_ERROR_FALLBACK;404',
    });
    searchSongs.mockRejectedValue(notFound);
    await expect(loadLibrary({})).rejects.toBe(notFound);
  });
});

describe('searchLibraryPage', () => {
  it('parses the query string and searches', async () => {
    const res = await searchLibraryPage('q=grace&page=2');
    expect(res).toEqual({ ok: true, data: found });
    expect(searchSongs).toHaveBeenCalledWith(expect.objectContaining({ q: 'grace', page: 2 }));
  });

  it('returns an error result when signed out', async () => {
    requireUser.mockRejectedValue(new ActionError('UNAUTHENTICATED', 'Please sign in.'));
    const res = await searchLibraryPage('');
    expect(res).toMatchObject({ ok: false, error: { code: 'UNAUTHENTICATED' } });
    expect(searchSongs).not.toHaveBeenCalled();
  });

  it('rejects a non-string query', async () => {
    const res = await searchLibraryPage(42 as unknown as string);
    expect(res).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
  });
});

describe('loadSongDetail', () => {
  const song = fixtureSong(SONG_IDS.thousandHallelujahs);

  it('returns the song', async () => {
    getSong.mockResolvedValue(song);
    expect(await loadSongDetail(song.id)).toEqual({ ok: true, data: song });
    expect(getSong).toHaveBeenCalledWith(song.id);
  });

  it('is NOT_FOUND for a deleted song', async () => {
    getSong.mockResolvedValue(null);
    expect(await loadSongDetail(song.id)).toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND' },
    });
  });

  it('validates the id', async () => {
    expect(await loadSongDetail('not-a-uuid')).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION' },
    });
    expect(getSong).not.toHaveBeenCalled();
  });
});
