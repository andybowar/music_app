// @vitest-environment node
import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LIST_IDS, getItemsForList, getList, getSong } from '@/fixtures';
import { resolveItemDisplay } from '@/lib/lists/resolve';
import type { ListDetail } from '@/types/domain';

vi.mock('server-only', () => ({}));

const getSharedList = vi.fn<(token: string) => Promise<ListDetail | null>>();
vi.mock('@/features/sharing/server', () => ({
  getSharedList: (token: string) => getSharedList(token),
}));

vi.mock('./SharedListView', () => ({ SharedListView: () => null }));

const reportError = vi.fn();
vi.mock('@/lib/log', () => ({ reportError: (...a: unknown[]) => reportError(...a) }));

const { default: SharePage, generateMetadata, dynamic } = await import('./page');
const { SharedListView } = await import('./SharedListView');
const { ShareLoadError } = await import('./views');
const { toSharedList } = await import('./shared');

function findElement<P>(node: ReactNode, type: unknown): ReactElement<P> | null {
  if (!isValidElement(node)) return null;
  if (node.type === type) return node as ReactElement<P>;
  const children = (node.props as { children?: ReactNode }).children;
  for (const child of Array.isArray(children) ? children : [children]) {
    const found = findElement<P>(child, type);
    if (found) return found;
  }
  return null;
}

const setlist: ListDetail = {
  ...getList(LIST_IDS.bg41926),
  items: getItemsForList(LIST_IDS.bg41926).map((i) => resolveItemDisplay(getSong(i.songId), i)),
};
const TOKEN = 'A'.repeat(43);
const params = (token: string) => ({ params: Promise.resolve({ token }) });

beforeEach(() => {
  vi.clearAllMocks();
  getSharedList.mockResolvedValue(setlist);
});

describe('share page', () => {
  it('renders per request, never cached', () => {
    expect(dynamic).toBe('force-dynamic');
  });

  it('shows only the public projection of the list', async () => {
    const page = await SharePage(params(TOKEN));
    expect(getSharedList).toHaveBeenCalledWith(TOKEN);
    const el = findElement<{ list: unknown }>(page, SharedListView);
    expect(el?.props.list).toEqual(toSharedList(setlist));
    expect(JSON.stringify(el?.props)).not.toContain(setlist.ownerName);
  });

  it('is the same 404 for every token that does not resolve', async () => {
    getSharedList.mockResolvedValue(null);
    for (const token of ['nope', TOKEN, 'B'.repeat(43)]) {
      await expect(SharePage(params(token))).rejects.toMatchObject({
        digest: expect.stringContaining('404'),
      });
    }
  });

  it('shows an error state and does not log the token when loading fails', async () => {
    getSharedList.mockRejectedValue(new Error('db down'));
    const page = await SharePage(params(TOKEN));
    expect(findElement(page, ShareLoadError)).not.toBeNull();
    expect(reportError).toHaveBeenCalledWith(expect.any(Error), { handler: 'SharePage' });
    expect(JSON.stringify(reportError.mock.calls)).not.toContain(TOKEN);
  });

  it('is never indexed and sends no referrer, whatever the outcome', async () => {
    const expectPrivate = (meta: Awaited<ReturnType<typeof generateMetadata>>) => {
      expect(meta.robots).toMatchObject({ index: false, follow: false });
      expect(meta.referrer).toBe('no-referrer');
    };

    const found = await generateMetadata(params(TOKEN));
    expectPrivate(found);
    expect(found.title).toBe(setlist.name);

    getSharedList.mockResolvedValue(null);
    const missing = await generateMetadata(params('x'));
    expectPrivate(missing);
    expect(missing.title).toBe('Link not available');

    getSharedList.mockRejectedValue(new Error('db down'));
    const failed = await generateMetadata(params('y'));
    expectPrivate(failed);
    expect(failed.title).toBe('Shared list');
  });
});
