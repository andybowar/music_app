'use client';

import { useCallback, useSyncExternalStore } from 'react';

/** Matches the Tailwind `md` breakpoint: popover at >= 768px, sheet below. */
export const DESKTOP_QUERY = '(min-width: 768px)';

/**
 * Subscribe to a CSS media query. SSR-safe: the server render and the hydration pass both use
 * `serverDefault`, then React re-renders with the real value, so there is no hydration mismatch.
 */
export function useMediaQuery(query: string, serverDefault = false): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window === 'undefined' || !window.matchMedia) return () => {};
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    [query],
  );
  const getSnapshot = () =>
    typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia(query).matches
      : serverDefault;
  const getServerSnapshot = () => serverDefault;
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
