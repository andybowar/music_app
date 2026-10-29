import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState, useSyncExternalStore } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SEARCH_FIELDS, type SearchField } from '@/types/domain';

import { SearchBar, type SearchBarProps } from './SearchBar';
import { SEARCH_DEBOUNCE_MS, useSearchState } from './useSearchState';

// In-memory URL standing in for the Next.js router (used by the useSearchState wiring tests).
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

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  url.listeners.clear();
});

const ALL = [...SEARCH_FIELDS];

/** Controlled harness: holds value/fields like a real parent would. */
function Controlled(
  props: { initialValue?: string; initialFields?: SearchField[] } & Partial<SearchBarProps>,
) {
  const [value, setValue] = useState(props.initialValue ?? '');
  const [fields, setFields] = useState<SearchField[]>(props.initialFields ?? ALL);
  return (
    <SearchBar
      value={value}
      fields={fields}
      onChange={(q, f) => {
        setValue(q);
        setFields(f);
        props.onChange?.(q, f);
      }}
      onSubmit={props.onSubmit ?? (() => {})}
    />
  );
}

function setup(props: Parameters<typeof Controlled>[0] = {}) {
  const onChange = vi.fn<SearchBarProps['onChange']>();
  const onSubmit = vi.fn<SearchBarProps['onSubmit']>();
  const user = userEvent.setup();
  render(<Controlled {...props} onChange={onChange} onSubmit={onSubmit} />);
  return { user, onChange, onSubmit, input: screen.getByRole('textbox', { name: 'Search songs' }) };
}

const toggle = (name: string) => screen.getByRole('button', { name });

