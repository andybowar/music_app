'use client';

import { Suspense, useState, type ReactNode } from 'react';

import { branches, songs } from '@/fixtures';
import { FilterBar } from '@/features/search/ui/FilterBar';
import { useSearchState } from '@/features/search/ui/useSearchState';
import type { FacetOptions, SearchParams } from '@/types/domain';
import { serializeSearchParams } from '@/types/validation';

function sortedUnique<T extends string | number>(values: T[]): T[] {
  return [...new Set(values)].sort((a, b) =>
    String(a).localeCompare(String(b), 'en', { numeric: true }),
  );
}

/** Facets derived from the fixtures the way the facets read helper will derive them from the DB. */
export const fixtureFacets: FacetOptions = (() => {
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

const emptyFacets: FacetOptions = {
  keys: [],
  decades: [],
  chords: { chorus: [], verse: [], bridge: [] },
  branches: [],
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

/** Local-state demo that echoes the params below the bar. */
function Demo({
  initial = {},
  facets = fixtureFacets,
  loading,
  error,
}: {
  initial?: SearchParams;
  facets?: FacetOptions;
  loading?: boolean;
  error?: string;
}) {
  const [params, setParams] = useState<SearchParams>(initial);
  return (
    <div className="space-y-2">
      <FilterBar
        params={params}
        facets={facets}
        onChange={setParams}
        loading={loading}
        error={error}
      />
      <p className="text-xs break-all text-muted-foreground" data-testid="demo-state">
        ?{serializeSearchParams(params)}
      </p>
    </div>
  );
}

/** Wired to the URL through `useSearchState`, the way the library page will use it. */
function UrlDemo() {
  const { params, setParams, clear } = useSearchState();
  return (
    <div className="space-y-2">
      <FilterBar params={params} facets={fixtureFacets} onChange={(p) => setParams(p)} />
      <p className="text-xs break-all text-muted-foreground">
        URL: ?{serializeSearchParams(params)}{' '}
        <button type="button" className="underline" onClick={clear}>
          Reset
        </button>
      </p>
    </div>
  );
}

export function FilterBarGallery() {
  return (
    <main className="mx-auto max-w-3xl space-y-8 p-4">
      <h1 className="text-2xl font-semibold">FilterBar</h1>
      <p className="text-sm text-muted-foreground">
        Dropdowns at 768px and wider; one &ldquo;Filters&rdquo; sheet below. Resize the window to
        switch.
      </p>
      <Section title="No filters">
        <Demo />
      </Section>
      <Section title="Several filters combined">
        <Demo
          initial={{
            energy: ['high_praise', 'mid_worship'],
            key: ['D'],
            decade: [2010],
            branch: 'OR',
            usage: ['high'],
            chordChorus: ['G'],
          }}
        />
      </Section>
      <Section title="Wired to the URL">
        <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
          <UrlDemo />
        </Suspense>
      </Section>
      <Section title="Loading facets">
        <Demo loading initial={{ key: ['E'] }} />
      </Section>
      <Section title="Facets failed to load">
        <Demo error="Try again in a moment." initial={{ decade: [1990] }} />
      </Section>
      <Section title="Empty facets (no songs yet)">
        <Demo facets={emptyFacets} />
      </Section>
      <Section title="360px wide">
        <div className="w-[360px] max-w-full rounded-md border p-2">
          <Demo initial={{ energy: ['quiet_worship'], key: ['Eb', 'F'], decade: [1980, 2020] }} />
        </div>
      </Section>
    </main>
  );
}
