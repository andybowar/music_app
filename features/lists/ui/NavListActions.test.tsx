import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { LIST_IDS, getList } from '@/fixtures';
import type { ActionResult, List } from '@/types/domain';
import type { ListInput } from '@/types/validation';

import { ListActionsProvider } from './AddToListAction';
import { CurrentListProvider } from './CurrentList';
import { AFTER_CREATE_HREF, NavListActions } from './NavListActions';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  usePathname: () => '/songs/x',
  useRouter: () => ({ push, refresh: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

const setlist = getList(LIST_IDS.bg41926);

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
  push.mockReset();
  document.cookie = 'current_list=; Max-Age=0; Path=/';
});

afterEach(cleanup);

function setup(
  createList: (input: ListInput) => Promise<ActionResult<List>> = async (input) => ({
    ok: true,
    data: { ...setlist, id: 'created-id', name: input.name, type: input.type },
  }),
  current: List | null = null,
) {
  const create = vi.fn(createList);
  const onShare = vi.fn();
  const user = userEvent.setup();
  render(
    <CurrentListProvider initial={current}>
      <ListActionsProvider
        lists={[]}
        createList={create}
        addListItem={vi.fn()}
        removeListItem={vi.fn()}
      >
        <NavListActions onShare={onShare} />
      </ListActionsProvider>
    </CurrentListProvider>,
  );
  return { user, create, onShare };
}

const desktop = () => within(screen.getByTestId('nav-desktop'));

describe('NavListActions', () => {
  it('creates an event setlist, makes it current and goes to the library', async () => {
    const { user, create } = setup();
    expect(desktop().getByRole('button', { name: /^Share/ })).toBeDisabled();

    await user.click(desktop().getByRole('button', { name: 'Create event setlist' }));
    await screen.findByRole('dialog', { name: 'Create event setlist' });
    const name = screen.getByLabelText('Name');
    await user.clear(name);
    await user.type(name, 'Prayer meeting');
    await user.click(screen.getByRole('button', { name: 'Create setlist' }));

    await waitFor(() => expect(push).toHaveBeenCalledWith(AFTER_CREATE_HREF));
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'setlist', name: 'Prayer meeting' }),
    );
    await waitFor(() => expect(document.cookie).toContain('current_list=created-id'));
    // The new current list enables Share.
    expect(desktop().getByRole('button', { name: 'Share “Prayer meeting”' })).toBeEnabled();
  });

  it('opens the playlist dialog for "Create listening playlist"', async () => {
    const { user } = setup();
    await user.click(desktop().getByRole('button', { name: 'Create listening playlist' }));
    expect(
      await screen.findByRole('dialog', { name: 'Create listening playlist' }),
    ).toBeInTheDocument();
  });

  it('stays put and keeps the dialog open when creating fails', async () => {
    const { user } = setup(async () => ({
      ok: false,
      error: { code: 'FORBIDDEN', message: 'No permission.' },
    }));
    await user.click(desktop().getByRole('button', { name: 'Create listening playlist' }));
    await screen.findByRole('dialog', { name: 'Create listening playlist' });
    await user.type(screen.getByLabelText('Name'), 'Car rides');
    await user.click(screen.getByRole('button', { name: 'Create playlist' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('No permission.');
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Create listening playlist' })).toBeInTheDocument();
  });

  it('shares the current list', async () => {
    const { user, onShare } = setup(undefined, setlist);
    await user.click(desktop().getByRole('button', { name: `Share “${setlist.name}”` }));
    expect(onShare).toHaveBeenCalledTimes(1);
  });

  it('reports an error when rendered without a ListActionsProvider', async () => {
    const user = userEvent.setup();
    render(
      <CurrentListProvider initial={null}>
        <NavListActions onShare={vi.fn()} />
      </CurrentListProvider>,
    );
    await user.click(desktop().getByRole('button', { name: 'Create event setlist' }));
    await screen.findByRole('dialog', { name: 'Create event setlist' });
    await user.click(screen.getByRole('button', { name: 'Create setlist' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/unavailable/i);
    expect(push).not.toHaveBeenCalled();
  });
});