describe('SearchBar', () => {
  it('renders a labelled search landmark, input and four sentence-case field toggles', () => {
    setup();
    expect(screen.getByRole('search', { name: 'Song search' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Search songs' })).toHaveValue('');
    expect(screen.getByRole('toolbar', { name: 'Search in' })).toBeInTheDocument();
    for (const name of ['Titles', 'Lyrics', 'Themes', 'Composer']) {
      expect(toggle(name)).toHaveAttribute('aria-pressed', 'true');
    }
  });

  it('treats an empty fields prop as all four on', () => {
    render(<SearchBar value="" fields={[]} onChange={vi.fn()} onSubmit={vi.fn()} />);
    for (const name of ['Titles', 'Lyrics', 'Themes', 'Composer']) {
      expect(toggle(name)).toHaveAttribute('aria-pressed', 'true');
    }
  });

  it('calls onChange on every keystroke with the current fields', async () => {
    const { user, input, onChange } = setup();
    await user.type(input, 'joy');
    expect(input).toHaveValue('joy');
    expect(onChange.mock.calls).toEqual([
      ['j', ALL],
      ['jo', ALL],
      ['joy', ALL],
    ]);
  });

  it('shows a clear button only with text; clicking it clears and refocuses the input', async () => {
    const { user, input, onChange } = setup({ initialValue: 'grace' });
    expect(input).toHaveValue('grace');
    await user.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(input).toHaveValue('');
    expect(input).toHaveFocus();
    expect(onChange).toHaveBeenLastCalledWith('', ALL);
    expect(screen.queryByRole('button', { name: 'Clear search' })).not.toBeInTheDocument();
  });

  it('Esc clears the text', async () => {
    const { user, input, onChange } = setup({ initialValue: 'grace' });
    await user.click(input);
    await user.keyboard('{Escape}');
    expect(input).toHaveValue('');
    expect(onChange).toHaveBeenLastCalledWith('', ALL);
  });

  it('Esc on an empty box does nothing', async () => {
    const { user, input, onChange } = setup();
    await user.click(input);
    await user.keyboard('{Escape}');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('Enter submits without reloading the page', async () => {
    const { user, input, onSubmit } = setup();
    await user.type(input, 'peace{Enter}');
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['Titles', 'title'],
    ['Lyrics', 'lyrics'],
    ['Themes', 'themes'],
    ['Composer', 'composer'],
  ] as const)('toggling %s off and on again', async (name, field) => {
    const { user, onChange } = setup({ initialValue: 'x' });
    await user.click(toggle(name));
    expect(toggle(name)).toHaveAttribute('aria-pressed', 'false');
    expect(onChange).toHaveBeenLastCalledWith(
      'x',
      ALL.filter((f) => f !== field),
    );
    await user.click(toggle(name));
    expect(toggle(name)).toHaveAttribute('aria-pressed', 'true');
    expect(onChange).toHaveBeenLastCalledWith('x', ALL);
  });

  it('keeps fields in canonical order regardless of toggle order', async () => {
    const { user, onChange } = setup({ initialFields: ['composer'] });
    await user.click(toggle('Titles'));
    expect(onChange).toHaveBeenLastCalledWith('', ['title', 'composer']);
  });

  it('keeps at least one field selected', async () => {
    const { user, onChange } = setup({ initialFields: ['lyrics'] });
    expect(toggle('Lyrics')).toHaveAttribute('aria-pressed', 'true');
    expect(toggle('Lyrics')).toHaveAttribute('aria-disabled', 'true');
    await user.click(toggle('Lyrics'));
    expect(toggle('Lyrics')).toHaveAttribute('aria-pressed', 'true');
    expect(onChange).not.toHaveBeenCalled();
    // Once a second field is on, the first can be turned off again.
    await user.click(toggle('Themes'));
    expect(toggle('Lyrics')).not.toHaveAttribute('aria-disabled');
    await user.click(toggle('Lyrics'));
    expect(onChange).toHaveBeenLastCalledWith('', ['themes']);
  });

  it('is keyboard operable: Tab to the toggles, Space/Enter toggles, arrows move', async () => {
    const { user, input, onChange } = setup();
    await user.tab();
    expect(input).toHaveFocus();
    await user.tab();
    expect(toggle('Titles')).toHaveFocus();
    await user.keyboard(' ');
    expect(toggle('Titles')).toHaveAttribute('aria-pressed', 'false');
    await user.keyboard('{ArrowRight}');
    expect(toggle('Lyrics')).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenLastCalledWith('', ['themes', 'composer']);
  });

  it('ignores a stale echo of earlier text but keeps the newest keystrokes', async () => {
    const props = { fields: ALL, onChange: vi.fn(), onSubmit: vi.fn() };
    const user = userEvent.setup();
    const { rerender } = render(<SearchBar value="" {...props} />);
    const input = screen.getByRole('textbox', { name: 'Search songs' });
    await user.type(input, 'joy');
    // The router commits "jo" late, after "y" was typed.
    rerender(<SearchBar value="jo" {...props} />);
    expect(input).toHaveValue('joy');
    rerender(<SearchBar value="joy" {...props} />);
    expect(input).toHaveValue('joy');
    // Once everything has echoed back, an external change wins again.
    rerender(<SearchBar value="jo" {...props} />);
    expect(input).toHaveValue('jo');
  });

  it('adopts an external value change (e.g. Home clears the search)', () => {
    const props = { fields: ALL, onChange: vi.fn(), onSubmit: vi.fn() };
    const { rerender } = render(<SearchBar value="grace" {...props} />);
    const input = screen.getByRole('textbox', { name: 'Search songs' });
    expect(input).toHaveValue('grace');
    rerender(<SearchBar value="" {...props} />);
    expect(input).toHaveValue('');
  });
});

describe('SearchBar wired to useSearchState', () => {
  // fireEvent rather than user-event here: RTL's async wrapper waits on a real
  // setTimeout, which never fires under vitest fake timers.
  function Wired() {
    const { params, setParams, newSearch } = useSearchState();
    const current = params.fields ?? ALL;
    return (
      <SearchBar
        value={params.q ?? ''}
        fields={current}
        onChange={(q, fields) =>
          setParams(
            { q: q || undefined, fields },
            { typing: fields.join() === current.join() }, // text edit vs field toggle
          )
        }
        onSubmit={newSearch}
      />
    );
  }

  function start(href: string) {
    vi.useFakeTimers();
    url.set(href);
    url.push.mockClear();
    url.replace.mockClear();
    render(<Wired />);
    return screen.getByRole('textbox', { name: 'Search songs' });
  }

  /** One keystroke every 50 ms (faster than the debounce). */
  const typeText = (input: HTMLElement, text: string) => {
    const base = (input as HTMLInputElement).value;
    for (let i = 1; i <= text.length; i++) {
      fireEvent.change(input, { target: { value: base + text.slice(0, i) } });
      act(() => vi.advanceTimersByTime(50));
    }
  };

  it('debounces typing into one URL replace after SEARCH_DEBOUNCE_MS', () => {
    const input = start('/library');
    typeText(input, 'joy');
    expect(input).toHaveValue('joy');
    expect(url.replace).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS - 51));
    expect(url.replace).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(url.replace).toHaveBeenCalledTimes(1);
    expect(url.replace).toHaveBeenLastCalledWith('/library?q=joy', { scroll: false });
    expect(url.push).not.toHaveBeenCalled();
    expect(input).toHaveValue('joy');
  });

  it('keeps typing after the URL catches up', () => {
    const input = start('/library');
    typeText(input, 'jo');
    act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS));
    expect(url.state.search).toBe('q=jo');
    typeText(input, 'y');
    expect(input).toHaveValue('joy');
    act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS));
    expect(url.state.search).toBe('q=joy');
  });

  it('Enter flushes pending text immediately with a push', () => {
    const input = start('/library');
    typeText(input, 'peace');
    fireEvent.submit(input.closest('form')!);
    expect(url.push).toHaveBeenCalledWith('/library?q=peace', { scroll: false });
    act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS));
    expect(url.replace).not.toHaveBeenCalled();
  });

  it('Esc clears the URL text after the debounce', () => {
    const input = start('/library?q=grace');
    expect(input).toHaveValue('grace');
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(input).toHaveValue('');
    act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS));
    expect(url.state.search).toBe('');
  });

  it('field toggles are pushed to the URL straight away', () => {
    start('/library?q=grace');
    fireEvent.click(toggle('Lyrics'));
    expect(url.push).toHaveBeenLastCalledWith('/library?q=grace&fields=title,themes,composer', {
      scroll: false,
    });
    expect(toggle('Lyrics')).toHaveAttribute('aria-pressed', 'false');
  });
});
