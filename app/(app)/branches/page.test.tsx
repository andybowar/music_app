// @vitest-environment node
import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { sampleActivity } from '@/features/branches/ui/activityFixtures';
import { BranchesView, type BranchesViewProps } from '@/features/branches/ui/BranchesView';
import { LIST_IDS, SONG_IDS, getList, getSong, lists as fixtureLists, users } from '@/fixtures';
import { ActionError } from '@/lib/action';
import type { AppUser, List, ListDetail, SongDetail } from '@/types/domain';

vi.mock('server-only', () => ({}));

const member: AppUser = {
  ...users[0]!,
  role: 'member',
  accessStatus: 'approved',
  disabledAt: null,
};

const requirePageUser = vi.fn<(next?: string) => Promise<AppUser>>();
const requireUser = vi.fn<() => Promise<AppUser>>();
vi.mock('@/lib/auth', () => ({
  requirePageUser: (next?: string) => requirePageUser(next),
  requireUser: () => requireUser(),
}));

const getBranchActivity = vi.fn();
vi.mock('@/features/branches/server', () => ({
  getBranchActivity: () => getBranchActivity(),
}));

const listLists = vi.fn<(p: unknown) => Promise<List[]>>();
const getList_ = vi.fn<(id: string) => Promise<ListDetail | null>>();
const createList = vi.fn();
vi.mock('@/features/lists/server/lists', () => ({
  listLists: (p: unknown) => listLists(p),
  getList: (id: string) => getList_(id),
  createList,
}));

const addListItem = vi.fn();
const removeListItem = vi.fn();
vi.mock('@/features/lists/server/items', () => ({ addListItem, removeListItem }));

const readCurrentListId = vi.fn<() => Promise<string | null>>();
vi.mock('@/features/lists/server/currentList', () => ({
  readCurrentListId: () => readCurrentListId(),
}));

const getSong_ = vi.fn<(id: string) => Promise<SongDetail | null>>();
vi.mock('@/features/songs/server/songs', () => ({ getSong: (id: string) => getSong_(id) }));

const getSignedResourceUrl = vi.fn();
vi.mock('@/features/resources/server/files', () => ({ getSignedResourceUrl }));

const reportError = vi.fn();
vi.mock('@/lib/log', () => ({ reportError: (...a: unknown[]) => reportError(...a) }));

const { default: BranchesPage, dynamic } = await import('./page');
const { loadBranches, ACTIVITY_ERROR, BRANCHES_PATH } = await import('./loadBranches');
const { loadBranchSong } = await import('./actions');

function findElement<P>(node: ReactNode, type: unknown): ReactElement<P> | null {
  if (!isValidElement(node)) {
    if (Array.isArray(node)) {
      for (const child of node) {
        const found = findElement<P>(child, type);
        if (found) return found;
      }
    }
    return null;
  }
  if (node.type === type) return node as ReactElement<P>;
  return findElement<P>((node.props as { children?: ReactNode }).children, type);
}

const setlist = getList(LIST_IDS.bg41926); // Portland, owned by Maria Chen
const playlist = getList(LIST_IDS.background1); // Rockford, owned by Lee Novak
const ownSetlist: List = { ...setlist, id: 'own-setlist', ownerId: member.id };

beforeEach(() => {
  vi.clearAllMocks();
  requirePageUser.mockResolvedValue(member);
  requireUser.mockResolvedValue(member);
  getBranchActivity.mockResolvedValue(sampleActivity());
  listLists.mockResolvedValue([ownSetlist, ...fixtureLists]);
  readCurrentListId.mockResolvedValue(null);
  getList_.mockResolvedValue(null);
});

describe('BranchesPage', () => {
  it('renders per request', () => {
    expect(dynamic).toBe('force-dynamic');
  });

  it('requires a signed-in user and passes the data and actions to the view', async () => {
    const tree = await BranchesPage();
    expect(requirePageUser).toHaveBeenCalledWith(BRANCHES_PATH);
    const view = findElement<BranchesViewProps>(tree, BranchesView);
    expect(view).not.toBeNull();
    const p = view!.props;
    expect(p.activity).toEqual(sampleActivity());
    expect(p.error).toBeNull();
    expect(p.ownBranchId).toBe(member.branchId);
    expect(p.actions).toEqual({ addListItem, createList, removeListItem });
    expect(p.loadSong).toBe(loadBranchSong);
    expect(p.getSignedResourceUrl).toBe(getSignedResourceUrl);
  });
});

