import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useSyncExternalStore } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { mockViewport } from '@/components/ui/test-media';
import { appendPage, hasActiveSearch, LibraryView } from '@/features/search/ui/LibraryView';
import { getSong, SONG_IDS, songSummaries } from '@/fixtures';
import type { ActionResult, FacetOptions, SearchResult, SongDetail } from '@/types/domain';

// In-memory URL standing in for the Next.js router (same approach as useSearchState.test.ts).
const url = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  const state = { pathname: '/library', search: '' };
  const set = (href: string) => {
    const [path, search = ''] = href.split('?');
    state.pathname = path ?? '/library';
    state.search = search;
    listeners.forEach((l) => l());
  };
  return {
    state,
    listeners,
    set,
    push: vi.fn((href: string) => set(href)),
    replace: vi.fn((href: string) => set(href)),
    refresh: vi.fn(),
  };
});

vi.mock('next/navigation', () => {
  const subscribe = (l: () => void) => {
    url.listeners.add(l);
    return () => url.listeners.delete(l);
  };
  const router = { push: url.push, replace: url.replace, refresh: url.refresh };
  return {
    useRouter: () => router,
    usePathname: () => useSyncExternalStore(subscribe, () => url.state.pathname),
    useSearchParams: () => {
      const search = useSyncExternalStore(subscribe, () => url.state.search);
      return new URLSearchParams(search);
    },
  };
});

// The real viewer lazy-loads pdf.js; a stub dialog is enough to see that it opened.
vi.mock('@/components/media/PdfViewer', () => ({
  PdfViewer: ({ url, title, onClose }: { url: string; title: string; onClose(): void }) => (
    <div role="dialog" aria-label={title} data-url={url}>
      <button type="button" onClick={onClose}>
        Close viewer
      </button>
    </div>
  ),
}));

// Radix panels plus user-event are slow under a loaded CI runner.
vi.setConfig({ testTimeout: 20_000 });

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  Element.prototype.scrollIntoView ??= () => {};
  Element.prototype.hasPointerCapture ??= () => false;
});

const facets: FacetOptions = {
  keys: ['C', 'D', 'G'],
  decades: [1990, 2010],
  chords: { chorus: ['C'], verse: ['D'], bridge: ['G'] },
  branches: [],
};

const first = songSummaries.slice(0, 3);
const second = songSummaries.slice(3, 6);

function result(items = first, total = 6, extra: Partial<SearchResult> = {}): SearchResult {
  return { items, total, page: 1, pageSize: 3, ...extra };
}

const ok = <T,>(data: T): ActionResult<T> => ({ ok: true, data });

const searchMore = vi.fn<(q: string) => Promise<ActionResult<SearchResult>>>();
const loadSong = vi.fn<(id: string) => Promise<ActionResult<SongDetail>>>();
const getSignedResourceUrl =
  vi.fn<(id: string) => Promise<ActionResult<{ url: string; expiresAt: string }>>>();

function renderView(props: Partial<Parameters<typeof LibraryView>[0]> = {}) {
  return render(
    <LibraryView
      result={result()}
      facets={facets}
      searchMore={searchMore}
      loadSong={loadSong}
      getSignedResourceUrl={getSignedResourceUrl}
      {...props}
    />,
  );
}

const rowFor = (title: string) => screen.getByRole('group', { name: title });

beforeEach(() => {
  url.set('/library');
  vi.clearAllMocks();
  mockViewport(360);
  searchMore.mockResolvedValue(ok(result(second, 6, { page: 2 })));
  loadSong.mockImplementation(async (id) => ok(getSong(id)));
  getSignedResourceUrl.mockResolvedValue(
    ok({ url: 'https://files.test/signed.pdf', expiresAt: '2099-01-01T00:00:00Z' }),
  );
});

afterEach(() => {
  cleanup();
  url.listeners.clear();
});

describe('appendPage', () => {
  it('appends without duplicating songs already shown', () => {
    const merged = appendPage(first, [first[2]!, ...second]);
    expect(merged.map((s) => s.id)).toEqual([...first, ...second].map((s) => s.id));
  });
});

describe('hasActiveSearch', () => {
  it('ignores the page number', () => {
    expect(hasActiveSearch({})).toBe(false);
    expect(hasActiveSearch({ page: 3 })).toBe(false);
    expect(hasActiveSearch({ q: 'grace' })).toBe(true);
    expect(hasActiveSearch({ energy: ['high_praise'] })).toBe(true);
  });
});

