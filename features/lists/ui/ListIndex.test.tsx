import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { getList, LIST_IDS } from '@/fixtures';
import type { ActionResult, List } from '@/types/domain';
import type { ListInput } from '@/types/validation';

import { CurrentListProvider, useCurrentList } from './CurrentList';
import {
  formatEventDate,
  groupLists,
  ListIndex,
  listIndexHref,
  type ListIndexProps,
} from './ListIndex';

const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast: toastMock }));

const TODAY = '2026-04-20';
const upcoming = getList(LIST_IDS.ag42526); // 2026-04-25
const past = getList(LIST_IDS.bg41926); // 2026-04-19
const playlist = getList(LIST_IDS.background1); // no date

const ok = <T,>(data: T): ActionResult<T> => ({ ok: true, data });

beforeAll(() => {
  // Radix touches APIs jsdom lacks.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  Element.prototype.scrollIntoView ??= () => {};
  Element.prototype.hasPointerCapture ??= () => false;
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 3, 20, 10, 0, 0));
  router.refresh.mockReset();
  router.push.mockReset();
  toastMock.success.mockReset();
  toastMock.error.mockReset();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function setup(overrides: Partial<ListIndexProps> = {}) {
  const props: ListIndexProps = {
    type: 'setlist',
    scope: 'branch',
    lists: [upcoming, past],
    today: TODAY,
    currentListId: null,
    onSetCurrent: vi.fn(async () => ok(null)),
    onCreate: vi.fn(async (input: ListInput) =>
      ok<List>({ ...upcoming, id: '80000000-0000-4000-8000-0000000000aa', ...input }),
    ),
    ...overrides,
  };
  const user = userEvent.setup();
  render(<ListIndex {...props} />);
  return { props, user };
}

describe('helpers', () => {
  it('groups lists into upcoming, past and undated, keeping order and dropping empty groups', () => {
    expect(groupLists([upcoming, past, playlist], TODAY)).toEqual([
      ['upcoming', [upcoming]],
      ['past', [past]],
      ['undated', [playlist]],
    ]);
    // Today counts as upcoming.
    expect(groupLists([past], '2026-04-19')).toEqual([['upcoming', [past]]]);
    expect(groupLists([], TODAY)).toEqual([]);
  });

  it('formats plain dates without shifting the day, and passes bad input through', () => {
    expect(formatEventDate('2026-04-19')).toContain('19');
    expect(formatEventDate('2026-04-19')).toContain('2026');
    expect(formatEventDate('not a date')).toBe('not a date');
  });

  it('builds index URLs, with a scope only for setlists', () => {
    expect(listIndexHref('setlist', 'all')).toBe('/lists?type=setlist&scope=all');
    expect(listIndexHref('setlist')).toBe('/lists?type=setlist');
    expect(listIndexHref('playlist', 'all')).toBe('/lists?type=playlist');
  });
});

