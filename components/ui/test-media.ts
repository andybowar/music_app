import { vi } from 'vitest';

type Listener = (e: MediaQueryListEvent) => void;

/**
 * Test helper: install a controllable `window.matchMedia` that evaluates `min-width` / `max-width`
 * queries against a fake viewport width. Returns `setWidth` to simulate a resize.
 */
export function mockViewport(initialWidth: number) {
  let width = initialWidth;
  const lists = new Map<string, { listeners: Set<Listener>; last: boolean }>();

  const evaluate = (query: string) => {
    const min = /min-width:\s*(\d+)px/.exec(query);
    const max = /max-width:\s*(\d+)px/.exec(query);
    return (!min || width >= Number(min[1])) && (!max || width <= Number(max[1]));
  };

  const matchMedia = vi.fn((query: string) => {
    let entry = lists.get(query);
    if (!entry) {
      entry = { listeners: new Set(), last: evaluate(query) };
      lists.set(query, entry);
    }
    const listeners = entry.listeners;
    return {
      get matches() {
        return evaluate(query);
      },
      media: query,
      onchange: null,
      addEventListener: (_type: 'change', l: Listener) => listeners.add(l),
      removeEventListener: (_type: 'change', l: Listener) => listeners.delete(l),
      addListener: (l: Listener) => listeners.add(l),
      removeListener: (l: Listener) => listeners.delete(l),
      dispatchEvent: () => true,
    } as unknown as MediaQueryList;
  });

  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: matchMedia,
  });

  return {
    matchMedia,
    setWidth(next: number) {
      width = next;
      for (const [query, entry] of lists) {
        const now = evaluate(query);
        if (now !== entry.last) {
          entry.last = now;
          for (const l of entry.listeners) l({ matches: now, media: query } as MediaQueryListEvent);
        }
      }
    },
  };
}
