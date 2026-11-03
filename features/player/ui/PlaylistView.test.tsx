import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { LIST_IDS, SONG_IDS, getItemsForList, getList, getSong } from '@/fixtures';
import { resolveItemDisplay } from '@/lib/lists/resolve';
import type { ActionResult, ListDetail, ListItem } from '@/types/domain';

import type { PlayerAdapter, Track } from '../engine';
import type { PlayerAdapterFactories } from './usePlayer';

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast: toastMock }));

const actions = vi.hoisted(() => ({
  renameList: vi.fn(),
  deleteList: vi.fn(),
  removeListItem: vi.fn(),
  reorderList: vi.fn(),
  updateListItem: vi.fn(),
  getSignedResourceUrl: vi.fn(),
}));
vi.mock('@/features/lists/server/lists', () => ({
  renameList: actions.renameList,
  deleteList: actions.deleteList,
}));
vi.mock('@/features/lists/server/items', () => ({
  removeListItem: actions.removeListItem,
  reorderList: actions.reorderList,
  updateListItem: actions.updateListItem,
}));
vi.mock('@/features/resources/server/files', () => ({
  getSignedResourceUrl: actions.getSignedResourceUrl,
}));

const {
  PLAYLISTS_HREF,
  PlaylistView,
  PlaylistViewSkeleton,
  playlistTracks,
  trackFor,
  withSongRecordings,
} = await import('./PlaylistView');

const ok = <T,>(data: T): Promise<ActionResult<T>> => Promise.resolve({ ok: true, data });
const fail = (message: string): Promise<ActionResult<never>> =>
  Promise.resolve({ ok: false, error: { code: 'CONFLICT', message } });

// Background 1: "Lord You Are Worthy" (stored MP3), then "A Thousand Hallelujahs" twice (YouTube).
const listId = LIST_IDS.background1;
const fixtureItems = getItemsForList(listId);
// Plus a song with no audio at all, which is shown but skipped.
const noAudio: ListItem = {
  ...fixtureItems[0]!,
  id: '90000000-0000-4000-8000-0000030000ff',
  songId: SONG_IDS.beTheCenter,
  position: 3,
  resourceId: null,
};
const allItems = [...fixtureItems, noAudio];
const detail: ListDetail = {
  ...getList(listId),
  itemCount: allItems.length,
  items: allItems.map((i) => resolveItemDisplay(getSong(i.songId), i)),
};
const [worthy, hallelujahs1] = detail.items;

type Fake = PlayerAdapter & { calls: string[]; loads: Track[]; ended(): void };

function fakeAdapter(): Fake {
  let endedCb: (() => void) | null = null;
  const self: Fake = {
    calls: [],
    loads: [],
    load(t) {
      self.loads.push(t);
      self.calls.push(`load:${t.title}`);
      return Promise.resolve();
    },
    play: () => self.calls.push('play'),
    pause: () => self.calls.push('pause'),
    stop: () => self.calls.push('stop'),
    onEnded: (cb) => (endedCb = cb),
    onError: () => {},
    destroy: () => self.calls.push('destroy'),
    ended: () => endedCb?.(),
  };
  return self;
}

let made: { mp3?: Fake; youtube?: Fake };
const adapters: PlayerAdapterFactories = {
  mp3: () => (made.mp3 = fakeAdapter()),
  youtube: () => (made.youtube = fakeAdapter()),
};

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  Element.prototype.scrollIntoView ??= () => {};
  Element.prototype.hasPointerCapture ??= () => false;
});

beforeEach(() => {
  vi.clearAllMocks();
  made = {};
  actions.reorderList.mockImplementation(() => ok(undefined));
  actions.removeListItem.mockImplementation(() => ok(undefined));
  actions.renameList.mockImplementation(() => ok(undefined));
  actions.deleteList.mockImplementation(() => ok(undefined));
  actions.updateListItem.mockImplementation((id: string, patch: Partial<ListItem>) =>
    ok({ ...allItems.find((i) => i.id === id)!, ...patch }),
  );
  actions.getSignedResourceUrl.mockImplementation(() =>
    ok({
      url: 'https://signed.test/nova.mp3',
      expiresAt: new Date(Date.now() + 3600e3).toISOString(),
    }),
  );
});