describe('ListIndex', () => {
  it('shows scope tabs for setlists, marking the selected one', () => {
    setup({ scope: 'all' });
    expect(screen.getByRole('heading', { level: 1, name: 'Open setlist' })).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Setlist scope' });
    const tabs = within(nav).getAllByRole('link');
    expect(tabs.map((t) => t.textContent)).toEqual(['Mine', 'My branch', 'All branches']);
    expect(within(nav).getByRole('link', { name: 'All branches' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(nav).getByRole('link', { name: 'Mine' })).toHaveAttribute(
      'href',
      '/lists?type=setlist&scope=mine',
    );
    expect(within(nav).getByRole('link', { name: 'Mine' })).not.toHaveAttribute('aria-current');
  });

  it('has no scope tabs for playlists', () => {
    setup({ type: 'playlist', scope: 'mine', lists: [playlist] });
    expect(screen.getByRole('heading', { level: 1, name: 'Open playlist' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'No date' })).toBeInTheDocument();
  });

  it('lists upcoming events before past ones, linking each to its page', () => {
    setup();
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual(['Upcoming', 'Past']);
    const upcomingSection = screen.getByRole('region', { name: 'Upcoming' });
    expect(within(upcomingSection).getByRole('link', { name: upcoming.name })).toHaveAttribute(
      'href',
      `/lists/${upcoming.id}`,
    );
    expect(within(upcomingSection).getByText('2 songs')).toBeInTheDocument();
    // Branch scope shows whose list it is.
    expect(within(upcomingSection).getByText(upcoming.ownerName)).toBeInTheDocument();
    expect(within(upcomingSection).getByText('OR')).toBeInTheDocument();
  });

  it('hides owner and branch on the Mine tab', () => {
    setup({ scope: 'mine' });
    expect(screen.queryByText(upcoming.ownerName)).not.toBeInTheDocument();
    expect(screen.queryByText('OR')).not.toBeInTheDocument();
  });

  it('marks the current list instead of offering to set it', () => {
    setup({ currentListId: past.id });
    const pastSection = screen.getByRole('region', { name: 'Past' });
    expect(within(pastSection).getByText('Current')).toBeInTheDocument();
    expect(within(pastSection).queryByRole('button')).not.toBeInTheDocument();
  });

  it('sets a list as current, then toasts and refreshes', async () => {
    const { props, user } = setup({ currentListId: past.id });
    await user.click(
      screen.getByRole('button', { name: `Set “${upcoming.name}” as current setlist` }),
    );
    expect(props.onSetCurrent).toHaveBeenCalledWith(upcoming);
    await waitFor(() =>
      expect(toastMock.success).toHaveBeenCalledWith(
        `“${upcoming.name}” is now the current setlist`,
      ),
    );
    expect(router.refresh).toHaveBeenCalled();
    const upcomingSection = screen.getByRole('region', { name: 'Upcoming' });
    expect(within(upcomingSection).getByText('Current')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: `Set “${past.name}” as current setlist` }),
    ).toBeInTheDocument();
  });

  it('rolls back and toasts when setting the current list fails', async () => {
    const onSetCurrent = vi.fn(async (): Promise<ActionResult<unknown>> => ({
      ok: false,
      error: { code: 'NOT_FOUND', message: 'List not found.' },
    }));
    const { user } = setup({ currentListId: past.id, onSetCurrent });
    await user.click(
      screen.getByRole('button', { name: `Set “${upcoming.name}” as current setlist` }),
    );
    await waitFor(() =>
      expect(toastMock.error).toHaveBeenCalledWith(
        "Couldn't set the current setlist. List not found.",
      ),
    );
    expect(router.refresh).not.toHaveBeenCalled();
    expect(within(screen.getByRole('region', { name: 'Past' })).getByText('Current')).toBeVisible();
  });

  it('treats a thrown action as a failure', async () => {
    const onSetCurrent = vi.fn(async (): Promise<ActionResult<unknown>> => {
      throw new Error('network');
    });
    const { user } = setup({ onSetCurrent });
    await user.click(
      screen.getByRole('button', { name: `Set “${upcoming.name}” as current setlist` }),
    );
    await waitFor(() => expect(toastMock.error).toHaveBeenCalled());
    expect(screen.queryByText('Current')).not.toBeInTheDocument();
  });

  it('shows skeleton rows while loading', () => {
    setup({ loading: true });
    expect(screen.getByRole('list', { name: 'Loading setlists' })).toHaveAttribute(
      'aria-busy',
      'true',
    );
    expect(screen.queryByRole('link', { name: upcoming.name })).not.toBeInTheDocument();
  });

  it('shows an error with a retry that refreshes the page', async () => {
    const { user } = setup({ error: 'Please try again.' });
    expect(screen.getByRole('alert')).toHaveTextContent(
      "Couldn't load setlists. Please try again.",
    );
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(router.refresh).toHaveBeenCalled();
  });

  it.each([
    ['setlist', 'mine', 'You have no setlists yet.'],
    ['setlist', 'branch', 'No setlists from you or your branch yet.'],
    ['setlist', 'all', 'No setlists yet.'],
    ['playlist', 'mine', 'You have no playlists yet.'],
  ] as const)('shows an empty state for %s / %s', (type, scope, message) => {
    setup({ type, scope, lists: [] });
    expect(screen.getByText(message)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `Create ${type}` })).toBeInTheDocument();
  });

  it('creates a list from the empty state, makes it current and opens it', async () => {
    const { props, user } = setup({ lists: [] });
    await user.click(screen.getByRole('button', { name: 'Create setlist' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Create setlist' }));
    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith('/lists/80000000-0000-4000-8000-0000000000aa'),
    );
    expect(props.onCreate).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'setlist', eventDate: '2026-04-26' }),
    );
    expect(props.onSetCurrent).toHaveBeenCalledWith(
      expect.objectContaining({ id: '80000000-0000-4000-8000-0000000000aa' }),
    );
  });

  it('does not navigate when creating fails', async () => {
    const onCreate = vi.fn(async (): Promise<ActionResult<List>> => ({
      ok: false,
      error: { code: 'INTERNAL', message: 'Nope.' },
    }));
    const { props, user } = setup({ onCreate });
    await user.click(screen.getByRole('button', { name: 'New setlist' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Create setlist' }));
    await waitFor(() => expect(onCreate).toHaveBeenCalled());
    expect(props.onSetCurrent).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
  });

  it('follows and updates the CurrentListProvider when one is mounted', async () => {
    function Probe() {
      const { current } = useCurrentList();
      return <output aria-label="provider current">{current?.id ?? 'none'}</output>;
    }
    const user = userEvent.setup();
    const onSetCurrent = vi.fn(async () => ok(null));
    render(
      <CurrentListProvider initial={past}>
        <ListIndex
          type="setlist"
          scope="branch"
          lists={[upcoming, past]}
          today={TODAY}
          currentListId={null}
          onSetCurrent={onSetCurrent}
          onCreate={vi.fn()}
        />
        <Probe />
      </CurrentListProvider>,
    );
    expect(within(screen.getByRole('region', { name: 'Past' })).getByText('Current')).toBeVisible();
    await user.click(
      screen.getByRole('button', { name: `Set “${upcoming.name}” as current setlist` }),
    );
    await waitFor(() =>
      expect(screen.getByLabelText('provider current')).toHaveTextContent(upcoming.id),
    );
  });
});
