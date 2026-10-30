import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { LIST_IDS, SONG_IDS, getList, lists } from '@/fixtures';
import type { ActionResult, List, UUID } from '@/types/domain';
import type { ListInput } from '@/types/validation';

import { AddToListMenu, listLabel, type AddToListMenuProps } from './AddToListMenu';

interface ToastAction {
  label: string;
  onClick(): void;
}
interface ToastOptions {
  description?: string;
  action?: ToastAction;
}

const toastMock = vi.hoisted(() => {
  const fn = vi.fn() as ReturnType<typeof vi.fn> & {
    success: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };
  fn.success = vi.fn();
  fn.error = vi.fn();
  return fn;
});
vi.mock('sonner', () => ({ toast: toastMock }));

const setlist = getList(LIST_IDS.bg41926);
const playlist = getList(LIST_IDS.background1);

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
  toastMock.mockReset();
  toastMock.success.mockReset();
  toastMock.error.mockReset();
});

afterEach(cleanup);

const okAdd = (id: UUID): Promise<ActionResult<unknown>> =>
  Promise.resolve({ ok: true, data: { id: `item-of-${id}` } });

function setup(props: Partial<AddToListMenuProps> = {}) {
  const onAdd = vi.fn(okAdd);
  const onCreate = vi.fn(async (input: ListInput): Promise<ActionResult<List>> => ({
    ok: true,
    data: { ...setlist, id: 'new-list-id', name: input.name, type: input.type },
  }));
  const user = userEvent.setup();
  render(
    <AddToListMenu
      songId={SONG_IDS.thousandHallelujahs}
      current={null}
      lists={lists}
      onAdd={onAdd}
      onCreate={onCreate}
      {...props}
    />,
  );
  return { user, onAdd, onCreate };
}

const trigger = () => screen.getByRole('button', { name: /add/i });

function lastSuccessOptions(): ToastOptions {
  const call = toastMock.success.mock.calls.at(-1);
  return (call?.[1] ?? {}) as ToastOptions;
}

describe('listLabel', () => {
  it('prefixes setlists with Event and playlists with Listen', () => {
    expect(listLabel({ type: 'setlist', name: 'BG 4/19/26' })).toBe('Event: BG 4/19/26');
    expect(listLabel({ type: 'playlist', name: 'Background 1' })).toBe('Listen: Background 1');
  });
});