afterEach(cleanup);

const rows = () => within(screen.getByRole('list', { name: /songs in/i })).getAllByRole('listitem');
const player = () => screen.getByRole('region', { name: 'Player' });

describe('playlist tracks', () => {
  it('builds one track per playable row, skipping rows without a recording', () => {
    const tracks = playlistTracks(detail.items);
    expect(tracks.map((t) => t.id)).toEqual(fixtureItems.map((i) => i.id));
    expect(tracks[0]!.source).toEqual({ type: 'mp3', url: '' }); // signed at load time
    expect(tracks[1]!.source).toEqual({ type: 'youtube', videoId: 'fixture0001' });
  });

  it('plays external audio links directly and ignores non-YouTube video links', () => {
    const base = hallelujahs1!.resources.find((r) => r.kind === 'video_link')!;
    expect(trackFor(hallelujahs1!, null)).toBeNull();
    expect(
      trackFor(hallelujahs1!, { ...base, kind: 'audio', url: 'https://cdn.test/a.mp3' })?.source,
    ).toEqual({ type: 'mp3', url: 'https://cdn.test/a.mp3' });
    expect(trackFor(hallelujahs1!, { ...base, url: 'https://vimeo.com/1' })).toBeNull();
    expect(
      trackFor(hallelujahs1!, { ...base, url: null, storagePath: null, kind: 'audio' }),
    ).toBeNull();
  });
});

