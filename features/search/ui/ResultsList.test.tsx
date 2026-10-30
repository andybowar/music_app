import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { songSummaries } from '@/fixtures';
import type { SearchResult, SongSummary } from '@/types/domain';

import { formatSongCount, hasMoreResults, ResultsList } from './ResultsList';

/** Minimal IntersectionObserver stand-in: tests trigger intersections by hand. */
class FakeObserver {
  static instances: FakeObserver[] = [];
  disconnected = false;
  constructor(public callback: IntersectionObserverCallback) {
    FakeObserver.instances.push(this);
  }
  observe() {}
  disconnect() {
    this.disconnected = true;
  }
  fire(isIntersecting: boolean) {
    this.callback(
      [{ isIntersecting } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }
  static live() {
    return FakeObserver.instances.filter((o) => !o.disconnected);
  }
}

beforeEach(() => {
  FakeObserver.instances = [];
  vi.stubGlobal('IntersectionObserver', FakeObserver);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function result(items: SongSummary[], total = items.length): SearchResult {
  return { items, total, page: 1, pageSize: 50 };
}

const renderRow = (s: SongSummary) => <div data-testid="row">{s.title}</div>;
const eight = songSummaries.slice(0, 8);

describe('formatSongCount', () => {
  it('pluralises and groups digits', () => {
    expect(formatSongCount(0)).toBe('0 songs');
    expect(formatSongCount(1)).toBe('1 song');
    expect(formatSongCount(8)).toBe('8 songs');
    expect(formatSongCount(1000)).toMatch(/^1.000 songs$/);
  });
});

describe('hasMoreResults', () => {
  it('compares loaded rows with the total', () => {
    expect(hasMoreResults(result(eight))).toBe(false);
    expect(hasMoreResults(result(eight, 20))).toBe(true);
  });
});

describe('ResultsList', () => {
  it('renders the count header and one row per song', () => {
    render(
      <ResultsList
        result={result(eight)}
        renderRow={renderRow}
        onLoadMore={vi.fn()}
        loading={false}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('8 songs');
    const list = screen.getByRole('list', { name: 'Songs' });
    expect(within(list).getAllByTestId('row')).toHaveLength(8);
    expect(screen.queryByRole('button', { name: /Load more/ })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Search results' })).toHaveAttribute(
      'aria-busy',
      'false',
    );
  });

  it('shows skeletons while the first page loads', () => {
    render(
      <ResultsList result={result([], 0)} renderRow={renderRow} onLoadMore={vi.fn()} loading />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Searching…');
    expect(screen.getByTestId('results-skeleton')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Songs' })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Search results' })).toHaveAttribute(
      'aria-busy',
      'true',
    );
  });

  it('shows the empty state with a clear-filters action', async () => {
    const onClearFilters = vi.fn();
    render(
      <ResultsList
        result={result([], 0)}
        renderRow={renderRow}
        onLoadMore={vi.fn()}
        loading={false}
        onClearFilters={onClearFilters}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('0 songs');
    expect(screen.getByText('No songs match')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(onClearFilters).toHaveBeenCalledOnce();
  });

  it('hides clear filters when no handler is given', () => {
    render(
      <ResultsList
        result={result([], 0)}
        renderRow={renderRow}
        onLoadMore={vi.fn()}
        loading={false}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument();
  });

  it('shows a first-page error with retry', async () => {
    const onRetry = vi.fn();
    render(
      <ResultsList
        result={result([], 0)}
        renderRow={renderRow}
        onLoadMore={vi.fn()}
        loading={false}
        error="Network error"
        onRetry={onRetry}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Search failed');
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Couldn’t load songs');
    expect(alert).toHaveTextContent('Network error');
    await userEvent.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('has no retry button for a first-page error without onRetry', () => {
    render(
      <ResultsList
        result={result([], 0)}
        renderRow={renderRow}
        onLoadMore={vi.fn()}
        loading={false}
        error="Down"
      />,
    );
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });

  it('keeps loaded rows on a later-page error and retries with onLoadMore', async () => {
    const onLoadMore = vi.fn();
    render(
      <ResultsList
        result={result(eight, 20)}
        renderRow={renderRow}
        onLoadMore={onLoadMore}
        loading={false}
        error="Timed out"
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('20 songs');
    expect(screen.getAllByTestId('row')).toHaveLength(8);
    expect(screen.getByRole('alert')).toHaveTextContent('Couldn’t load more songs');
    expect(screen.queryByRole('button', { name: /Load more/ })).not.toBeInTheDocument();
    expect(FakeObserver.live()).toHaveLength(0);
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onLoadMore).toHaveBeenCalledOnce();
  });

  it('loads more from the button (keyboard path)', async () => {
    const onLoadMore = vi.fn();
    render(
      <ResultsList
        result={result(eight, 20)}
        renderRow={renderRow}
        onLoadMore={onLoadMore}
        loading={false}
      />,
    );
    const button = screen.getByRole('button', { name: /Load more songs, 8 of 20 shown/ });
    button.focus();
    await userEvent.keyboard('{Enter}');
    expect(onLoadMore).toHaveBeenCalledOnce();
  });

  it('loads more once when the sentinel intersects', () => {
    const onLoadMore = vi.fn();
    render(
      <ResultsList
        result={result(eight, 20)}
        renderRow={renderRow}
        onLoadMore={onLoadMore}
        loading={false}
      />,
    );
    const [observer] = FakeObserver.live();
    act(() => observer!.fire(false));
    expect(onLoadMore).not.toHaveBeenCalled();
    act(() => {
      observer!.fire(true);
      observer!.fire(true);
    });
    expect(onLoadMore).toHaveBeenCalledOnce();
  });

  it('pauses the sentinel while loading and shows trailing skeletons', () => {
    const onLoadMore = vi.fn();
    const { rerender } = render(
      <ResultsList
        result={result(eight, 20)}
        renderRow={renderRow}
        onLoadMore={onLoadMore}
        loading
      />,
    );
    expect(FakeObserver.live()).toHaveLength(0);
    expect(screen.getAllByTestId('row')).toHaveLength(8);
    expect(screen.getByTestId('results-skeleton')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Load more/ })).not.toBeInTheDocument();

    rerender(
      <ResultsList
        result={result(songSummaries.slice(0, 10), 20)}
        renderRow={renderRow}
        onLoadMore={onLoadMore}
        loading={false}
      />,
    );
    expect(FakeObserver.live()).toHaveLength(1);
    expect(screen.queryByTestId('results-skeleton')).not.toBeInTheDocument();
  });

  it('stops observing once every result is loaded', () => {
    render(
      <ResultsList
        result={result(eight)}
        renderRow={renderRow}
        onLoadMore={vi.fn()}
        loading={false}
      />,
    );
    expect(FakeObserver.live()).toHaveLength(0);
  });

  it('calls the latest onLoadMore', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(
      <ResultsList
        result={result(eight, 20)}
        renderRow={renderRow}
        onLoadMore={first}
        loading={false}
      />,
    );
    rerender(
      <ResultsList
        result={result(eight, 20)}
        renderRow={renderRow}
        onLoadMore={second}
        loading={false}
      />,
    );
    act(() => FakeObserver.live()[0]!.fire(true));
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
  });

  it('works without IntersectionObserver', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    render(
      <ResultsList
        result={result(eight, 20)}
        renderRow={renderRow}
        onLoadMore={vi.fn()}
        loading={false}
      />,
    );
    expect(screen.getByRole('button', { name: /Load more/ })).toBeInTheDocument();
  });

  it('renders 1,000 rows', () => {
    const many = Array.from({ length: 1000 }, (_, i) => ({
      ...songSummaries[i % songSummaries.length]!,
      id: `song-${i}`,
    }));
    render(
      <ResultsList
        result={result(many)}
        renderRow={renderRow}
        onLoadMore={vi.fn()}
        loading={false}
      />,
    );
    expect(screen.getAllByTestId('row')).toHaveLength(1000);
    expect(screen.getByRole('status')).toHaveTextContent(/^1.000 songs$/);
  });
});
