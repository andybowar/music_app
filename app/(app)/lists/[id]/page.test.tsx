// @vitest-environment node
import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LIST_IDS, getItemsForList, getList as fixtureList, getSong, users } from '@/fixtures';
import { resolveItemDisplay } from '@/lib/lists/resolve';
import type { AppUser, ListDetail, Role, SongDetail } from '@/types/domain';

vi.mock('server-only', () => ({}));

const requirePageUser = vi.fn<(next?: string) => Promise<AppUser>>();
vi.mock('@/lib/auth', () => ({ requirePageUser: (next?: string) => requirePageUser(next) }));

const getList = vi.fn<(id: string) => Promise<ListDetail | null>>();
vi.mock('@/features/lists/server/lists', () => ({ getList: (id: string) => getList(id) }));

const getSongs = vi.fn<(ids: string[]) => Promise<SongDetail[]>>();
vi.mock('@/features/songs/server/songs', () => ({ getSongs: (ids: string[]) => getSongs(ids) }));

// The client view pulls in server actions; the route test only checks what it is given.
vi.mock('@/features/lists/ui/SetlistView', () => ({ SetlistView: () => null }));
vi.mock('@/features/player/ui/PlaylistView', () => ({ PlaylistView: () => null }));

const reportError = vi.fn();
vi.mock('@/lib/log', () => ({ reportError: (...a: unknown[]) => reportError(...a) }));

const { default: ListRoute, generateMetadata, dynamic } = await import('./page');
const { SetlistView } = await import('@/features/lists/ui/SetlistView');
const { PlaylistView } = await import('@/features/player/ui/PlaylistView');
const { ListLoadError } = await import('./views');

function detailOf(id: string): ListDetail {
  return {
    ...fixtureList(id),
    items: getItemsForList(id).map((i) => resolveItemDisplay(getSong(i.songId), i)),
  };
}

const setlist = detailOf(LIST_IDS.bg41926);
const playlist = detailOf(LIST_IDS.background1);
const songs = setlist.items.map((i) => getSong(i.song.id));
const params = (id: string) => ({ params: Promise.resolve({ id }) });

function userWith(role: Role, id = '20000000-0000-4000-8000-0000000000ff'): AppUser {
  return { ...users[0]!, id, role, accessStatus: 'approved', disabledAt: null };
}

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

type ViewProps = { list: ListDetail; canEdit: boolean; songs?: SongDetail[] };

beforeEach(() => {
  vi.clearAllMocks();
  requirePageUser.mockResolvedValue(userWith('member'));
  getList.mockResolvedValue(setlist);
  getSongs.mockResolvedValue(songs);
});

describe('list route', () => {
  it('renders per request', () => {
    expect(dynamic).toBe('force-dynamic');
  });

  it('guards the page with the list path as `next`', async () => {
    await ListRoute(params(setlist.id));
    expect(requirePageUser).toHaveBeenCalledWith(`/lists/${setlist.id}`);
  });

  it('is a 404 for a missing, deleted or unreadable list', async () => {
    getList.mockResolvedValue(null);
    await expect(ListRoute(params('nope'))).rejects.toMatchObject({
      digest: expect.stringContaining('404'),
    });
  });

  it('shows a setlist read-only to a member who does not own it', async () => {
    const page = await ListRoute(params(setlist.id));
    const el = findElement<ViewProps>(page, SetlistView);
    expect(el?.props).toMatchObject({ list: setlist, canEdit: false, songs });
    expect(getSongs).toHaveBeenCalledWith(setlist.items.map((i) => i.song.id));
  });

  it('lets the owner edit', async () => {
    requirePageUser.mockResolvedValue(userWith('member', setlist.ownerId));
    const page = await ListRoute(params(setlist.id));
    expect(findElement<ViewProps>(page, SetlistView)?.props.canEdit).toBe(true);
  });

  it('still shows the setlist when song details fail to load', async () => {
    getSongs.mockRejectedValue(new Error('db down'));
    const page = await ListRoute(params(setlist.id));
    expect(findElement<ViewProps>(page, SetlistView)?.props.songs).toBeUndefined();
    expect(reportError).toHaveBeenCalled();
  });

  it('dispatches a playlist to the playlist view, with its song details', async () => {
    getList.mockResolvedValue(playlist);
    const playlistSongs = playlist.items.map((i) => getSong(i.song.id));
    getSongs.mockResolvedValue(playlistSongs);
    requirePageUser.mockResolvedValue(userWith('member', playlist.ownerId));
    const page = await ListRoute(params(playlist.id));
    expect(findElement<ViewProps>(page, PlaylistView)?.props).toMatchObject({
      list: playlist,
      canEdit: true,
      songs: playlistSongs,
    });
    expect(getSongs).toHaveBeenCalledWith(playlist.items.map((i) => i.song.id));
  });

  it('still shows the playlist when song details fail to load', async () => {
    getList.mockResolvedValue(playlist);
    getSongs.mockRejectedValue(new Error('db down'));
    const page = await ListRoute(params(playlist.id));
    const el = findElement<ViewProps>(page, PlaylistView);
    expect(el?.props.list).toBe(playlist);
    expect(el?.props.songs).toBeUndefined();
    expect(reportError).toHaveBeenCalledWith(expect.any(Error), {
      handler: 'ListRoute.getSongs',
      listId: playlist.id,
    });
  });

  it('shows an error state when the list fails to load', async () => {
    getList.mockRejectedValue(new Error('db down'));
    const page = await ListRoute(params(setlist.id));
    expect(findElement<{ retryHref: string }>(page, ListLoadError)?.props.retryHref).toBe(
      `/lists/${setlist.id}`,
    );
    expect(reportError).toHaveBeenCalledWith(expect.any(Error), {
      handler: 'ListRoute',
      listId: setlist.id,
    });
  });

  it('titles the page with the list name', async () => {
    expect(await generateMetadata(params(setlist.id))).toEqual({ title: setlist.name });
    getList.mockResolvedValue(null);
    expect(await generateMetadata(params('x'))).toEqual({ title: 'List not found' });
    getList.mockRejectedValue(new Error('db down'));
    expect(await generateMetadata(params('y'))).toEqual({ title: 'List' });
  });
});
