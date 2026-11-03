'use client';

import { Suspense, useEffect, useRef, useState } from 'react';

import { samplePdfObjectUrl, sampleToneObjectUrl } from '@/components/media/sampleMedia';
import { Toaster } from '@/components/ui/sonner';
import { LibraryView, type LibraryViewProps } from '@/features/search/ui/LibraryView';
import type { GetSignedResourceUrl, LoadSongDetail } from '@/features/search/ui/RowPanels';
import { branches, getSong, songs, songSummaries } from '@/fixtures';
import {
  SIGNED_URL_TTL_SECONDS,
  type ActionResult,
  type FacetOptions,
  type SearchResult,
  type SongSummary,
} from '@/types/domain';
import { searchParamsSchema } from '@/types/validation';

/** First page size, small enough that the 12 fixture songs need "Load more". */
export const GALLERY_PAGE_SIZE = 8;
const FAKE_LATENCY_MS = 400;
const GENERIC_ERROR = 'Something went wrong. Please try again.';

function sortedUnique<T extends string | number>(values: T[]): T[] {
  return [...new Set(values)].sort((a, b) =>
    String(a).localeCompare(String(b), 'en', { numeric: true }),
  );
}

/** Filter options derived from the fixtures, the way the facets read helper derives them. */
const fixtureFacets: FacetOptions = (() => {
  const primary = songs.flatMap((s) => s.keys.filter((k) => k.isPrimary));
  const chords = (slot: 'chorus' | 'verse' | 'bridge') =>
    sortedUnique(primary.map((k) => k.firstChords[slot]).filter((c): c is string => !!c));
  return {
    keys: sortedUnique(songs.flatMap((s) => s.keys.map((k) => k.key))),
    decades: sortedUnique(
      songs
        .map((s) => s.year)
        .filter((y): y is number => y !== null)
        .map((y) => y - (y % 10)),
    ),
    chords: { chorus: chords('chorus'), verse: chords('verse'), bridge: chords('bridge') },
    branches,
  };
})();

function page(items: SongSummary[], n: number, total = items.length): SearchResult {
  const start = (n - 1) * GALLERY_PAGE_SIZE;
  return {
    items: items.slice(start, start + GALLERY_PAGE_SIZE),
    total,
    page: n,
    pageSize: GALLERY_PAGE_SIZE,
  };
}

const empty: SearchResult = { items: [], total: 0, page: 1, pageSize: GALLERY_PAGE_SIZE };

type Base = Pick<LibraryViewProps, 'result' | 'facets' | 'facetsError' | 'error'>;

export const LIBRARY_STATES = {
  default: {
    label: 'Default (12 fixture songs, 8 per page)',
    props: { result: page(songSummaries, 1), facets: fixtureFacets },
  },
  empty: {
    label: 'No results',
    props: { result: empty, facets: fixtureFacets },
  },
  'server-error': {
    label: 'Search failed',
    props: { result: empty, facets: fixtureFacets, error: GENERIC_ERROR },
  },
  'facets-error': {
    label: 'Filters failed to load',
    props: {
      result: page(songSummaries, 1),
      facets: null,
      facetsError: 'Filters are unavailable right now.',
    },
  },
  'did-you-mean': {
    label: 'No results, with “did you mean”',
    props: { result: { ...empty, didYouMean: 'redemption' }, facets: fixtureFacets },
  },
} satisfies Record<string, { label: string; props: Base }>;

export type LibraryState = keyof typeof LIBRARY_STATES;

function wait() {
  return new Promise((resolve) => setTimeout(resolve, FAKE_LATENCY_MS));
}

const failure = <T,>(message = GENERIC_ERROR): ActionResult<T> => ({
  ok: false,
  error: { code: 'INTERNAL', message },
});

/**
 * Body of `/dev/library`: the Worship Library (SRCH-09) with fixture results and fake
 * `searchMore` / `loadSong` / `getSignedResourceUrl`. Signed URLs are generated sample media (a
 * PDF and a tone), so opening files works without storage. Searching and filtering update this
 * page's URL like the real library, but the results stay the fixtures of the chosen state.
 */
export function LibraryGallery() {
  const [state, setState] = useState<LibraryState>('default');
  const [failMore, setFailMore] = useState(false);
  const [failSong, setFailSong] = useState(false);
  const [failSigning, setFailSigning] = useState(false);
  const [canEdit, setCanEdit] = useState(true);
  const media = useRef<{ pdf: string; tone: string } | null>(null);

  useEffect(() => {
    const pdf = samplePdfObjectUrl(2);
    const tone = sampleToneObjectUrl(4);
    media.current = { pdf, tone };
    return () => {
      URL.revokeObjectURL(pdf);
      URL.revokeObjectURL(tone);
      media.current = null;
    };
  }, []);

  const searchMore = async (query: string): Promise<ActionResult<SearchResult>> => {
    await wait();
    if (failMore) return failure();
    const n = searchParamsSchema.parse(query).page ?? 1;
    return { ok: true, data: page(songSummaries, n) };
  };

  const loadSong: LoadSongDetail = async (id) => {
    await wait();
    if (failSong) return failure();
    const song = songs.find((s) => s.id === id);
    if (!song) {
      return { ok: false, error: { code: 'NOT_FOUND', message: 'Song not found.' } };
    }
    return { ok: true, data: getSong(id) };
  };

  const getSignedResourceUrl: GetSignedResourceUrl = async (id) => {
    await wait();
    const resource = songs.flatMap((s) => s.resources).find((r) => r.id === id);
    if (failSigning || !resource || !media.current) {
      return { ok: false, error: { code: 'NOT_FOUND', message: 'File not found.' } };
    }
    const url = resource.format === 'pdf' ? media.current.pdf : media.current.tone;
    const expiresAt = new Date(Date.now() + SIGNED_URL_TTL_SECONDS * 1000).toISOString();
    return { ok: true, data: { url, expiresAt } };
  };

  const toggles: Array<[string, boolean, (v: boolean) => void]> = [
    ['“Load more” fails', failMore, setFailMore],
    ['Loading a song fails', failSong, setFailSong],
    ['Opening a file fails', failSigning, setFailSigning],
    ['Contributor (Add song, Edit song)', canEdit, setCanEdit],
  ];

  return (
    <div className="flex flex-col gap-2">
      <header className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 pt-4">
        <p className="text-sm font-medium text-muted-foreground">
          SRCH-09 · Worship Library with fixture results and fake actions
        </p>
        <div className="flex flex-wrap items-end gap-4 text-sm">
          <label className="flex flex-col gap-1">
            State
            <select
              className="min-h-tap rounded-md border bg-background px-2"
              value={state}
              onChange={(e) => setState(e.target.value as LibraryState)}
            >
              {Object.entries(LIBRARY_STATES).map(([id, s]) => (
                <option key={id} value={id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          {toggles.map(([label, checked, set]) => (
            <label key={label} className="flex min-h-tap items-center gap-2">
              <input type="checkbox" checked={checked} onChange={(e) => set(e.target.checked)} />
              {label}
            </label>
          ))}
        </div>
      </header>
      {/* useSearchState reads the URL (useSearchParams), which needs a Suspense boundary. */}
      <Suspense fallback={null}>
        <LibraryView
          key={state}
          {...LIBRARY_STATES[state].props}
          searchMore={searchMore}
          loadSong={loadSong}
          getSignedResourceUrl={getSignedResourceUrl}
          canAddSong={canEdit}
          canEditSongs={canEdit}
        />
      </Suspense>
      <Toaster />
    </div>
  );
}
