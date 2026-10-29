import { act, render, renderHook, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import type { ReactNode } from 'react';

import type { List } from '@/types/domain';

import { CurrentListProvider, useCurrentList } from './CurrentList';

function makeList(overrides: Partial<List> = {}): List {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    type: 'setlist',
    name: 'Sunday prayer meeting',
    eventDate: '2026-11-01',
    ownerId: '22222222-2222-4222-8222-222222222222',
    ownerName: 'Sample leader',
    branchId: null,
    branchCode: null,
    itemCount: 0,
    createdAt: '2026-10-28T12:00:00.000Z',
    updatedAt: '2026-10-28T12:00:00.000Z',
    ...overrides,
  };
}

const listA = makeList();
const listB = makeList({
  id: '33333333-3333-4333-8333-333333333333',
  type: 'playlist',
  name: 'Car rides',
});

function cookieValue(): string | null {
  const match = document.cookie
    .split(';')
    .map((p) => p.trim())
    .find((p) => p.startsWith('current_list='));
  if (!match) return null;
  const value = decodeURIComponent(match.slice('current_list='.length));
  return value === '' ? null : value;
}

function clearCookie() {
  document.cookie = 'current_list=; Path=/; Max-Age=0';
}

function wrapperWith(initial: List | null) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <CurrentListProvider initial={initial}>{children}</CurrentListProvider>;
  };
}

function Probe() {
  const { current } = useCurrentList();
  return <p>{current ? current.name : 'No current list'}</p>;
}

beforeEach(() => {
  clearCookie();
});

describe('CurrentListProvider / useCurrentList', () => {
  it('starts from `initial`', () => {
    const { result } = renderHook(() => useCurrentList(), { wrapper: wrapperWith(listA) });
    expect(result.current.current).toBe(listA);
  });

  it('starts empty when `initial` is null', () => {
    const { result } = renderHook(() => useCurrentList(), { wrapper: wrapperWith(null) });
    expect(result.current.current).toBeNull();
    expect(cookieValue()).toBeNull();
  });

  it('sets the current list and persists its id in the cookie', () => {
    const { result } = renderHook(() => useCurrentList(), { wrapper: wrapperWith(null) });
    act(() => result.current.setCurrent(listA));
    expect(result.current.current).toBe(listA);
    expect(cookieValue()).toBe(listA.id);

    act(() => result.current.setCurrent(listB));
    expect(result.current.current).toBe(listB);
    expect(cookieValue()).toBe(listB.id);
  });

  it('clears the current list and the cookie', () => {
    const { result } = renderHook(() => useCurrentList(), { wrapper: wrapperWith(listA) });
    expect(cookieValue()).toBe(listA.id);
    act(() => result.current.setCurrent(null));
    expect(result.current.current).toBeNull();
    expect(cookieValue()).toBeNull();
  });

  it('keeps setCurrent stable across renders', () => {
    const { result } = renderHook(() => useCurrentList(), { wrapper: wrapperWith(null) });
    const first = result.current.setCurrent;
    act(() => result.current.setCurrent(listA));
    expect(result.current.setCurrent).toBe(first);
  });

  it('survives a reload: cookie persists and the server-resolved list is shown', () => {
    const first = renderHook(() => useCurrentList(), { wrapper: wrapperWith(null) });
    act(() => first.result.current.setCurrent(listA));
    first.unmount();

    // The cookie outlives the tree; on reload the server reads it and passes the list back.
    expect(cookieValue()).toBe(listA.id);
    const second = renderHook(() => useCurrentList(), { wrapper: wrapperWith(listA) });
    expect(second.result.current.current).toBe(listA);
    expect(cookieValue()).toBe(listA.id);
  });

  it('clears a stale cookie when the server resolves no list (list deleted)', () => {
    document.cookie = `current_list=${listA.id}; Path=/`;
    const { result } = renderHook(() => useCurrentList(), { wrapper: wrapperWith(null) });
    expect(result.current.current).toBeNull();
    expect(cookieValue()).toBeNull();
  });

  it('follows a new `initial` from the server (e.g. after router.refresh)', () => {
    const { rerender } = render(
      <CurrentListProvider initial={listA}>
        <Probe />
      </CurrentListProvider>,
    );
    expect(screen.getByText(listA.name)).toBeTruthy();

    rerender(
      <CurrentListProvider initial={null}>
        <Probe />
      </CurrentListProvider>,
    );
    expect(screen.getByText('No current list')).toBeTruthy();
    expect(cookieValue()).toBeNull();
  });

  it('does not reset local state on a re-render with the same `initial`', () => {
    const wrapper = wrapperWith(null);
    const { result, rerender } = renderHook(() => useCurrentList(), { wrapper });
    act(() => result.current.setCurrent(listB));
    rerender();
    expect(result.current.current).toBe(listB);
  });

  it('throws a clear error outside the provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useCurrentList())).toThrow(
      'useCurrentList must be used inside <CurrentListProvider>.',
    );
    spy.mockRestore();
  });

  it('keeps working when cookies are unavailable', () => {
    const desc = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie');
    Object.defineProperty(document, 'cookie', {
      configurable: true,
      get() {
        throw new Error('blocked');
      },
      set() {
        throw new Error('blocked');
      },
    });
    try {
      const { result } = renderHook(() => useCurrentList(), { wrapper: wrapperWith(null) });
      act(() => result.current.setCurrent(listA));
      expect(result.current.current).toBe(listA);
    } finally {
      delete (document as { cookie?: string }).cookie;
      if (desc) Object.defineProperty(Document.prototype, 'cookie', desc);
    }
  });

  it('renders on the server without touching the cookie, matching the client', () => {
    document.cookie = `current_list=${listB.id}; Path=/`;
    const html = renderToString(
      <CurrentListProvider initial={listA}>
        <Probe />
      </CurrentListProvider>,
    );
    expect(html).toContain(listA.name);
    // Effects don't run in SSR, so the cookie is untouched by the server render.
    expect(cookieValue()).toBe(listB.id);
  });
});
