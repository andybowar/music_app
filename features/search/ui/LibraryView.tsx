'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, useTransition, type ReactNode } from 'react';

import { PdfViewer } from '@/components/media/PdfViewer';
import { SongRow } from '@/components/song/SongRow';
import { cn } from '@/components/ui/utils';
import { AddToListAction } from '@/features/lists/ui/AddToListAction';
import {
  SEARCH_FIELDS,
  type ActionResult,
  type FacetOptions,
  type SearchParams,
  type SearchResult,
  type SongSummary,
} from '@/types/domain';
import { serializeSearchParams } from '@/types/validation';

import { FilterBar } from './FilterBar';
import { ResultsList } from './ResultsList';
import {
  RowPanelBody,
  RowWithPanel,
  useResourceOpener,
  useSongDetailCache,
  type GetSignedResourceUrl,
  type LoadSongDetail,
  type OpenRowPanel,
  type RowPanelKind,
} from './RowPanels';
import { SearchBar } from './SearchBar';
import { SortControl } from './SortControl';
import { useSearchState } from './useSearchState';

/** Facet options used when the real ones failed to load: no dropdown values. */
const NO_FACETS: FacetOptions = {
  keys: [],
  decades: [],
  chords: { chorus: [], verse: [], bridge: [] },
  branches: [],
};

const GENERIC_ERROR = 'Something went wrong. Please try again.';

export interface LibraryViewProps {
  /** Results for the URL's search, read on the server. */
  result: SearchResult;
  /** Filter options; `null` when they couldn't be loaded (`facetsError` says why). */
  facets: FacetOptions | null;
  facetsError?: string | null;
  /** The server search failed: shown in place of the results, with "Try again". */
  error?: string | null;
  /**
   * Fetches another page for the current search. Takes the canonical query string
   * (`serializeSearchParams`) including `page`.
   */
  searchMore(query: string): Promise<ActionResult<SearchResult>>;
  /** Lazily loads a song's detail for the row panels. */
  loadSong: LoadSongDetail;
  /** `getSignedResourceUrl` (contracts/api.md), for opening uploaded files. */
  getSignedResourceUrl: GetSignedResourceUrl;
  /**
   * Renders the ADD region of each row. Defaults to `AddToListAction` (LIST-09), which renders
   * nothing outside the app shell's list providers.
   */
  rowAddSlot?(song: SongSummary): ReactNode;
}

interface Loaded {
  /** The server result these pages extend; a new one (new search) resets the list. */
  base: SearchResult;
  items: SongSummary[];
  total: number;
  page: number;
}

function fromBase(base: SearchResult): Loaded {
  return { base, items: base.items, total: base.total, page: base.page };
}

/** Appends a page, skipping songs already shown (rows can shift between page reads). */
export function appendPage(items: SongSummary[], next: SongSummary[]): SongSummary[] {
  const seen = new Set(items.map((s) => s.id));
  return [...items, ...next.filter((s) => !seen.has(s.id))];
}

/** Whether any filter, query or sort is set (the "Clear filters" button applies). */
export function hasActiveSearch(params: SearchParams): boolean {
  return serializeSearchParams({ ...params, page: undefined }) !== '';
}

function defaultRowAddSlot(song: SongSummary): ReactNode {
  return <AddToListAction songId={song.id} songTitle={song.title} />;
}

/**
 * Worship Library (SRCH-09; REQ-NAV-02, REQ-SRCH-01, REQ-ROW-02): search box, filters, sort and
 * results. The search lives in the URL (`useSearchState`), so the server renders each search and
 * Back restores the previous one. Further pages load through `searchMore` and append. Row regions
 * open detail panels whose `SongDetail` is fetched on first open and cached per song.
 */
