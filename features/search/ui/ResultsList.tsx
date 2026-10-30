'use client';

import { SearchX, TriangleAlert } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/components/ui/utils';
import type { SearchResult, SongSummary } from '@/types/domain';

export interface ResultsListProps {
  result: SearchResult;
  /** Renders one song, normally a `SongRow` with the page's handlers and ADD slot. */
  renderRow(s: SongSummary): ReactNode;
  /** Asks for the next page; called when the sentinel nears the viewport or "Load more" is used. */
  onLoadMore(): void;
  /** A page is being fetched: skeletons replace (first page) or follow (later pages) the rows. */
  loading: boolean;
  /** The last fetch failed. Shown in place of the list, or under the rows already loaded. */
  error?: string | null;
  /** "Try again" in the error state; defaults to `onLoadMore` when rows are already loaded. */
  onRetry?(): void;
  /** "Clear filters" in the empty state; the button is hidden when omitted. */
  onClearFilters?(): void;
  className?: string;
}

/** How far below the viewport the sentinel starts the next fetch. */
const PRELOAD_MARGIN = '600px';
/** Skeleton rows for the first page and for each further page. */
const FIRST_PAGE_SKELETONS = 6;
const NEXT_PAGE_SKELETONS = 3;

const numberFormat = new Intl.NumberFormat();

/** "1 song", "8 songs", "1,000 songs" (digits grouped in the user's locale). */
export function formatSongCount(total: number): string {
  return `${numberFormat.format(total)} ${total === 1 ? 'song' : 'songs'}`;
}

/** Whether more rows exist on the server than are loaded. */
export function hasMoreResults(result: SearchResult): boolean {
  return result.items.length < result.total;
}

function SkeletonRows({ count }: { count: number }) {
  return (
    <ul aria-hidden="true" className="space-y-1.5" data-testid="results-skeleton">
      {Array.from({ length: count }, (_, i) => (
        <li key={i}>
          <Skeleton className="h-14 w-full" />
        </li>
      ))}
    </ul>
  );
}

/**
 * Calls `onLoadMore` when the element nears the viewport. The observer is re-created whenever the
 * inputs change, and a new observer reports its first state at once, so a sentinel still on screen
 * after a page arrives asks for the next one.
 */
function useLoadMoreSentinel(enabled: boolean, onLoadMore: () => void, rowCount: number) {
  const ref = useRef<HTMLDivElement>(null);
  const callback = useRef(onLoadMore);
  useEffect(() => {
    callback.current = onLoadMore;
  }, [onLoadMore]);

  useEffect(() => {
    const node = ref.current;
    if (!enabled || !node || typeof IntersectionObserver === 'undefined') return;
    let fired = false;
    const observer = new IntersectionObserver(
      (entries) => {
        if (fired || !entries.some((e) => e.isIntersecting)) return;
        fired = true;
        callback.current();
      },
      { rootMargin: `0px 0px ${PRELOAD_MARGIN} 0px` },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [enabled, rowCount]);

  return ref;
}

/**
 * Search results (SRCH-08): count header, rows, skeletons, empty and error states, and infinite
 * scroll. Rows off screen skip layout and paint (`content-visibility: auto`), so 1,000+ rows
 * scroll smoothly without a virtualization library. A "Load more" button backs up the sentinel
 * for keyboard users and browsers without IntersectionObserver.
 */
export function ResultsList({
  result,
  renderRow,
  onLoadMore,
  loading,
  error,
  onRetry,
  onClearFilters,
  className,
}: ResultsListProps) {
  const { items, total } = result;
  const hasRows = items.length > 0;
  const hasMore = hasMoreResults(result);
  const sentinelRef = useLoadMoreSentinel(
    hasRows && hasMore && !loading && !error,
    onLoadMore,
    items.length,
  );
  const retry = onRetry ?? (hasRows ? onLoadMore : undefined);

  let header: string;
  if (loading && !hasRows) header = 'Searching…';
  else if (error && !hasRows) header = 'Search failed';
  else header = formatSongCount(total);

  return (
    <section
      aria-label="Search results"
      aria-busy={loading}
      className={cn('flex min-w-0 flex-col gap-2', className)}
    >
      <p role="status" className="text-sm font-medium text-muted-foreground tabular-nums">
        {header}
      </p>

      {error && !hasRows ? (
        <ErrorState message={error} onRetry={retry} />
      ) : !hasRows && loading ? (
        <SkeletonRows count={FIRST_PAGE_SKELETONS} />
      ) : !hasRows ? (
        <EmptyState onClearFilters={onClearFilters} />
      ) : (
        <>
          <ul aria-label="Songs" className="space-y-1.5">
            {items.map((song) => (
              <li
                key={song.id}
                className="[contain-intrinsic-size:auto_3.5rem] [content-visibility:auto]"
              >
                {renderRow(song)}
              </li>
            ))}
          </ul>

          {loading && <SkeletonRows count={NEXT_PAGE_SKELETONS} />}

          {error ? (
            <ErrorState message={error} onRetry={retry} compact />
          ) : (
            hasMore &&
            !loading && (
              <div className="flex justify-center">
                <Button type="button" variant="outline" className="min-h-tap" onClick={onLoadMore}>
                  Load more songs
                  <span className="sr-only">
                    , {numberFormat.format(items.length)} of {numberFormat.format(total)} shown
                  </span>
                </Button>
              </div>
            )
          )}

          <div ref={sentinelRef} aria-hidden="true" data-testid="results-sentinel" />
        </>
      )}
    </section>
  );
}

function EmptyState({ onClearFilters }: { onClearFilters?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-md border border-dashed px-4 py-10 text-center">
      <SearchX aria-hidden="true" className="size-8 text-muted-foreground" />
      <div className="space-y-1">
        <p className="font-medium">No songs match</p>
        <p className="text-sm text-muted-foreground">Try other words or fewer filters.</p>
      </div>
      {onClearFilters && (
        <Button type="button" variant="outline" className="min-h-tap" onClick={onClearFilters}>
          Clear filters
        </Button>
      )}
    </div>
  );
}

function ErrorState({
  message,
  onRetry,
  compact = false,
}: {
  message: string;
  onRetry?: () => void;
  compact?: boolean;
}) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center gap-3 rounded-md border border-destructive/40 px-4 text-center',
        compact ? 'py-4' : 'py-10',
      )}
    >
      <TriangleAlert aria-hidden="true" className="size-6 text-destructive" />
      <div className="space-y-1">
        <p className="font-medium">
          {compact ? 'Couldn’t load more songs' : 'Couldn’t load songs'}
        </p>
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
      {onRetry && (
        <Button type="button" variant="outline" className="min-h-tap" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
