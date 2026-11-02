import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { LIST_IDS, getItemsForList, getList, getSong } from '@/fixtures';
import { resolveItemDisplay } from '@/lib/lists/resolve';
import type { ActionResult, ListDetail, ListItem, SongDetail } from '@/types/domain';

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

const { SETLISTS_HREF, SetlistView, SetlistViewSkeleton, formatEventDate, movedMessage } =
  await import('./SetlistView');

const ok = <T,>(data: T): Promise<ActionResult<T>> => Promise.resolve({ ok: true, data });
const fail = (message: string): Promise<ActionResult<never>> =>
  Promise.resolve({ ok: false, error: { code: 'CONFLICT', message } });

const listId = LIST_IDS.bg41926;
const items = getItemsForList(listId);
const songs: SongDetail[] = [...new Set(items.map((i) => i.songId))].map(getSong);
const detail: ListDetail = {
  ...getList(listId),
  items: items.map((i) => resolveItemDisplay(getSong(i.songId), i)),
};
const titles = detail.items.map((i) => i.song.title);

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  Element.prototype.scrollIntoView ??= () => {};
  Element.prototype.hasPointerCapture ??= () => false;
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});

beforeEach(() => {
  vi.clearAllMocks();
  actions.reorderList.mockImplementation(() => ok(undefined));
  actions.removeListItem.mockImplementation(() => ok(undefined));
  actions.renameList.mockImplementation(() => ok(undefined));
  actions.deleteList.mockImplementation(() => ok(undefined));
  actions.updateListItem.mockImplementation((id: string, patch: Partial<ListItem>) => {
    const item = items.find((i) => i.id === id)!;
    return ok({ ...item, ...patch });
  });
});

afterEach(cleanup);

// Radix menus and dialogs under jsdom are slow; the first test also pays for the imports.
vi.setConfig({ testTimeout: 20_000 });

function setup(props: Partial<Parameters<typeof SetlistView>[0]> = {}) {
  const user = userEvent.setup();
  render(<SetlistView list={detail} canEdit songs={songs} {...props} />);
  return { user };
}

const rowTitles = () =>
  within(screen.getByRole('list', { name: /songs in/i }))
    .getAllByRole('group')
    .map((g) => g.getAttribute('aria-label'));

async function chooseAction(user: ReturnType<typeof userEvent.setup>, song: string, name: RegExp) {
  await user.click(screen.getByRole('button', { name: `Actions for ${song}` }));
  await user.click(await screen.findByRole('menuitem', { name }));
}

describe('helpers', () => {
  it('formats a plain event date without shifting the day', () => {
    expect(formatEventDate('2026-04-19', 'en-US')).toBe('Sunday, April 19, 2026');
    expect(formatEventDate('not-a-date', 'en-US')).toBe('not-a-date');
  });

  it('describes a move by position', () => {
    expect(movedMessage('Agnus Dei', 1, 5)).toBe('Moved Agnus Dei to 2 of 5');
  });
});

