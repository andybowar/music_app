import { act, renderHook } from '@testing-library/react';
import { useSyncExternalStore } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SEARCH_DEBOUNCE_MS, useSearchState } from './useSearchState';

// In-memory URL standing in for the Next.js router.
const url = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  const state = { pathname: '/library', search: '' };
  const set = (href: string) => {
    const [path, search = ''] = href.split('?');
    state.pathname = path ?? '/library';
    state.search = search;
    listeners.forEach((l) => l());
  };
  return {
    state,
    listeners,
    set,
    push: vi.fn((href: string, _opts?: { scroll?: boolean }) => set(href)),
    replace: vi.fn((href: string, _opts?: { scroll?: boolean }) => set(href)),
  };
});

vi.mock('next/navigation', () => {
  const subscribe = (l: () => void) => {
    url.listeners.add(l);
    return () => url.listeners.delete(l);
  };
  const router = { push: url.push, replace: url.replace };
  return {
    useRouter: () => router,
    usePathname: () => useSyncExternalStore(subscribe, () => url.state.pathname),
    useSearchParams: () => {
      const search = useSyncExternalStore(subscribe, () => url.state.search);
      return new URLSearchParams(search);
    },
  };
});

function start(href: string) {
  url.set(href);
  url.push.mockClear();
  url.replace.mockClear();
  return renderHook(() => useSearchState());
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  url.listeners.clear();
});

describe('useSearchState', () => {
  it('parses the URL on mount', () => {
    const { result } = start('/library?q=grace&energy=high_praise,quiet_worship&key=G&sort=alpha');
    expect(result.current.params).toEqual({
      q: 'grace',
      energy: ['high_praise', 'quiet_worship'],
      key: ['G'],
      sort: 'alpha',
    });
  });

  it('drops invalid URL params', () => {
    const { result } = start('/library?energy=loud,high_praise&key=H&page=-2&sort=nope&x=1');
    expect(result.current.params).toEqual({ energy: ['high_praise'] });
  });

  it('defaults to an empty search with no query string', () => {
    const { result } = start('/library');
    expect(result.current.params).toEqual({});
  });

  it('keeps params referentially stable while the URL search is unchanged', () => {
    const { result, rerender } = start('/library?q=grace');
    const first = result.current.params;
    const { setParams } = result.current;
    rerender();
    expect(result.current.params).toBe(first);
    expect(result.current.setParams).toBe(setParams);
  });

  it('setParams merges, pushes a canonical URL and keeps scroll', () => {
    const { result } = start('/library?energy=high_praise');
    act(() => result.current.setParams({ key: ['G', 'D', 'G'] }));
    expect(url.push).toHaveBeenCalledWith('/library?energy=high_praise&key=D,G', {
      scroll: false,
    });
    expect(result.current.params).toEqual({ energy: ['high_praise'], key: ['D', 'G'] });
  });

  it('setParams removes keys set to undefined', () => {
    const { result } = start('/library?q=grace&key=G');
    act(() => result.current.setParams({ key: undefined }));
    expect(url.push).toHaveBeenCalledWith('/library?q=grace', { scroll: false });
  });

  it('setParams resets the page unless the patch sets it', () => {
    const { result } = start('/library?key=G&page=3');
    act(() => result.current.setParams({ energy: ['quiet_worship'] }));
    expect(url.state.search).toBe('energy=quiet_worship&key=G');
    act(() => result.current.setParams({ page: 2 }));
    expect(url.state.search).toBe('energy=quiet_worship&key=G&page=2');
  });

  it('does not navigate when the result serializes to the current search', () => {
    const { result } = start('/library?energy=high_praise&key=G');
    const before = result.current.params;
    act(() => result.current.setParams({ key: ['G'], page: 1, pageSize: 50 }));
    act(() => result.current.newSearch());
    expect(url.push).not.toHaveBeenCalled();
    expect(url.replace).not.toHaveBeenCalled();
    expect(result.current.params).toBe(before);
  });

  it('debounces typing updates and writes them with replace', () => {
    const { result } = start('/library?key=G');
    act(() => result.current.setParams({ q: 'gr' }, { typing: true }));
    act(() => result.current.setParams({ q: 'grace' }, { typing: true }));
    act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS - 1));
    expect(url.replace).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(url.replace).toHaveBeenCalledTimes(1);
    expect(url.replace).toHaveBeenCalledWith('/library?q=grace&key=G', { scroll: false });
    expect(url.push).not.toHaveBeenCalled();
  });

  it('a discrete change merges onto pending typed text and cancels the debounce', () => {
    const { result } = start('/library');
    act(() => result.current.setParams({ q: 'grace' }, { typing: true }));
    act(() => result.current.setParams({ energy: ['deep_worship'] }));
    expect(url.push).toHaveBeenCalledWith('/library?q=grace&energy=deep_worship', {
      scroll: false,
    });
    act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS));
    expect(url.replace).not.toHaveBeenCalled();
  });

  it('newSearch keeps filters, flushes typed text and pushes', () => {
    const { result } = start('/library?energy=high_praise&key=G&branch=SB&page=4');
    act(() => result.current.setParams({ q: 'holy' }, { typing: true }));
    act(() => result.current.newSearch());
    expect(url.push).toHaveBeenCalledTimes(1);
    expect(url.push).toHaveBeenCalledWith('/library?q=holy&energy=high_praise&key=G&branch=SB', {
      scroll: false,
    });
    act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS));
    expect(url.replace).not.toHaveBeenCalled();
    expect(result.current.params).toEqual({
      q: 'holy',
      energy: ['high_praise'],
      key: ['G'],
      branch: 'SB',
    });
  });

  it('clear removes all params and cancels pending typing', () => {
    const { result } = start('/library?q=grace&energy=high_praise&key=G&sort=alpha');
    act(() => result.current.setParams({ q: 'graces' }, { typing: true }));
    act(() => result.current.clear());
    expect(url.push).toHaveBeenCalledWith('/library', { scroll: false });
    act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS));
    expect(url.replace).not.toHaveBeenCalled();
    expect(result.current.params).toEqual({});
  });

  it('clear does not navigate when already on the default search', () => {
    const { result } = start('/library');
    act(() => result.current.clear());
    expect(url.push).not.toHaveBeenCalled();
  });

  it('follows back/forward (external URL changes)', () => {
    const { result } = start('/library?key=G');
    act(() => url.set('/library?key=D'));
    expect(result.current.params).toEqual({ key: ['D'] });
  });

  it('cancels a pending typing update on unmount', () => {
    const { result, unmount } = start('/library');
    act(() => result.current.setParams({ q: 'grace' }, { typing: true }));
    unmount();
    act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS));
    expect(url.replace).not.toHaveBeenCalled();
  });
});
