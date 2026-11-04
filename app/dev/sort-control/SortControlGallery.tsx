'use client';

import { useState } from 'react';

import { SortControl, type SortDir } from '@/features/search/ui/SortControl';
import type { Sort } from '@/types/domain';

interface Case {
  id: string;
  title: string;
  hasQuery: boolean;
  sort?: Sort;
  dir?: SortDir;
}

const CASES: Case[] = [
  { id: 'unset', title: 'No query, no sort (shows Date added)', hasQuery: false },
  { id: 'relevance', title: 'Query, no sort (Relevance; direction disabled)', hasQuery: true },
  { id: 'alpha', title: 'A–Z ascending', hasQuery: false, sort: 'alpha', dir: 'asc' },
  { id: 'date', title: 'Date added, newest first', hasQuery: true, sort: 'date', dir: 'desc' },
];

const show = (v: string | undefined) => (v === undefined ? 'undefined' : v);

/**
 * Body of `/dev/sort-control`: SRCH-07's SortControl in four starting states inside a
 * 360px-wide frame. Each control is controlled locally and shows its last `onChange` call.
 */
export function SortControlGallery() {
  return (
    <main className="mx-auto max-w-2xl space-y-6 p-4">
      <h1 className="text-lg font-semibold">SortControl</h1>
      <p className="text-sm text-muted-foreground">
        SRCH-07 · sort selector with a direction toggle. “Relevance” is offered only when there is a
        query.
      </p>
      {CASES.map((c) => (
        <SortCase key={c.id} {...c} />
      ))}
    </main>
  );
}

function SortCase({ id, title, hasQuery, sort: initialSort, dir: initialDir }: Case) {
  const [state, setState] = useState<{ sort?: Sort; dir?: SortDir }>({
    sort: initialSort,
    dir: initialDir,
  });
  const [last, setLast] = useState<string | null>(null);

  return (
    <section aria-labelledby={`case-${id}`} className="space-y-2">
      <h2 id={`case-${id}`} className="text-sm font-medium">
        {title}
      </h2>
      <div className="w-full max-w-[360px] rounded-md border p-3">
        <SortControl
          sort={state.sort}
          dir={state.dir}
          hasQuery={hasQuery}
          onChange={(sort, dir) => {
            setState({ sort, dir });
            setLast(`onChange(${show(sort)}, ${show(dir)})`);
          }}
        />
      </div>
      <p className="text-xs text-muted-foreground" data-testid={`last-${id}`}>
        {last ?? 'No changes yet.'}
      </p>
    </section>
  );
}
