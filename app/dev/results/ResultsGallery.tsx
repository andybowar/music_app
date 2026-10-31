'use client';

import { Plus } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

import { SongRow } from '@/components/song/SongRow';
import { ResultsList } from '@/features/search/ui/ResultsList';
import { songSummaries } from '@/fixtures';
import type { SearchResult, SongSummary } from '@/types/domain';

const PAGE_SIZE = 50;
const FAKE_LATENCY_MS = 400;

/** 1,000 rows made by cycling the fixture songs with unique ids, for the scroll test. */
export const thousandSongs: SongSummary[] = Array.from({ length: 1000 }, (_, i) => {
  const base = songSummaries[i % songSummaries.length]!;
  return { ...base, id: `${base.id}-${i}`, title: `${base.title} (${i + 1})` };
});

function page(items: SongSummary[], total = items.length): SearchResult {
  return { items, total, page: 1, pageSize: PAGE_SIZE };
}

const addButton =
  'inline-flex min-h-tap min-w-tap items-center justify-center rounded-md px-2 text-sm font-semibold outline-none hover:bg-row-foreground/10 focus-visible:ring-2 focus-visible:ring-row-foreground';

function rowRenderer(record: (entry: string) => void) {
  return function renderRow(song: SongSummary) {
    return (
      <SongRow
        song={song}
        onKey={() => record(`onKey() · ${song.title}`)}
        onTitle={() => record(`onTitle() · ${song.title}`)}
        onComposer={() => record(`onComposer() · ${song.title}`)}
        onResources={() => record(`onResources() · ${song.title}`)}
        onUsage={() => record(`onUsage() · ${song.title}`)}
        addSlot={
          <button
            type="button"
            className={addButton}
            aria-label={`Add ${song.title} to a list`}
            onClick={() => record(`ADD · ${song.title}`)}
          >
            <Plus aria-hidden="true" className="size-4 sm:hidden" />
            <span className="hidden sm:inline">ADD</span>
          </button>
        }
      />
    );
  };
}

/** Pages through `source` with a fake delay; `failAt` makes that page fail once. */
function InfiniteDemo({ source, failAt }: { source: SongSummary[]; failAt?: number }) {
  const [count, setCount] = useState(Math.min(PAGE_SIZE, source.length));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const failed = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [log, setLog] = useState<string[]>([]);
  const record = (entry: string) => setLog((prev) => [entry, ...prev].slice(0, 4));
  const renderRow = rowRenderer(record);

  useEffect(() => () => clearTimeout(timer.current), []);

  const loadMore = useCallback(() => {
    setLoading(true);
    setError(null);
    timer.current = setTimeout(() => {
      setLoading(false);
      if (failAt !== undefined && count >= failAt && !failed.current) {
        failed.current = true;
        setError('The server took too long to answer.');
        return;
      }
      setCount((c) => Math.min(c + PAGE_SIZE, source.length));
    }, FAKE_LATENCY_MS);
  }, [count, failAt, source.length]);

  return (
    <div className="space-y-2">
      <div className="max-h-[32rem] overflow-y-auto rounded-md border p-2">
        <ResultsList
          result={page(source.slice(0, count), source.length)}
          renderRow={renderRow}
          onLoadMore={loadMore}
          loading={loading}
          error={error}
        />
      </div>
      <p className="text-xs text-muted-foreground" data-testid="handler-log">
        {log.length ? log.join(' · ') : 'Tap a row region to log its callback.'}
      </p>
    </div>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold">{title}</h2>
      {note && <p className="text-sm text-muted-foreground">{note}</p>}
      {children}
    </section>
  );
}

/** SRCH-08 gallery: ResultsList with fixture songs in every state. */
export function ResultsGallery() {
  const [cleared, setCleared] = useState(0);
  const noop = () => {};
  const renderRow = rowRenderer(noop);

  return (
    <main className="mx-auto max-w-4xl space-y-8 p-4">
      <h1 className="text-2xl font-semibold">ResultsList</h1>

      <Section title="Eight results">
        <ResultsList
          result={page(songSummaries.slice(0, 8))}
          renderRow={renderRow}
          onLoadMore={noop}
          loading={false}
        />
      </Section>

      <Section
        title="1,000 results, infinite scroll"
        note="50 per page with a fake 400ms delay. Scroll the box, or tab to “Load more songs”."
      >
        <InfiniteDemo source={thousandSongs} />
      </Section>

      <Section title="Later page fails" note="The second page fails once; “Try again” recovers.">
        <InfiniteDemo source={thousandSongs.slice(0, 120)} failAt={PAGE_SIZE} />
      </Section>

      <Section title="First page loading">
        <ResultsList result={page([], 0)} renderRow={renderRow} onLoadMore={noop} loading />
      </Section>

      <Section title="No matches">
        <ResultsList
          result={page([], 0)}
          renderRow={renderRow}
          onLoadMore={noop}
          loading={false}
          onClearFilters={() => setCleared((n) => n + 1)}
        />
        <p className="text-xs text-muted-foreground" data-testid="cleared">
          Clear filters pressed {cleared} times
        </p>
      </Section>

      <Section title="Search failed">
        <ResultsList
          result={page([], 0)}
          renderRow={renderRow}
          onLoadMore={noop}
          loading={false}
          error="Couldn’t reach the server. Check your connection."
          onRetry={noop}
        />
      </Section>

      <Section title="360px wide">
        <div className="w-[360px] max-w-full rounded-md border p-2">
          <ResultsList
            result={page(songSummaries.slice(0, 4), 12)}
            renderRow={renderRow}
            onLoadMore={noop}
            loading={false}
          />
        </div>
      </Section>
    </main>
  );
}
