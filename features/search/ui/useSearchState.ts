'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef } from 'react';

import type { SearchParams } from '@/types/domain';
import { searchParamsSchema, serializeSearchParams } from '@/types/validation';

/** Delay before keystroke-level updates (`{ typing: true }`) are written to the URL. */
export const SEARCH_DEBOUNCE_MS = 250;

export interface SetParamsOptions {
  /**
   * Keystroke-level update (free-text box). Debounced by `SEARCH_DEBOUNCE_MS` and written
   * with `router.replace`, so typing doesn't flood history. Default `false`: written now
   * with `router.push`, so back/forward steps through discrete changes.
   */
  typing?: boolean;
}

export interface SearchState {
  /** Current search, parsed from the URL. Same object until the URL's search changes. */
  params: SearchParams;
  /**
   * Merge `patch` into the current params. A key set to `undefined` removes it. Unless the
   * patch sets `page`, any change resets to page 1. No navigation if the result serializes
   * to the current search.
   */
  setParams: (patch: Partial<SearchParams>, options?: SetParamsOptions) => void;
  /** Submit: flush any pending typed text and push, keeping all current params (page → 1). */
  newSearch: () => void;
  /** Reset to the default search (Home semantics, REQ-NAV-03): bare pathname, pushed. */
  clear: () => void;
}

function merge(base: SearchParams, patch: Partial<SearchParams>): SearchParams {
  const next: SearchParams = { ...base };
  for (const key of Object.keys(patch) as (keyof SearchParams)[]) {
    const value = patch[key];
    if (value === undefined) delete next[key];
    else (next as Record<string, unknown>)[key] = value;
  }
  if (!('page' in patch)) delete next.page;
  return next;
}

/** URL-backed search state (REQ-SRCH-05). Stays on the current pathname. */
export function useSearchState(): SearchState {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = searchParams?.toString() ?? '';

  const params = useMemo(() => searchParamsSchema.parse(query), [query]);
  const current = useMemo(() => serializeSearchParams(params), [params]);

  // Debounced typing update not yet written to the URL.
  const pending = useRef<SearchParams | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancel = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    pending.current = null;
  }, []);

  useEffect(() => cancel, [cancel]);

  const navigate = useCallback(
    (next: SearchParams, mode: 'push' | 'replace') => {
      const qs = serializeSearchParams(next);
      if (qs === current) return;
      const href = qs ? `${pathname}?${qs}` : pathname;
      router[mode](href, { scroll: false });
    },
    [current, pathname, router],
  );
  // The debounce timer must see the URL as it is when it fires, not when it was set.
  const latestNavigate = useRef(navigate);
  useEffect(() => {
    latestNavigate.current = navigate;
  }, [navigate]);

  const setParams = useCallback(
    (patch: Partial<SearchParams>, options?: SetParamsOptions) => {
      const next = merge(pending.current ?? params, patch);
      if (options?.typing) {
        pending.current = next;
        if (timer.current !== null) clearTimeout(timer.current);
        timer.current = setTimeout(() => {
          const target = pending.current;
          timer.current = null;
          pending.current = null;
          if (target) latestNavigate.current(target, 'replace');
        }, SEARCH_DEBOUNCE_MS);
        return;
      }
      cancel();
      navigate(next, 'push');
    },
    [cancel, navigate, params],
  );

  const newSearch = useCallback(() => {
    const next = { ...(pending.current ?? params) };
    delete next.page;
    cancel();
    navigate(next, 'push');
  }, [cancel, navigate, params]);

  const clear = useCallback(() => {
    cancel();
    navigate({}, 'push');
  }, [cancel, navigate]);

  return useMemo(
    () => ({ params, setParams, newSearch, clear }),
    [params, setParams, newSearch, clear],
  );
}