describe('PlaylistView', () => {
  it('lists every song, marking the one without audio as skipped', () => {
    render(<PlaylistView list={detail} canEdit adapters={adapters} />);
    expect(screen.getByRole('heading', { name: detail.name })).toBeInTheDocument();
    expect(screen.getByText(/4 songs · 1 without a recording \(skipped\)/)).toBeInTheDocument();
    expect(rows()).toHaveLength(4);
    const last = rows()[3]!;
    expect(within(last).getByText('No audio yet · skipped')).toBeInTheDocument();
    expect(within(last).getByRole('button', { name: /has no recording to play/ })).toBeDisabled();
    expect(within(rows()[0]!).getByRole('combobox')).toHaveDisplayValue('Nova recording 3/15/24');
  });

  it('plays all, fetching a signed URL for the stored MP3, then auto-advances', async () => {
    const user = userEvent.setup();
    render(<PlaylistView list={detail} canEdit adapters={adapters} />);
    await user.click(screen.getByRole('button', { name: 'Play all' }));

    await waitFor(() => expect(player()).toHaveAttribute('data-status', 'playing'));
    expect(actions.getSignedResourceUrl).toHaveBeenCalledWith(worthy!.item.resourceId);
    expect(made.mp3!.loads[0]!.source).toEqual({
      type: 'mp3',
      url: 'https://signed.test/nova.mp3',
    });
    expect(rows()[0]).toHaveAttribute('aria-current', 'true');

    act(() => made.mp3!.ended());
    await waitFor(() => expect(rows()[1]).toHaveAttribute('aria-current', 'true'));
    await waitFor(() =>
      expect(made.youtube!.calls).toEqual([`load:${hallelujahs1!.song.title}`, 'play']),
    );
    expect(screen.getByTestId('youtube-player').parentElement).not.toHaveAttribute('aria-hidden');

    // The last playable track ends: the song without audio is skipped and the list finishes.
    act(() => made.youtube!.ended());
    await waitFor(() => expect(rows()[2]).toHaveAttribute('aria-current', 'true'));
    await waitFor(() => expect(player()).toHaveAttribute('data-status', 'playing'));
    act(() => made.youtube!.ended());
    await waitFor(() => expect(player()).toHaveAttribute('data-status', 'ended'));
    expect(made.youtube!.loads).toHaveLength(2);
  });

  it('plays from a row', async () => {
    const user = userEvent.setup();
    render(<PlaylistView list={detail} canEdit adapters={adapters} />);
    await user.click(within(rows()[2]!).getByRole('button', { name: /^Play / }));
    await waitFor(() => expect(player()).toHaveAttribute('data-status', 'playing'));
    expect(within(player()).getByText('Track 3 of 3')).toBeInTheDocument();
    expect(made.mp3).toBeUndefined();
  });

  it('skips a stored MP3 whose signed URL fails', async () => {
    actions.getSignedResourceUrl.mockImplementation(() => fail('Gone'));
    const user = userEvent.setup();
    render(<PlaylistView list={detail} canEdit adapters={adapters} />);
    await user.click(screen.getByRole('button', { name: 'Play all' }));
    await waitFor(() => expect(rows()[1]).toHaveAttribute('aria-current', 'true'));
    expect(toastMock.error).toHaveBeenCalledWith(expect.stringContaining('play'), {
      description: 'Gone',
    });
  });

  it('saves a new recording choice, and rolls back when the server refuses', async () => {
    const user = userEvent.setup();
    render(<PlaylistView list={detail} canEdit adapters={adapters} />);
    const picker = within(rows()[1]!).getByRole('combobox');
    await user.selectOptions(picker, 'YouTube: Hillsong 4/16/21');
    expect(actions.updateListItem).toHaveBeenCalledWith(hallelujahs1!.item.id, {
      resourceId: '60000000-0000-4000-8000-000001000007',
    });
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());

    actions.updateListItem.mockImplementation(() => fail('Nope'));
    await user.selectOptions(picker, 'No recording');
    await waitFor(() => expect(toastMock.error).toHaveBeenCalled());
    expect(picker).toHaveDisplayValue('YouTube: Hillsong 4/16/21');
  });

  it('reorders and removes with the list item actions', async () => {
    const user = userEvent.setup();
    render(<PlaylistView list={detail} canEdit adapters={adapters} />);
    await user.click(within(rows()[0]!).getByRole('button', { name: /^Actions for/ }));
    await user.click(screen.getByRole('menuitem', { name: 'Move down' }));
    expect(actions.reorderList).toHaveBeenCalledWith(listId, [
      allItems[1]!.id,
      allItems[0]!.id,
      allItems[2]!.id,
      allItems[3]!.id,
    ]);

    await user.click(within(rows()[3]!).getByRole('button', { name: /^Actions for/ }));
    await user.click(screen.getByRole('menuitem', { name: 'Remove from playlist' }));
    await waitFor(() => expect(rows()).toHaveLength(3));
    expect(actions.removeListItem).toHaveBeenCalledWith(noAudio.id);
  });

  it('rolls back a refused reorder', async () => {
    actions.reorderList.mockImplementation(() => fail('Stale'));
    const user = userEvent.setup();
    render(<PlaylistView list={detail} canEdit adapters={adapters} />);
    await user.click(within(rows()[0]!).getByRole('button', { name: /^Actions for/ }));
    await user.click(screen.getByRole('menuitem', { name: 'Move down' }));
    await waitFor(() => expect(toastMock.error).toHaveBeenCalled());
    expect(within(rows()[0]!).getByRole('link')).toHaveTextContent(worthy!.song.title);
  });

  it('renames and deletes the playlist', async () => {
    const user = userEvent.setup();
    render(<PlaylistView list={detail} canEdit adapters={adapters} />);
    await user.click(screen.getByRole('button', { name: 'Rename' }));
    const input = screen.getByLabelText('Name');
    await user.clear(input);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByText('Enter a name.')).toBeInTheDocument();
    await user.type(input, 'Drive home');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(actions.renameList).toHaveBeenCalledWith(listId, 'Drive home', null);
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Drive home'),
    );

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(screen.getByRole('button', { name: 'Delete playlist' }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith(PLAYLISTS_HREF));
  });

  it('is read-only without edit rights', () => {
    render(<PlaylistView list={detail} canEdit={false} adapters={adapters} />);
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Rename' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Actions for/ })).not.toBeInTheDocument();
    expect(within(rows()[0]!).getByText('Nova recording 3/15/24')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play all' })).toBeEnabled();
  });

  it('shows an empty state', () => {
    render(
      <PlaylistView list={{ ...detail, items: [], itemCount: 0 }} canEdit adapters={adapters} />,
    );
    expect(screen.getByText('No songs in this playlist yet.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play all' })).toBeDisabled();
  });

  describe('with song details (CR PLAY-05)', () => {
    // "YouTube link 4" belongs to A Thousand Hallelujahs' E key, not its primary key D.
    const otherKeyLink = '60000000-0000-4000-8000-000001000012';
    const onOtherKey: ListDetail = {
      ...detail,
      items: detail.items.map((i, n) =>
        n === 1 ? { ...i, item: { ...i.item, resourceId: otherKeyLink } } : i,
      ),
    };
    const songs = [getSong(SONG_IDS.lordYouAreWorthy), getSong(SONG_IDS.thousandHallelujahs)];
    const options = (row: HTMLElement) =>
      within(row)
        .getAllByRole('option')
        .map((o) => o.textContent);

    it('offers recordings of every key and plays a saved non-primary-key one', async () => {
      const user = userEvent.setup();
      render(<PlaylistView list={onOtherKey} canEdit songs={songs} adapters={adapters} />);
      expect(options(rows()[2]!)).toContain('YouTube link 4');
      expect(within(rows()[1]!).getByRole('combobox')).toHaveDisplayValue('YouTube link 4');

      await user.click(within(rows()[1]!).getByRole('button', { name: /^Play / }));
      await waitFor(() => expect(player()).toHaveAttribute('data-status', 'playing'));
      expect(made.youtube!.loads[0]!.source).toEqual({ type: 'youtube', videoId: 'fixture0004' });
    });

    it('saves a non-primary-key recording picked in the row', async () => {
      const user = userEvent.setup();
      render(<PlaylistView list={detail} canEdit songs={songs} adapters={adapters} />);
      await user.selectOptions(within(rows()[2]!).getByRole('combobox'), 'YouTube link 4');
      expect(actions.updateListItem).toHaveBeenCalledWith(detail.items[2]!.item.id, {
        resourceId: otherKeyLink,
      });
    });

    it('falls back to the primary-key recordings without song details', () => {
      render(<PlaylistView list={onOtherKey} canEdit adapters={adapters} />);
      expect(options(rows()[2]!)).not.toContain('YouTube link 4');
      expect(within(rows()[1]!).getByText('Choose a recording to include this song')).toBeVisible();
      expect(playlistTracks(onOtherKey.items)).toHaveLength(2);
    });

    it('keeps the resolved resources of a song missing from the details', () => {
      render(
        <PlaylistView
          list={detail}
          canEdit
          songs={[getSong(SONG_IDS.lordYouAreWorthy)]}
          adapters={adapters}
        />,
      );
      expect(options(rows()[1]!)).not.toContain('YouTube link 4');
      expect(within(rows()[1]!).getByRole('combobox')).toHaveDisplayValue(
        'YouTube: Hillsong 7/5/22',
      );
    });

    it('withSongRecordings swaps in all of the song resources', () => {
      const song = getSong(SONG_IDS.thousandHallelujahs);
      expect(withSongRecordings(hallelujahs1!, song).resources).toBe(song.resources);
      expect(withSongRecordings(hallelujahs1!, undefined)).toBe(hallelujahs1);
    });
  });

  it('uses overridden actions when given', async () => {
    const renameList = vi.fn(() => ok(undefined));
    const user = userEvent.setup();
    render(<PlaylistView list={detail} canEdit adapters={adapters} actions={{ renameList }} />);
    await user.click(screen.getByRole('button', { name: 'Rename' }));
    await user.type(screen.getByLabelText('Name'), '!');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(renameList).toHaveBeenCalledWith(listId, `${detail.name}!`, null);
    expect(actions.renameList).not.toHaveBeenCalled();
  });

  it('has a loading skeleton', () => {
    render(<PlaylistViewSkeleton />);
    expect(screen.getByLabelText('Loading playlist')).toHaveAttribute('aria-busy', 'true');
  });
});