describe('LibraryView', () => {
  it('renders the default view: count, rows, search box and filters', () => {
    renderView();
    expect(screen.getByRole('heading', { level: 1, name: 'Worship Library' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('6 songs');
    const list = screen.getByRole('list', { name: 'Songs' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByRole('search', { name: 'Song search' })).toBeInTheDocument();
    // No search set: the empty state wouldn't offer "Clear filters".
    expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument();
  });

  it('links to the new-song form only with canAddSong (LIB-20)', () => {
    renderView();
    expect(screen.queryByRole('link', { name: 'Add song' })).not.toBeInTheDocument();
    cleanup();
    renderView({ canAddSong: true });
    expect(screen.getByRole('link', { name: 'Add song' })).toHaveAttribute('href', '/songs/new');
  });

  it('shows the search from the URL in the box', () => {
    url.set('/library?q=grace');
    renderView();
    expect(screen.getByLabelText('Search songs')).toHaveValue('grace');
  });

  it('submitting the search pushes it to the URL', async () => {
    const user = userEvent.setup();
    renderView();
    await user.type(screen.getByLabelText('Search songs'), 'redemption{Enter}');
    expect(url.push).toHaveBeenLastCalledWith('/library?q=redemption', { scroll: false });
  });

  it('loads and appends the next page with the current search', async () => {
    url.set('/library?q=grace');
    const user = userEvent.setup();
    renderView();
    await user.click(screen.getByRole('button', { name: /Load more songs/ }));
    expect(searchMore).toHaveBeenCalledWith('q=grace&page=2');
    await waitFor(() =>
      expect(
        within(screen.getByRole('list', { name: 'Songs' })).getAllByRole('listitem'),
      ).toHaveLength(6),
    );
    expect(screen.queryByRole('button', { name: /Load more songs/ })).not.toBeInTheDocument();
  });

  it('shows a load-more failure under the rows and retries', async () => {
    searchMore.mockResolvedValueOnce({
      ok: false,
      error: { code: 'INTERNAL', message: 'Something went wrong. Please try again.' },
    });
    const user = userEvent.setup();
    renderView();
    await user.click(screen.getByRole('button', { name: /Load more songs/ }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Couldn’t load more songs');
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(6));
  });

  it('starts over when a new search arrives from the server', async () => {
    const user = userEvent.setup();
    const { rerender } = renderView();
    await user.click(screen.getByRole('button', { name: /Load more songs/ }));
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(6));
    rerender(
      <LibraryView
        result={result(second.slice(0, 1), 1)}
        facets={facets}
        searchMore={searchMore}
        loadSong={loadSong}
        getSignedResourceUrl={getSignedResourceUrl}
      />,
    );
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(screen.getByRole('status')).toHaveTextContent('1 song');
  });

  it('shows the server error with a retry that refreshes the page', async () => {
    const user = userEvent.setup();
    renderView({ result: result([], 0), error: 'Something went wrong while searching.' });
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Couldn’t load songs');
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(url.refresh).toHaveBeenCalled();
  });

  it('empty search offers to clear filters, back to the default view', async () => {
    url.set('/library?q=zzz&energy=high_praise');
    const user = userEvent.setup();
    renderView({ result: result([], 0) });
    expect(screen.getByText('No songs match')).toBeInTheDocument();
    const results = screen.getByRole('region', { name: 'Search results' });
    await user.click(within(results).getByRole('button', { name: 'Clear filters' }));
    expect(url.push).toHaveBeenLastCalledWith('/library', { scroll: false });
  });

  it('offers "did you mean" when the server suggests a spelling', async () => {
    url.set('/library?q=halelujah');
    const user = userEvent.setup();
    renderView({ result: result([], 0, { didYouMean: 'hallelujah' }) });
    const hint = screen.getByTestId('did-you-mean');
    expect(hint).toHaveTextContent('Did you mean hallelujah?');
    await user.click(within(hint).getByRole('button', { name: 'hallelujah' }));
    expect(url.push).toHaveBeenLastCalledWith('/library?q=hallelujah', { scroll: false });
  });

  it('shows the facets error and keeps searching usable', () => {
    renderView({ facets: null, facetsError: 'Filters are unavailable right now.' });
    expect(screen.getByRole('alert')).toHaveTextContent('Filters are unavailable right now.');
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });

  it('renders the ADD slot for each row', () => {
    renderView({ rowAddSlot: (s) => <button type="button">Add {s.title}</button> });
    for (const s of first) {
      expect(within(rowFor(s.title)).getByRole('button', { name: `Add ${s.title}` })).toBeVisible();
    }
  });

  it('opens a row panel and fetches the song once, then reuses it', async () => {
    const user = userEvent.setup();
    renderView();
    const song = first[0]!;
    await user.click(
      within(rowFor(song.title)).getByRole('button', { name: /show all composers/ }),
    );
    const panel = await screen.findByRole('dialog', { name: 'Composers' });
    await waitFor(() => expect(within(panel).queryByLabelText(/Loading/)).not.toBeInTheDocument());
    expect(loadSong).toHaveBeenCalledWith(song.id);

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await user.click(within(rowFor(song.title)).getByRole('button', { name: /show first lines/ }));
    expect(await screen.findByRole('dialog', { name: 'First lines' })).toBeInTheDocument();
    expect(loadSong).toHaveBeenCalledTimes(1);
  });

  it('opens each region’s panel with its title', async () => {
    const user = userEvent.setup();
    renderView();
    const row = () => rowFor(first[0]!.title);
    const cases: Array<[RegExp, string]> = [
      [/show all keys/, 'Keys and first chords'],
      [/show branch usage/, 'Branch usage'],
      [/show resources/, 'Resources'],
    ];
    for (const [region, title] of cases) {
      await user.click(within(row()).getByRole('button', { name: region }));
      expect(await screen.findByRole('dialog', { name: title })).toBeInTheDocument();
      await user.keyboard('{Escape}');
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    }
  });

  it('shows a failed song load with a retry', async () => {
    loadSong.mockResolvedValueOnce({
      ok: false,
      error: { code: 'NOT_FOUND', message: 'This song is no longer in the library.' },
    });
    const user = userEvent.setup();
    renderView();
    const song = first[0]!;
    await user.click(within(rowFor(song.title)).getByRole('button', { name: /show all keys/ }));
    const panel = await screen.findByRole('dialog', { name: 'Keys and first chords' });
    const alert = await within(panel).findByRole('alert');
    expect(alert).toHaveTextContent('This song is no longer in the library.');
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(within(panel).queryByRole('alert')).not.toBeInTheDocument());
    expect(loadSong).toHaveBeenCalledTimes(2);
  });

  it('opens a chord chart PDF from Resources in the viewer', async () => {
    const detail = getSong(SONG_IDS.thousandHallelujahs);
    const summary = songSummaries.find((s) => s.id === detail.id)!;
    const chart = detail.resources.find((r) => r.kind === 'chord_chart' && r.format === 'pdf')!;
    const user = userEvent.setup();
    renderView({ result: result([summary], 1) });

    await user.click(within(rowFor(summary.title)).getByRole('button', { name: /show resources/ }));
    const panel = await screen.findByRole('dialog', { name: 'Resources' });
    const buttons = await within(panel).findAllByRole('button', {
      name: new RegExp(`^${chart.label},`),
    });
    await user.click(buttons[0]!);

    expect(getSignedResourceUrl).toHaveBeenCalledWith(chart.id);
    const viewer = await screen.findByRole('dialog', { name: `${summary.title} · ${chart.label}` });
    expect(viewer).toHaveAttribute('data-url', 'https://files.test/signed.pdf');
    // The row panel closes so the viewer has the screen.
    expect(screen.queryByRole('dialog', { name: 'Resources' })).not.toBeInTheDocument();

    await user.click(within(viewer).getByRole('button', { name: 'Close viewer' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows lyrics from the Resources panel and goes back to the files', async () => {
    const detail = getSong(SONG_IDS.thousandHallelujahs);
    const summary = songSummaries.find((s) => s.id === detail.id)!;
    const user = userEvent.setup();
    renderView({ result: result([summary], 1) });
    await user.click(within(rowFor(summary.title)).getByRole('button', { name: /show resources/ }));
    const panel = await screen.findByRole('dialog', { name: 'Resources' });
    await user.click(await within(panel).findByRole('button', { name: 'Show lyrics' }));
    const back = within(panel).getByRole('button', { name: 'Back to files' });
    await user.click(back);
    expect(within(panel).getByRole('button', { name: 'Show lyrics' })).toBeInTheDocument();
  });
});
