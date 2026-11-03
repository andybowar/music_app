import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { mockViewport } from '@/components/ui/test-media';
import { CurrentListProvider, useCurrentList } from '@/features/lists/ui/CurrentList';
import { BRANCH_IDS, LIST_IDS, getList, getSong, lists, songSummaries } from '@/fixtures';
import type { ActionResult, List, ListItem, SongDetail, UUID } from '@/types/domain';
import type { ListInput } from '@/types/validation';

import { sampleActivity } from './activityFixtures';
import {
  BranchesView,
  branchAnchor,
  otherBranches,
  setlistCount,
  type BranchesViewProps,
} from './BranchesView';

const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => router,
  usePathname: () => '/branches',
}));

vi.mock('@/components/media/PdfViewer', () => ({
  PdfViewer: ({ title }: { title: string }) => <div role="dialog" aria-label={title} />,
}));

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

// Radix menus/panels plus user-event are slow under a loaded runner.
vi.setConfig({ testTimeout: 20_000 });

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  Element.prototype.scrollIntoView ??= () => {};
  Element.prototype.hasPointerCapture ??= () => false;
});

const ok = <T,>(data: T): ActionResult<T> => ({ ok: true, data });

const setlist = getList(LIST_IDS.bg41926);
const item = (listId: UUID, songId: UUID): ListItem => ({
  id: 'item-1',
  listId,
  songId,
  position: 0,
  overrideKey: null,
  overrideBpm: null,
  overrideEnergy: null,
  resourceId: null,
  notes: null,
});

const addListItem = vi.fn<(listId: UUID, songId: UUID) => Promise<ActionResult<ListItem>>>();
const createList = vi.fn<(input: ListInput) => Promise<ActionResult<List>>>();
const removeListItem = vi.fn<(itemId: UUID) => Promise<ActionResult<void>>>();
const loadSong = vi.fn<(id: UUID) => Promise<ActionResult<SongDetail>>>();
const getSignedResourceUrl =
  vi.fn<(id: UUID) => Promise<ActionResult<{ url: string; expiresAt: string }>>>();

function props(overrides: Partial<BranchesViewProps> = {}): BranchesViewProps {
  return {
    activity: sampleActivity(),
    ownBranchId: BRANCH_IDS.servant,
    lists: [setlist],
    currentList: null,
    actions: { addListItem, createList, removeListItem },
    loadSong,
    getSignedResourceUrl,
    ...overrides,
  };
}

const card = (name: string) =>
  screen.getByRole('region', { name: new RegExp(`^${name}`) }) as HTMLElement;

beforeEach(() => {
  vi.clearAllMocks();
  mockViewport(360);
  addListItem.mockImplementation(async (listId, songId) => ok(item(listId, songId)));
  createList.mockImplementation(async (input) =>
    ok({ ...setlist, id: 'new-list', name: input.name, type: input.type }),
  );
  removeListItem.mockResolvedValue(ok(undefined));
  loadSong.mockImplementation(async (id) => ok(getSong(id)));
});

afterEach(cleanup);

describe('helpers', () => {
  it('leaves out the viewer’s own branch, or none when they have no branch', () => {
    const all = sampleActivity();
    expect(otherBranches(all, BRANCH_IDS.servant).map((a) => a.branch.code)).toEqual([
      'CO',
      'OR',
      'RF',
    ]);
    expect(otherBranches(all, null)).toHaveLength(all.length);
  });

  it('pluralises setlists and builds stable anchors', () => {
    expect(setlistCount(1)).toBe('1 setlist');
    expect(setlistCount(3)).toBe('3 setlists');
    expect(branchAnchor('CO Springs')).toBe('branch-co-springs');
  });
});