describe('SetlistView', () => {
  it('shows the header and the songs in order', () => {
    setup();
    expect(screen.getByRole('heading', { level: 1, name: detail.name })).toBeInTheDocument();
    expect(screen.getByText(/4 songs/)).toBeInTheDocument();
    expect(rowTitles()).toEqual(titles);
  });

  it('shows X chords and an upload prompt for an override key the song lacks', () => {
    setup();
    // "Be the Center" (keys D, E) is overridden to C in the fixture.
    const link = screen.getByRole('link', { name: 'Upload files for C' });
    const song = detail.items[2]!.song;
    expect(link).toHaveAttribute('href', `/songs/${song.id}/edit`);
  });

  it('shows an empty state with a way to the library', () => {
    setup({ list: { ...detail, items: [], itemCount: 0 } });
    expect(screen.getByText('No songs in this setlist yet.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Find songs in the library' })).toHaveAttribute(
      'href',
      '/library',
    );
  });

  it('is read-only without canEdit', () => {
    setup({ canEdit: false });
    expect(screen.queryByRole('button', { name: /^reorder/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^actions for/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Rename' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
    expect(screen.getByText(/view only/i)).toBeInTheDocument();
    // The prompt still explains the X chords, but without the upload link.
    expect(screen.getByText(/no chords or files for c yet/i)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /upload files/i })).not.toBeInTheDocument();
  });

  it('gives every song a keyboard-reachable reorder handle', () => {
    setup();
    const handle = screen.getByRole('button', { name: `Reorder ${titles[0]}, position 1 of 4` });
    expect(handle).toHaveAttribute('aria-roledescription', 'sortable');
  });

  it('moves a song down and saves the new order', async () => {
    const { user } = setup();
    await chooseAction(user, titles[0]!, /move down/i);
    expect(rowTitles()).toEqual([titles[1], titles[0], titles[2], titles[3]]);
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
    expect(actions.reorderList).toHaveBeenCalledWith(listId, [
      items[1]!.id,
      items[0]!.id,
      items[2]!.id,
      items[3]!.id,
    ]);
    expect(screen.getByText(`Moved ${titles[0]} to 2 of 4`)).toHaveAttribute('role', 'status');
  });

  it('rolls the order back when saving fails', async () => {
    actions.reorderList.mockImplementation(() => fail('The list has changed.'));
    const { user } = setup();
    await chooseAction(user, titles[3]!, /move up/i);
    await waitFor(() => expect(toastMock.error).toHaveBeenCalled());
    expect(rowTitles()).toEqual(titles);
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it('disables moves past the ends', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: `Actions for ${titles[0]}` }));
    expect(await screen.findByRole('menuitem', { name: /move up/i })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('removes a song', async () => {
    const { user } = setup();
    await chooseAction(user, titles[1]!, /remove/i);
    expect(rowTitles()).toEqual([titles[0], titles[2], titles[3]]);
    await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith(`Removed “${titles[1]}”`));
    expect(actions.removeListItem).toHaveBeenCalledWith(items[1]!.id);
  });

  it('puts a song back when removing fails', async () => {
    actions.removeListItem.mockImplementation(() => fail('Nope'));
    const { user } = setup();
    await chooseAction(user, titles[1]!, /remove/i);
    await waitFor(() => expect(toastMock.error).toHaveBeenCalled());
    expect(rowTitles()).toEqual(titles);
  });

  it('overrides the key to one the song lacks: X chords and the upload prompt', async () => {
    const { user } = setup();
    // "Cause to Celebrate" has D and C only.
    await chooseAction(user, titles[0]!, /change key/i);
    const dialog = await screen.findByRole('dialog');
    await user.selectOptions(within(dialog).getByLabelText('Key'), 'E');
    expect(actions.updateListItem).toHaveBeenCalledWith(items[0]!.id, { overrideKey: 'E' });
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
    expect(within(dialog).getByRole('link', { name: 'Upload files for E' })).toBeInTheDocument();
    await user.keyboard('{Escape}');

    const row = screen.getByRole('group', { name: titles[0] }).closest('li')!;
    expect(within(row).getByRole('link', { name: 'Upload files for E' })).toBeInTheDocument();
    expect(within(row).getAllByText('X')).toHaveLength(4);
    expect(within(row).getByRole('img', { name: /key e, set for this event/i })).toBeVisible();
  });

  it('rolls an override back when saving fails', async () => {
    actions.updateListItem.mockImplementation(() => fail('Nope'));
    const { user } = setup();
    await chooseAction(user, titles[0]!, /change key/i);
    const dialog = await screen.findByRole('dialog');
    await user.selectOptions(within(dialog).getByLabelText('Key'), 'E');
    await waitFor(() => expect(toastMock.error).toHaveBeenCalled());
    await user.keyboard('{Escape}');
    const row = screen.getByRole('group', { name: titles[0] });
    expect(within(row).getByRole('img', { name: 'Key D' })).toBeInTheDocument();
  });

  it('opens the key panel for a row', async () => {
    const { user } = setup();
    await user.click(
      within(screen.getByRole('group', { name: titles[3] })).getByRole('button', {
        name: /show all keys/i,
      }),
    );
    expect(await screen.findByRole('dialog')).toHaveTextContent('Keys and first chords');
  });

  it('opens the song page for row details when song details are missing', async () => {
    const { user } = setup({ songs: undefined });
    await user.click(
      within(screen.getByRole('group', { name: titles[3] })).getByRole('button', {
        name: /show first lines/i,
      }),
    );
    expect(router.push).toHaveBeenCalledWith(`/songs/${detail.items[3]!.song.id}`);
  });

  it('renames the setlist', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: 'Rename' }));
    const dialog = await screen.findByRole('dialog');
    const name = within(dialog).getByLabelText('Name');
    await user.clear(name);
    await user.type(name, 'Easter vigil');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(actions.renameList).toHaveBeenCalledWith(listId, 'Easter vigil', detail.eventDate),
    );
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Easter vigil' }),
    ).toBeInTheDocument();
    expect(toastMock.success).toHaveBeenCalledWith('Setlist renamed');
  });

  it('asks for a name before renaming', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: 'Rename' }));
    const dialog = await screen.findByRole('dialog');
    await user.clear(within(dialog).getByLabelText('Name'));
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(within(dialog).getByText('Enter a name.')).toBeInTheDocument();
    expect(actions.renameList).not.toHaveBeenCalled();
  });

  it('shows server field errors from a rename', async () => {
    actions.renameList.mockImplementation(() =>
      Promise.resolve({
        ok: false,
        error: { code: 'VALIDATION', message: 'Bad', fieldErrors: { eventDate: ['Bad date'] } },
      }),
    );
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: 'Rename' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await within(dialog).findByText('Bad date')).toBeInTheDocument();
  });

  it('deletes after confirming and goes back to the setlists', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete this setlist?' });
    await user.click(within(dialog).getByRole('button', { name: 'Delete setlist' }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith(SETLISTS_HREF));
    expect(actions.deleteList).toHaveBeenCalledWith(listId);
  });

  it('stays put when deleting fails', async () => {
    actions.deleteList.mockImplementation(() => fail('Nope'));
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Delete setlist' }));
    await waitFor(() => expect(toastMock.error).toHaveBeenCalled());
    expect(router.push).not.toHaveBeenCalled();
  });

  it('cancelling delete does nothing', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(actions.deleteList).not.toHaveBeenCalled();
  });
});

describe('SetlistViewSkeleton', () => {
  it('is marked busy', () => {
    render(<SetlistViewSkeleton />);
    expect(screen.getByLabelText('Loading setlist')).toHaveAttribute('aria-busy', 'true');
  });
});
