import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { LIST_IDS, SONG_IDS, getList, lists } from '@/fixtures';
import type { ActionResult, List, ListItem, UUID } from '@/types/domain';
import type { ListInput } from '@/types/validation';

import {
  AddToListAction,
  ListActionsProvider,
  mergeLists,
  useListActions,
  type ListActionsProviderProps,
} from './AddToListAction';
import { listLabel } from './AddToListMenu';
import { CurrentListProvider, useCurrentList } from './CurrentList';

interface ToastOptions {
  action?: { label: string; onClick(): void };
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
const SONG = SONG_IDS.thousandHallelujahs;

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
  document.cookie = 'current_list=; Max-Age=0; Path=/';
});

afterEach(cleanup);

function item(listId: UUID, songId: UUID): ListItem {
  return {
    id: `item-${listId}`,
    listId,
    songId,
    position: 0,
    overrideKey: null,
    overrideBpm: null,
    overrideEnergy: null,
    resourceId: null,
    notes: null,
  };
}

function CurrentName() {
  const { current } = useCurrentList();
  return <p data-testid="current">{current?.name ?? 'none'}</p>;
}

function setup({
  current = null,
  ...props
}: Partial<Omit<ListActionsProviderProps, 'children'>> & { current?: List | null } = {}) {
  const createList = vi.fn(async (input: ListInput): Promise<ActionResult<List>> => ({
    ok: true,
    data: { ...setlist, id: 'new-list-id', name: input.name, type: input.type, itemCount: 0 },
  }));
  const addListItem = vi.fn(
    async (listId: UUID, songId: UUID): Promise<ActionResult<ListItem>> => ({
      ok: true,
      data: item(listId, songId),
    }),
  );
  const removeListItem = vi.fn(async (): Promise<ActionResult<unknown>> => ({
    ok: true,
    data: undefined,
  }));
  const user = userEvent.setup();
  render(
    <CurrentListProvider initial={current}>
      <ListActionsProvider
        lists={lists}
        createList={createList}
        addListItem={addListItem}
        removeListItem={removeListItem}
        {...props}
      >
        <AddToListAction songId={SONG} songTitle="1000 Hallelujahs" />
        <CurrentName />
      </ListActionsProvider>
    </CurrentListProvider>,
  );
  return { user, createList, addListItem, removeListItem };
}

const trigger = () => screen.getByRole('button', { name: 'Add “1000 Hallelujahs” to a list' });

describe('mergeLists', () => {
  it('prepends lists that are not present yet', () => {
    expect(mergeLists([playlist], [setlist, playlist])).toEqual([setlist, playlist]);
  });

  it('returns the same array when nothing is new', () => {
    const base = [setlist];
    expect(mergeLists(base, [setlist])).toBe(base);
  });
});