describe('NavBar', () => {
  it('links to this page from the overflow menu', async () => {
    const { NAV_OVERFLOW_LINKS } = await import('@/components/NavBar');
    expect(NAV_OVERFLOW_LINKS).toContainEqual(
      expect.objectContaining({ href: BRANCHES_PATH, label: 'Other branches' }),
    );
  });
});

describe('loadBranches', () => {
  it('offers only lists the user can write to', async () => {
    const data = await loadBranches(member);
    expect(listLists).toHaveBeenCalledWith({ scope: 'branch' });
    const ids = data.lists.map((l) => l.id);
    expect(ids).toContain(ownSetlist.id);
    expect(ids).not.toContain(setlist.id);
    expect(ids).not.toContain(playlist.id);
  });

  it('resolves the current list from the cookie, without its items', async () => {
    readCurrentListId.mockResolvedValue(setlist.id);
    getList_.mockResolvedValue({ ...setlist, items: [] });
    const data = await loadBranches(member);
    expect(getList_).toHaveBeenCalledWith(setlist.id);
    expect(data.currentList).toEqual(setlist);
  });

  it('drops a current list the user can no longer read', async () => {
    readCurrentListId.mockResolvedValue(setlist.id);
    const data = await loadBranches(member);
    expect(data.currentList).toBeNull();
  });

  it('turns an activity failure into the view’s error, keeping the lists', async () => {
    getBranchActivity.mockRejectedValue(new Error('db down'));
    const data = await loadBranches(member);
    expect(data.activity).toBeNull();
    expect(data.error).toBe(ACTIVITY_ERROR);
    expect(data.lists.length).toBeGreaterThan(0);
    expect(reportError).toHaveBeenCalledWith(expect.any(Error), {
      handler: 'BranchesPage',
      step: 'getBranchActivity',
    });
  });

  it('empties the add menu when the list reads fail', async () => {
    listLists.mockRejectedValue(new Error('lists down'));
    readCurrentListId.mockRejectedValue(new Error('cookie down'));
    const data = await loadBranches(member);
    expect(data.activity).not.toBeNull();
    expect(data.lists).toEqual([]);
    expect(data.currentList).toBeNull();
    expect(reportError).toHaveBeenCalledTimes(2);
  });

  it('rethrows Next.js control flow (redirects) instead of reporting it', async () => {
    const redirect = Object.assign(new Error('NEXT_REDIRECT'), {
      digest: 'NEXT_REDIRECT;replace;/login;307;',
    });
    getBranchActivity.mockRejectedValue(redirect);
    await expect(loadBranches(member)).rejects.toBe(redirect);
    expect(reportError).not.toHaveBeenCalled();
  });
});

describe('loadBranchSong', () => {
  it('returns the song detail', async () => {
    const song = getSong(SONG_IDS.thousandHallelujahs);
    getSong_.mockResolvedValue(song);
    await expect(loadBranchSong(song.id)).resolves.toEqual({ ok: true, data: song });
  });

  it('is NOT_FOUND for a deleted song and rejects bad ids', async () => {
    getSong_.mockResolvedValue(null);
    const missing = await loadBranchSong('40000000-0000-4000-8000-000000000099');
    expect(missing).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
    const bad = await loadBranchSong('nope');
    expect(bad).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
    expect(getSong_).toHaveBeenCalledTimes(1);
  });

  it('needs a signed-in user', async () => {
    requireUser.mockRejectedValue(new ActionError('UNAUTHENTICATED', 'Sign in'));
    const res = await loadBranchSong('40000000-0000-4000-8000-000000000001');
    expect(res).toMatchObject({ ok: false, error: { code: 'UNAUTHENTICATED' } });
  });
});
