// @vitest-environment node
import { isValidElement, type ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { songSummaries, users } from '@/fixtures';
import type { AppUser, SearchParams, SearchResult } from '@/types/domain';

import { QuickLookup, type QuickLookupProps } from './QuickLookup';

vi.mock('server-only', () => ({}));

const requirePageUser = vi.fn<(next?: string) => Promise<AppUser>>();
vi.mock('@/lib/auth', () => ({ requirePageUser: (next?: string) => requirePageUser(next) }));

const searchSongs = vi.fn<(p: SearchParams) => Promise<SearchResult>>();
vi.mock('@/features/search/server/search', () => ({
  searchSongs: (p: SearchParams) => searchSongs(p),
}));

const reportError = vi.fn();
vi.mock('@/lib/log', () => ({ reportError: (...a: unknown[]) => reportError(...a) }));

const { default: QuickPage } = await import('./page');

const sp = (v: Record<string, string>) => ({ searchParams: Promise.resolve(v) });

async function render(v: Record<string, string>): Promise<QuickLookupProps> {
  const el = (await QuickPage(sp(v))) as ReactElement<QuickLookupProps>;
  expect(isValidElement(el) && el.type).toBe(QuickLookup);
  return el.props;
}

const found: SearchResult = { items: songSummaries.slice(0, 3), total: 3, page: 1, pageSize: 12 };

beforeEach(() => {
  vi.clearAllMocks();
  requirePageUser.mockResolvedValue({ ...users[0]!, accessStatus: 'approved', disabledAt: null });
  searchSongs.mockResolvedValue(found);
});

describe('quick lookup route', () => {
  it('guards the page with the lookup URL as `next`', async () => {
    await render({ q: 'grace', full: '1' });
    expect(requirePageUser).toHaveBeenCalledWith('/quick?q=grace&full=1');
  });

  it('does not search without text', async () => {
    expect(await render({ q: '  ' })).toEqual({
      query: { q: '', full: false },
      result: null,
      failed: false,
    });
    expect(searchSongs).not.toHaveBeenCalled();
  });

  it('searches themes + lyrics for the top 12', async () => {
    const props = await render({ q: 'grace' });
    expect(searchSongs).toHaveBeenCalledWith({
      q: 'grace',
      fields: ['themes', 'lyrics'],
      pageSize: 12,
    });
    expect(props).toEqual({ query: { q: 'grace', full: false }, result: found, failed: false });
  });

  it('"Show full" asks for 100', async () => {
    await render({ q: 'grace', full: '1' });
    expect(searchSongs).toHaveBeenCalledWith(expect.objectContaining({ pageSize: 100 }));
  });

  it('a failed search renders the error state and is reported', async () => {
    searchSongs.mockRejectedValue(new Error('db down'));
    const props = await render({ q: 'grace' });
    expect(props).toMatchObject({ result: null, failed: true });
    expect(reportError).toHaveBeenCalledWith(expect.any(Error), { handler: 'QuickPage' });
  });

  it('lets Next redirects through', async () => {
    const redirect = Object.assign(new Error('NEXT_REDIRECT'), {
      digest: 'NEXT_REDIRECT;replace;/login;307;',
    });
    searchSongs.mockRejectedValue(redirect);
    await expect(QuickPage(sp({ q: 'grace' }))).rejects.toBe(redirect);
  });
});