export function LibraryView({
  result,
  facets,
  facetsError = null,
  error = null,
  searchMore,
  loadSong,
  getSignedResourceUrl,
  rowAddSlot = defaultRowAddSlot,
}: LibraryViewProps) {
  const router = useRouter();
  const search = useSearchState();
  const { params } = search;
  const [isPending, startTransition] = useTransition();

  // ----- Pages -----
  const [loaded, setLoaded] = useState<Loaded>(() => fromBase(result));
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  if (loaded.base !== result) {
    // New search from the server: start over from its first page.
    setLoaded(fromBase(result));
    setLoadingMore(false);
    setMoreError(null);
  }
  const currentBase = useRef(result);
  useEffect(() => {
    currentBase.current = result;
  }, [result]);

  const loadMore = useCallback(async () => {
    if (loadingMore || loaded.items.length >= loaded.total) return;
    const base = loaded.base;
    setLoadingMore(true);
    setMoreError(null);
    let res: ActionResult<SearchResult>;
    try {
      res = await searchMore(serializeSearchParams({ ...params, page: loaded.page + 1 }));
    } catch {
      res = { ok: false, error: { code: 'INTERNAL', message: GENERIC_ERROR } };
    }
    // A new search arrived meanwhile: this page belongs to the old one.
    if (currentBase.current !== base) return;
    setLoadingMore(false);
    if (!res.ok) {
      setMoreError(res.error.message);
      return;
    }
    const data = res.data;
    setLoaded((prev) =>
      prev.base !== base
        ? prev
        : {
            ...prev,
            items: appendPage(prev.items, data.items),
            total: data.total,
            page: data.page,
          },
    );
  }, [loaded, loadingMore, params, searchMore]);

  // ----- Navigation (pushes go through a transition so the list can show it is searching) -----
  const setParams = useCallback(
    (patch: Partial<SearchParams>) => startTransition(() => search.setParams(patch)),
    [search],
  );
  const newSearch = useCallback(() => startTransition(() => search.newSearch()), [search]);
  const clear = useCallback(() => startTransition(() => search.clear()), [search]);
  const retry = useCallback(() => startTransition(() => router.refresh()), [router]);

  // ----- Row panels -----
  const [panel, setPanel] = useState<OpenRowPanel | null>(null);
  const details = useSongDetailCache(loadSong);
  const opener = useResourceOpener(getSignedResourceUrl);

  const openPanel = useCallback(
    (song: SongSummary, kind: RowPanelKind) => {
      details.ensure(song.id);
      setPanel({ songId: song.id, kind });
    },
    [details],
  );

  // A PDF opens over the page: close the panel so focus and the viewer don't fight.
  const { pdf, closePdf } = opener;
  const [prevPdf, setPrevPdf] = useState(pdf);
  if (prevPdf !== pdf) {
    setPrevPdf(pdf);
    if (pdf) setPanel(null);
  }

  const renderRow = (song: SongSummary) => {
    const openKind = panel?.songId === song.id ? panel.kind : null;
    return (
      <RowWithPanel
        openKind={openKind}
        onOpenChange={(open) => {
          if (!open) setPanel((p) => (p?.songId === song.id ? null : p));
        }}
        row={
          <SongRow
            song={song}
            onKey={() => openPanel(song, 'key')}
            onTitle={() => openPanel(song, 'title')}
            onComposer={() => openPanel(song, 'composer')}
            onResources={() => openPanel(song, 'resources')}
            onUsage={() => openPanel(song, 'usage')}
            addSlot={rowAddSlot(song)}
          />
        }
      >
        {openKind ? (
          <RowPanelBody
            kind={openKind}
            summary={song}
            state={details.get(song.id)}
            onRetry={() => details.ensure(song.id)}
            opener={opener}
          />
        ) : null}
      </RowWithPanel>
    );
  };

  // While a new search is on its way, show the first-page skeleton instead of stale rows.
  const shown: SearchResult = isPending
    ? { ...result, items: [], total: 0 }
    : { ...result, items: loaded.items, total: loaded.total, page: loaded.page };

  return (
    <div className="mx-auto flex w-full max-w-5xl min-w-0 flex-col gap-3 px-3 py-4 sm:px-4">
      <h1 className="sr-only">Worship Library</h1>

      <SearchBar
        value={params.q ?? ''}
        fields={params.fields ?? [...SEARCH_FIELDS]}
        onChange={(q, fields) =>
          search.setParams(
            {
              q: q.trim() ? q : undefined,
              fields: fields.length === SEARCH_FIELDS.length ? undefined : fields,
            },
            { typing: true },
          )
        }
        onSubmit={newSearch}
      />

      <div className="flex flex-wrap items-start gap-2">
        <FilterBar
          className="min-w-0 flex-1"
          params={params}
          facets={facets ?? NO_FACETS}
          error={facets ? null : (facetsError ?? 'Filters are unavailable right now.')}
          onChange={setParams}
        />
        <SortControl
          sort={params.sort}
          dir={params.dir}
          hasQuery={Boolean(params.q)}
          onChange={(sort, dir) => setParams({ sort, dir })}
        />
      </div>

      {result.didYouMean && !isPending ? (
        <p className="text-sm" data-testid="did-you-mean">
          Did you mean{' '}
          <button
            type="button"
            className="min-h-tap rounded-sm font-medium underline underline-offset-4 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            onClick={() => setParams({ q: result.didYouMean })}
          >
            {result.didYouMean}
          </button>
          ?
        </p>
      ) : null}

      <ResultsList
        className={cn(isPending && 'opacity-90')}
        result={shown}
        renderRow={renderRow}
        onLoadMore={() => void loadMore()}
        loading={isPending || loadingMore}
        error={isPending ? null : (error ?? moreError)}
        onRetry={error ? retry : () => void loadMore()}
        onClearFilters={hasActiveSearch(params) ? clear : undefined}
      />

      {pdf ? (
        <PdfViewer
          url={pdf.url}
          title={`${pdf.song.title} · ${pdf.resource.label}`}
          onClose={closePdf}
        />
      ) : null}
    </div>
  );
}