describe('AddToListMenu', () => {
  it('hides the Current option when there is no current list', async () => {
    const { user } = setup();
    await user.click(trigger());
    expect(screen.queryByText('Current')).not.toBeInTheDocument();
    expect(screen.getByText('Existing')).toBeInTheDocument();
    for (const l of lists) {
      expect(screen.getByRole('menuitem', { name: listLabel(l) })).toBeInTheDocument();
    }
  });

  it('shows the Current option first and does not repeat it under other lists', async () => {
    const { user } = setup({ current: setlist });
    await user.click(trigger());
    expect(screen.getByText('Current')).toBeInTheDocument();
    const items = screen.getAllByRole('menuitem');
    expect(items[0]).toHaveAccessibleName(listLabel(setlist));
    expect(screen.getAllByRole('menuitem', { name: listLabel(setlist) })).toHaveLength(1);
    expect(screen.getByRole('menuitem', { name: listLabel(playlist) })).toBeInTheDocument();
  });

  it('shows an empty state when there are no lists', async () => {
    const { user } = setup({ lists: [] });
    await user.click(trigger());
    expect(screen.getByRole('menuitem', { name: 'No lists yet' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(screen.getByRole('menuitem', { name: 'New event setlist…' })).toBeInTheDocument();
  });

  it('adds to the current list and toasts with an undo that fires onUndo', async () => {
    const onUndo = vi.fn(async (): Promise<ActionResult<unknown>> => ({
      ok: true,
      data: undefined,
    }));
    const { user, onAdd } = setup({ current: setlist, onUndo });
    await user.click(trigger());
    await user.click(screen.getByRole('menuitem', { name: listLabel(setlist) }));

    await waitFor(() => expect(toastMock.success).toHaveBeenCalled());
    expect(onAdd).toHaveBeenCalledWith(setlist.id);
    expect(toastMock.success.mock.calls[0]?.[0]).toBe(`Added to ${listLabel(setlist)}`);

    const action = lastSuccessOptions().action;
    expect(action?.label).toBe('Undo');
    act(() => action?.onClick());
    await waitFor(() =>
      expect(onUndo).toHaveBeenCalledWith(setlist.id, { id: `item-of-${setlist.id}` }),
    );
    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(`Removed from ${listLabel(setlist)}`),
    );
  });

  it('reports a failed undo', async () => {
    const onUndo = vi.fn(async (): Promise<ActionResult<unknown>> => ({
      ok: false,
      error: { code: 'NOT_FOUND', message: 'Item already removed.' },
    }));
    const { user } = setup({ onUndo });
    await user.click(trigger());
    await user.click(screen.getByRole('menuitem', { name: listLabel(playlist) }));
    await waitFor(() => expect(toastMock.success).toHaveBeenCalled());
    act(() => lastSuccessOptions().action?.onClick());
    await waitFor(() =>
      expect(toastMock.error).toHaveBeenCalledWith('Couldn’t undo: Item already removed.'),
    );
  });

  it('omits the undo action when onUndo is not provided', async () => {
    const { user } = setup();
    await user.click(trigger());
    await user.click(screen.getByRole('menuitem', { name: listLabel(playlist) }));
    await waitFor(() => expect(toastMock.success).toHaveBeenCalled());
    expect(lastSuccessOptions().action).toBeUndefined();
  });

  it('shows a loading state while adding and blocks a second add', async () => {
    let resolve: (r: ActionResult<unknown>) => void = () => {};
    const onAdd = vi.fn(
      () =>
        new Promise<ActionResult<unknown>>((r) => {
          resolve = r;
        }),
    );
    const { user } = setup({ onAdd });
    await user.click(trigger());
    await user.click(screen.getByRole('menuitem', { name: listLabel(playlist) }));

    const busy = screen.getByRole('button', { name: `Adding to ${listLabel(playlist)}` });
    expect(busy).toHaveAttribute('aria-busy', 'true');
    await user.click(busy);
    expect(screen.getByRole('menuitem', { name: listLabel(setlist) })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(onAdd).toHaveBeenCalledTimes(1);

    resolve({ ok: true, data: null });
    await waitFor(() => expect(toastMock.success).toHaveBeenCalled());
  });

  it('toasts the error with a retry when the add fails or throws', async () => {
    const onAdd = vi
      .fn<(id: UUID) => Promise<ActionResult<unknown>>>()
      .mockResolvedValueOnce({ ok: false, error: { code: 'FORBIDDEN', message: 'Not allowed.' } })
      .mockRejectedValueOnce(new Error('network'))
      .mockImplementation(okAdd);
    const { user } = setup({ onAdd });
    await user.click(trigger());
    await user.click(screen.getByRole('menuitem', { name: listLabel(playlist) }));

    await waitFor(() => expect(toastMock.error).toHaveBeenCalledTimes(1));
    const [title, opts] = toastMock.error.mock.calls[0] as [string, ToastOptions];
    expect(title).toBe(`Couldn’t add to ${listLabel(playlist)}`);
    expect(opts.description).toBe('Not allowed.');

    act(() => opts.action?.onClick());
    await waitFor(() => expect(toastMock.error).toHaveBeenCalledTimes(2));
    expect((toastMock.error.mock.calls[1] as [string, ToastOptions])[1].description).toMatch(
      /something went wrong/i,
    );

    act(() => (toastMock.error.mock.calls[1] as [string, ToastOptions])[1].action?.onClick());
    await waitFor(() => expect(toastMock.success).toHaveBeenCalled());
    expect(onAdd).toHaveBeenCalledTimes(3);
  });

  it('creates a new list from the menu and adds the song to it', async () => {
    const { user, onCreate, onAdd } = setup();
    await user.click(trigger());
    await user.click(screen.getByRole('menuitem', { name: 'New event setlist…' }));

    const dialog = await screen.findByRole('dialog', { name: 'Create event setlist' });
    const name = screen.getByLabelText('Name');
    await user.clear(name);
    await user.type(name, 'Prayer meeting');
    await user.click(screen.getByRole('button', { name: 'Create setlist' }));

    await waitFor(() => expect(onAdd).toHaveBeenCalledWith('new-list-id'));
    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'setlist', name: 'Prayer meeting' }),
    );
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    expect(toastMock.success).toHaveBeenCalledWith(
      'Added to Event: Prayer meeting',
      expect.anything(),
    );
  });

  it('does not add when creating the list fails', async () => {
    const onCreate = vi.fn(async (): Promise<ActionResult<List>> => ({
      ok: false,
      error: { code: 'FORBIDDEN', message: 'No permission.' },
    }));
    const { user, onAdd } = setup({ onCreate });
    await user.click(trigger());
    await user.click(screen.getByRole('menuitem', { name: 'New listening playlist…' }));
    await screen.findByRole('dialog', { name: 'Create listening playlist' });
    await user.type(screen.getByLabelText('Name'), 'Car rides');
    await user.click(screen.getByRole('button', { name: 'Create playlist' }));
    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith('No permission.'));
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('is keyboard operable', async () => {
    const { user, onAdd } = setup({ current: setlist });
    trigger().focus();
    await user.keyboard('{Enter}');
    await waitFor(() =>
      expect(screen.getByRole('menuitem', { name: listLabel(setlist) })).toHaveFocus(),
    );
    await user.keyboard('{Enter}');
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith(setlist.id));
    await waitFor(() => expect(trigger()).toHaveFocus());
  });

  it('labels the trigger with the song title when given', () => {
    setup({ songTitle: '1000 Hallelujahs' });
    expect(
      screen.getByRole('button', { name: 'Add “1000 Hallelujahs” to a list' }),
    ).toBeInTheDocument();
  });
});