describe('AddToListAction', () => {
  it('renders nothing outside a ListActionsProvider', () => {
    const { container } = render(<AddToListAction songId={SONG} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('offers the current list and the provided lists', async () => {
    const { user } = setup({ current: setlist });
    await user.click(trigger());
    expect(screen.getByText('Current')).toBeInTheDocument();
    expect(screen.getAllByRole('menuitem')[0]).toHaveAccessibleName(listLabel(setlist));
    expect(screen.getByRole('menuitem', { name: listLabel(playlist) })).toBeInTheDocument();
  });

  it('adds the song to the chosen list and undoes by removing the new item', async () => {
    const { user, addListItem, removeListItem } = setup();
    await user.click(trigger());
    await user.click(screen.getByRole('menuitem', { name: listLabel(playlist) }));

    await waitFor(() => expect(toastMock.success).toHaveBeenCalled());
    expect(addListItem).toHaveBeenCalledWith(playlist.id, SONG);

    const options = toastMock.success.mock.calls[0]?.[1] as ToastOptions;
    expect(options.action?.label).toBe('Undo');
    act(() => options.action?.onClick());
    await waitFor(() => expect(removeListItem).toHaveBeenCalledWith(`item-${playlist.id}`));
  });

  it('reports an undo error when the add returned no item id', async () => {
    const addListItem = vi.fn(async (): Promise<ActionResult<ListItem>> => ({
      ok: true,
      data: null as unknown as ListItem,
    }));
    const { user, removeListItem } = setup({ addListItem });
    await user.click(trigger());
    await user.click(screen.getByRole('menuitem', { name: listLabel(playlist) }));
    await waitFor(() => expect(toastMock.success).toHaveBeenCalled());
    act(() => (toastMock.success.mock.calls[0]?.[1] as ToastOptions).action?.onClick());
    await waitFor(() => expect(toastMock.error).toHaveBeenCalled());
    expect(removeListItem).not.toHaveBeenCalled();
  });

  it('creates a list from the menu, makes it current and adds the song', async () => {
    const { user, createList, addListItem } = setup();
    await user.click(trigger());
    await user.click(screen.getByRole('menuitem', { name: 'New event setlist…' }));
    await screen.findByRole('dialog', { name: 'Create event setlist' });
    const name = screen.getByLabelText('Name');
    await user.clear(name);
    await user.type(name, 'Prayer meeting');
    await user.click(screen.getByRole('button', { name: 'Create setlist' }));

    await waitFor(() => expect(addListItem).toHaveBeenCalledWith('new-list-id', SONG));
    expect(createList).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'setlist', name: 'Prayer meeting' }),
    );
    expect(screen.getByTestId('current')).toHaveTextContent('Prayer meeting');
    await waitFor(() => expect(document.cookie).toContain('current_list=new-list-id'));

    // The new list now shows as Current in every row's menu.
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await user.click(trigger());
    expect(screen.getAllByRole('menuitem')[0]).toHaveAccessibleName('Event: Prayer meeting');
  });
});

describe('ListActionsProvider.create', () => {
  function Probe({
    onReady,
  }: {
    onReady(v: NonNullable<ReturnType<typeof useListActions>>): void;
  }) {
    const ctx = useListActions();
    if (ctx) onReady(ctx);
    return <CurrentName />;
  }

  function renderProbe(createList: ListActionsProviderProps['createList']) {
    let ctx: NonNullable<ReturnType<typeof useListActions>> | null = null;
    render(
      <CurrentListProvider initial={null}>
        <ListActionsProvider
          lists={[]}
          createList={createList}
          addListItem={vi.fn()}
          removeListItem={vi.fn()}
        >
          <Probe onReady={(v) => (ctx = v)} />
        </ListActionsProvider>
      </CurrentListProvider>,
    );
    return () => ctx!;
  }

  it('keeps the current list when creating fails', async () => {
    const get = renderProbe(async () => ({
      ok: false,
      error: { code: 'FORBIDDEN', message: 'No permission.' },
    }));
    let result: ActionResult<List> | undefined;
    await act(async () => {
      result = await get().create({ type: 'setlist', name: 'X', eventDate: '2026-11-08' });
    });
    expect(result?.ok).toBe(false);
    expect(screen.getByTestId('current')).toHaveTextContent('none');
    expect(get().lists).toEqual([]);
  });

  it('turns a thrown create into an INTERNAL result', async () => {
    const get = renderProbe(() => Promise.reject(new Error('network')));
    let result: ActionResult<List> | undefined;
    await act(async () => {
      result = await get().create({ type: 'playlist', name: 'Car', eventDate: null });
    });
    expect(result).toMatchObject({ ok: false, error: { code: 'INTERNAL' } });
  });

  it('adds a created list to the offered lists', async () => {
    const get = renderProbe(async (input) => ({
      ok: true,
      data: { ...playlist, id: 'fresh', name: input.name },
    }));
    await act(async () => {
      await get().create({ type: 'playlist', name: 'Car', eventDate: null });
    });
    expect(get().lists.map((l) => l.id)).toEqual(['fresh']);
    expect(screen.getByTestId('current')).toHaveTextContent('Car');
  });
});