describe('BranchesView', () => {
  it('shows a card per other branch with its three sections', () => {
    render(<BranchesView {...props()} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Other branches' })).toBeInTheDocument();
    expect(screen.getAllByTestId('branch-card')).toHaveLength(3);
    expect(screen.queryByRole('region', { name: /^Servant/ })).not.toBeInTheDocument();

    const portland = card('Portland');
    expect(within(portland).getByText('Recently added, last 90 days')).toBeInTheDocument();
    expect(within(portland).getByText('Upcoming setlists')).toBeInTheDocument();
    expect(within(portland).getByText('Most used, last 90 days')).toBeInTheDocument();
    for (const s of songSummaries.slice(0, 6)) {
      expect(within(portland).getByRole('group', { name: s.title })).toBeInTheDocument();
    }
    const upcoming = within(portland).getByRole('link', { name: /BG 4\/19\/26/ });
    expect(upcoming).toHaveAttribute('href', `/lists/${LIST_IDS.bg41926}`);
    expect(upcoming).toHaveTextContent('4 songs');
    // Playlists never show as upcoming setlists.
    expect(within(portland).queryByText('Background 1')).not.toBeInTheDocument();
    // Top songs carry their use count.
    expect(within(portland).getAllByTestId('use-count')[0]).toHaveTextContent('On 4 setlists');
  });

  it('shows empty states for sections with nothing in them', () => {
    render(<BranchesView {...props()} />);
    const rockford = card('Rockford');
    expect(within(rockford).getByText('No songs added in the last 90 days.')).toBeInTheDocument();
    expect(within(rockford).getByText('No upcoming setlists.')).toBeInTheDocument();
    expect(within(rockford).getByText('No setlists in the last 90 days.')).toBeInTheDocument();
  });

  it('uses the given window in the headings', () => {
    render(<BranchesView {...props({ days: 30 })} />);
    expect(within(card('Portland')).getByText('Most used, last 30 days')).toBeInTheDocument();
  });

  it('links to each branch card', () => {
    render(<BranchesView {...props()} />);
    const nav = screen.getByRole('navigation', { name: 'Jump to branch' });
    expect(within(nav).getByRole('link', { name: 'Portland' })).toHaveAttribute(
      'href',
      '#branch-or',
    );
    expect(card('Portland')).toHaveAttribute('id', 'branch-or');
  });

  it('says so when there are no other branches', () => {
    const own = sampleActivity().filter((a) => a.branch.id === BRANCH_IDS.servant);
    render(<BranchesView {...props({ activity: own })} />);
    expect(screen.getByText('There are no other branches yet.')).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Jump to branch' })).not.toBeInTheDocument();
  });

  it('shows the error with a retry that refreshes the page', async () => {
    const user = userEvent.setup();
    render(<BranchesView {...props({ activity: null, error: 'Activity failed.' })} />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Activity failed.');
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(router.refresh).toHaveBeenCalled();
  });

  it('adds a row’s song to an existing list from its ADD menu', async () => {
    const user = userEvent.setup();
    render(<BranchesView {...props()} />);
    const song = songSummaries[3]!;
    await user.click(
      within(card('Portland')).getByRole('button', { name: `Add “${song.title}” to a list` }),
    );
    await user.click(await screen.findByRole('menuitem', { name: `Event: ${setlist.name}` }));
    await waitFor(() => expect(addListItem).toHaveBeenCalledWith(setlist.id, song.id));
    expect(toastMock.success).toHaveBeenCalledWith(`Added to Event: ${setlist.name}`, {
      action: expect.objectContaining({ label: 'Undo' }),
    });

    // Undo removes the item that was just added.
    const undo = toastMock.success.mock.calls.at(-1)?.[1] as { action: { onClick(): void } };
    undo.action.onClick();
    await waitFor(() => expect(removeListItem).toHaveBeenCalledWith('item-1'));
  });

  it('offers the current list first', async () => {
    const user = userEvent.setup();
    render(<BranchesView {...props({ currentList: setlist, lists })} />);
    const song = songSummaries[0]!;
    await user.click(
      within(card('Portland')).getByRole('button', { name: `Add “${song.title}” to a list` }),
    );
    expect(await screen.findByText('Current')).toBeInTheDocument();
    expect(screen.getAllByRole('menuitem')[0]).toHaveAccessibleName(`Event: ${setlist.name}`);
  });

  it('makes a new list current and offers it on every row', async () => {
    const user = userEvent.setup();
    render(<BranchesView {...props({ lists: [] })} />);
    const song = songSummaries[0]!;
    await user.click(
      within(card('Portland')).getByRole('button', { name: `Add “${song.title}” to a list` }),
    );
    await user.click(await screen.findByRole('menuitem', { name: /New listening playlist/ }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/name/i), 'Car mix');
    await user.click(within(dialog).getByRole('button', { name: /create/i }));
    await waitFor(() =>
      expect(createList).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'playlist', name: 'Car mix' }),
      ),
    );
    await waitFor(() => expect(addListItem).toHaveBeenCalledWith('new-list', song.id));

    const other = songSummaries[6]!;
    await user.click(
      within(card('CO Springs')).getByRole('button', { name: `Add “${other.title}” to a list` }),
    );
    expect(await screen.findByText('Current')).toBeInTheDocument();
    expect(screen.getAllByRole('menuitem')[0]).toHaveAccessibleName('Listen: Car mix');
  });

  it('uses the app shell’s current list when a provider is already mounted', async () => {
    let shell: List | null = null;
    function Spy() {
      shell = useCurrentList().current;
      return null;
    }
    const user = userEvent.setup();
    render(
      <CurrentListProvider initial={null}>
        <Spy />
        <BranchesView {...props({ lists: [] })} />
      </CurrentListProvider>,
    );
    const song = songSummaries[0]!;
    await user.click(
      within(card('Portland')).getByRole('button', { name: `Add “${song.title}” to a list` }),
    );
    await user.click(await screen.findByRole('menuitem', { name: /New listening playlist/ }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/name/i), 'Car mix');
    await user.click(within(dialog).getByRole('button', { name: /create/i }));
    await waitFor(() => expect(shell).toMatchObject({ id: 'new-list' }));
  });

  it('opens a row’s detail panel and loads the song once', async () => {
    const user = userEvent.setup();
    render(<BranchesView {...props()} />);
    const song = songSummaries[0]!;
    const row = within(card('Portland')).getByRole('group', { name: song.title });
    await user.click(within(row).getByRole('button', { name: /show all composers/ }));
    expect(await screen.findByRole('dialog', { name: 'Composers' })).toBeInTheDocument();
    expect(loadSong).toHaveBeenCalledWith(song.id);
    expect(loadSong).toHaveBeenCalledTimes(1);
  });
});
