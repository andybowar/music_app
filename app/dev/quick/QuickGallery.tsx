'use client';

import { useState } from 'react';

import { QuickLookup, type QuickLookupProps } from '@/app/(app)/quick/QuickLookup';
import { QUICK_FULL, QUICK_TOP } from '@/app/(app)/quick/quickQuery';
import { songSummaries } from '@/fixtures';
import type { SearchResult, SongSummary } from '@/types/domain';

/** `n` distinct rows made by cycling the fixture songs with unique ids. */
function many(n: number): SongSummary[] {
  return Array.from({ length: n }, (_, i) => {
    const base = songSummaries[i % songSummaries.length]!;
    return { ...base, id: `${base.id}-${i}`, title: `${base.title} (${i + 1})` };
  });
}

function result(items: SongSummary[], total = items.length, didYouMean?: string): SearchResult {
  return { items, total, page: 1, pageSize: items.length, ...(didYouMean ? { didYouMean } : {}) };
}

/** Every state of the lookup, as the server page would pass it. */
export const QUICK_STATES = {
  'no-text': {
    label: 'No text yet',
    props: { query: { q: '', full: false }, result: null, failed: false },
  },
  top: {
    label: 'Top 12 of more',
    props: {
      query: { q: 'grace', full: false },
      result: result(many(QUICK_TOP), 37),
      failed: false,
    },
  },
  full: {
    label: 'Show full (all 37)',
    props: { query: { q: 'grace', full: true }, result: result(many(37)), failed: false },
  },
  'over-100': {
    label: 'Show full, more than 100',
    props: {
      query: { q: 'glory', full: true },
      result: result(many(QUICK_FULL), 140),
      failed: false,
    },
  },
  few: {
    label: 'A few matches',
    props: { query: { q: 'cross', full: false }, result: result(many(3)), failed: false },
  },
  'did-you-mean': {
    label: 'No matches, with “did you mean”',
    props: { query: { q: 'grase', full: false }, result: result([], 0, 'grace'), failed: false },
  },
  'no-matches': {
    label: 'No matches',
    props: { query: { q: 'zzz', full: false }, result: result([], 0), failed: false },
  },
  failed: {
    label: 'Search failed',
    props: { query: { q: 'grace', full: false }, result: null, failed: true },
  },
} satisfies Record<string, { label: string; props: QuickLookupProps }>;

export type QuickState = keyof typeof QUICK_STATES;

/**
 * Body of `/dev/quick`: the quick theme lookup (BR-04) with fixture results in each state.
 * Typing, "Show full" and "did you mean" call `router.replace` like the real page, so they go to
 * `/quick` (which needs sign-in). Pick a state here instead.
 */
export function QuickGallery() {
  const [state, setState] = useState<QuickState>('top');

  return (
    <div className="flex flex-col gap-2">
      <header className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-3 pt-4 sm:px-4">
        <p className="text-sm font-medium text-muted-foreground">
          BR-04 · Quick theme lookup with fixture results. Typing goes to the real /quick page.
        </p>
        <label className="flex w-fit flex-col gap-1 text-sm">
          State
          <select
            className="min-h-tap rounded-md border bg-background px-2"
            value={state}
            onChange={(e) => setState(e.target.value as QuickState)}
          >
            {Object.entries(QUICK_STATES).map(([id, s]) => (
              <option key={id} value={id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </header>
      <QuickLookup key={state} {...QUICK_STATES[state].props} />
    </div>
  );
}
