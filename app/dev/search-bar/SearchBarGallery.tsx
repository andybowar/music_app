'use client';

import { Suspense, useState, type ReactNode } from 'react';

import { SearchBar } from '@/features/search/ui/SearchBar';
import { useSearchState } from '@/features/search/ui/useSearchState';
import { SEARCH_FIELDS, type SearchField } from '@/types/domain';
import { serializeSearchParams } from '@/types/validation';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

/** Local-state demo that echoes every callback below the bar. */
function Demo({
  value = '',
  fields = [...SEARCH_FIELDS],
}: {
  value?: string;
  fields?: SearchField[];
}) {
  const [state, setState] = useState({ q: value, fields });
  const [submits, setSubmits] = useState(0);
  return (
    <div className="space-y-2">
      <SearchBar
        value={state.q}
        fields={state.fields}
        onChange={(q, f) => setState({ q, fields: f })}
        onSubmit={() => setSubmits((n) => n + 1)}
      />
      <p className="text-xs break-all text-muted-foreground" data-testid="demo-state">
        q: “{state.q}” · fields: {state.fields.join(', ')} · submits: {submits}
      </p>
    </div>
  );
}

/** Wired to the URL through `useSearchState`, the way the library page will use it. */
function UrlDemo() {
  const { params, setParams, newSearch, clear } = useSearchState();
  const current = params.fields ?? [...SEARCH_FIELDS];
  return (
    <div className="space-y-2">
      <SearchBar
        value={params.q ?? ''}
        fields={current}
        onChange={(q, fields) =>
          setParams({ q: q || undefined, fields }, { typing: fields.join() === current.join() })
        }
        onSubmit={newSearch}
      />
      <p className="text-xs break-all text-muted-foreground">
        URL: ?{serializeSearchParams(params)}{' '}
        <button type="button" className="underline" onClick={clear}>
          Reset
        </button>
      </p>
    </div>
  );
}

export function SearchBarGallery() {
  return (
    <main className="mx-auto max-w-2xl space-y-8 p-4">
      <h1 className="text-2xl font-semibold">SearchBar</h1>
      <p className="text-sm text-muted-foreground">
        Enter submits, Esc clears. At least one field stays selected.
      </p>
      <Section title="Empty (default: all fields)">
        <Demo />
      </Section>
      <Section title="With text">
        <Demo value="Amazing grace" />
      </Section>
      <Section title="Single field (can't be turned off)">
        <Demo value="love" fields={['lyrics']} />
      </Section>
      <Section title="Wired to the URL (debounced)">
        <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
          <UrlDemo />
        </Suspense>
      </Section>
      <Section title="360px wide">
        <div className="w-[360px] max-w-full rounded-md border p-2">
          <Demo value="A long query that keeps going past the edge" />
        </div>
      </Section>
    </main>
  );
}
