import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { songSummaries } from '@/fixtures';
import { ENERGY_META, type SearchResult, type SongSummary } from '@/types/domain';

import { matchSummary, QUICK_DEBOUNCE_MS, QuickLookup, type QuickLookupProps } from './QuickLookup';

const router = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

function result(items: SongSummary[], total = items.length, didYouMean?: string): SearchResult {
  return { items, total, page: 1, pageSize: 12, ...(didYouMean ? { didYouMean } : {}) };
}

/** `n` distinct summaries built from the fixtures. */
function many(n: number): SongSummary[] {
  return Array.from({ length: n }, (_, i) => {
    const s = songSummaries[i % songSummaries.length]!;
    return { ...s, id: `${s.id.slice(0, -4)}${String(i).padStart(4, '0')}`, title: `Song ${i}` };
  });
}

function setup(props: Partial<QuickLookupProps> = {}) {
  const all: QuickLookupProps = {
    query: { q: '', full: false },
    result: null,
    failed: false,
    ...props,
  };
  const utils = render(<QuickLookup {...all} />);
  const input = screen.getByRole('textbox', { name: 'Theme or words from a lyric' });
  return {
    ...utils,
    input,
    rerender: (p: Partial<QuickLookupProps>) => utils.rerender(<QuickLookup {...all} {...p} />),
  };
}

beforeEach(() => {
  router.replace.mockReset();
  router.refresh.mockReset();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('matchSummary', () => {
  it('describes top, full and complete lists', () => {
    expect(matchSummary(result(many(12), 40), false)).toBe('Top 12 of 40 matches');
    expect(matchSummary(result(many(100), 140), true)).toBe('First 100 of 140 matches');
    expect(matchSummary(result(many(3)), false)).toBe('All 3 matches');
    expect(matchSummary(result(many(1)), false)).toBe('1 match');
  });
});

describe('QuickLookup input', () => {
  it('is a large search box focused on arrival with a hint', () => {
    const { input } = setup();
    expect(input).toHaveFocus();
    expect(input).toHaveClass('h-16', 'text-2xl');
    expect(screen.getByRole('search', { name: 'Quick theme lookup' })).toBeInTheDocument();
    expect(screen.getByText(/Type a theme from the word/)).toBeInTheDocument();
  });

  it('debounces typing into the URL with router.replace', () => {
    vi.useFakeTimers();
    const { input } = setup();
    fireEvent.change(input, { target: { value: 'gr' } });
    fireEvent.change(input, { target: { value: 'grace ' } });
    expect(router.replace).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(QUICK_DEBOUNCE_MS));
    expect(router.replace).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenCalledWith('/quick?q=grace', { scroll: false });
  });

  it('Enter searches at once and keeps "Show full"', async () => {
    const user = userEvent.setup();
    const { input } = setup({ query: { q: '', full: true } });
    await user.type(input, 'cross{Enter}');
    expect(router.replace).toHaveBeenLastCalledWith('/quick?q=cross&full=1', { scroll: false });
    expect(input).not.toHaveFocus();
  });

  it('Escape and the clear button empty the box and go back to the bare page', async () => {
    const user = userEvent.setup();
    const { input } = setup({ query: { q: 'grace', full: true }, result: result(many(2)) });
    expect(input).toHaveValue('grace');
    expect(input).not.toHaveFocus();
    input.focus();
    await user.keyboard('{Escape}');
    expect(input).toHaveValue('');
    expect(router.replace).toHaveBeenLastCalledWith('/quick', { scroll: false });

    await user.type(input, 'x');
    await user.click(screen.getByRole('button', { name: 'Clear' }));
    expect(input).toHaveValue('');
    expect(input).toHaveFocus();
  });

  it('keeps the draft on its own echo but takes outside changes', () => {
    vi.useFakeTimers();
    const { input, rerender } = setup();
    fireEvent.change(input, { target: { value: 'grace' } });
    act(() => vi.advanceTimersByTime(QUICK_DEBOUNCE_MS));
    fireEvent.change(input, { target: { value: 'grace and' } });
    rerender({ query: { q: 'grace', full: false }, result: result(many(1)) });
    expect(input).toHaveValue('grace and');
    rerender({ query: { q: 'mercy', full: false }, result: result(many(1)) });
    expect(input).toHaveValue('mercy');
  });
});

describe('QuickLookup results', () => {
  it('lists the top 12 in large type, numbered, linking to each song', () => {
    const items = many(12);
    setup({ query: { q: 'grace', full: false }, result: result(items, 30) });
    const list = screen.getByRole('list');
    const links = within(list).getAllByRole('link');
    expect(links).toHaveLength(12);
    expect(links[0]).toHaveAttribute('href', `/songs/${items[0]!.id}`);
    expect(within(links[0]!).getByText('Song 0')).toHaveClass('text-2xl', 'font-semibold');
    expect(screen.getByText('Top 12 of 30 matches')).toBeInTheDocument();
  });

  it('shows energy labels exactly as ENERGY_META', () => {
    const song = songSummaries.find((s) => s.energyLevel !== null)!;
    setup({ query: { q: 'x', full: false }, result: result([song]) });
    expect(screen.getByText(ENERGY_META[song.energyLevel!].label)).toBeInTheDocument();
  });

  it('"Show full" toggles the full list', async () => {
    const user = userEvent.setup();
    const { rerender } = setup({
      query: { q: 'grace', full: false },
      result: result(many(12), 30),
    });
    const toggle = screen.getByRole('button', { name: 'Show full' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await user.click(toggle);
    expect(router.replace).toHaveBeenLastCalledWith('/quick?q=grace&full=1', { scroll: false });

    rerender({ query: { q: 'grace', full: true }, result: result(many(30)) });
    expect(screen.getByRole('button', { name: 'Show full' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getAllByRole('listitem')).toHaveLength(30);
    await user.click(screen.getByRole('button', { name: 'Show full' }));
    expect(router.replace).toHaveBeenLastCalledWith('/quick?q=grace', { scroll: false });
  });

  it('hides "Show full" when every match is already shown', () => {
    setup({ query: { q: 'grace', full: false }, result: result(many(5)) });
    expect(screen.queryByRole('button', { name: 'Show full' })).not.toBeInTheDocument();
    expect(screen.getByText('All 5 matches')).toBeInTheDocument();
  });

  it('links to the library when even the full list is cut off', () => {
    setup({ query: { q: 'grace', full: true }, result: result(many(3), 150) });
    expect(screen.getByRole('link', { name: 'See all 150 in the library' })).toHaveAttribute(
      'href',
      expect.stringMatching(/^\/library\?q=grace&fields=/),
    );
  });

  it('empty: says so and offers "did you mean"', async () => {
    const user = userEvent.setup();
    setup({ query: { q: 'grase', full: false }, result: result([], 0, 'grace') });
    expect(screen.getByText(/No songs match/)).toHaveTextContent('No songs match “grase”.');
    await user.click(screen.getByRole('button', { name: 'grace' }));
    expect(router.replace).toHaveBeenLastCalledWith('/quick?q=grace', { scroll: false });
    expect(screen.getByRole('textbox')).toHaveValue('grace');
  });

  it('empty without a suggestion suggests another word', () => {
    setup({ query: { q: 'zzz', full: false }, result: result([], 0) });
    expect(screen.getByText('Try a shorter or different word.')).toBeInTheDocument();
  });

  it('error: alert with "Try again" that refreshes', async () => {
    const user = userEvent.setup();
    setup({ query: { q: 'grace', full: false }, failed: true });
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent("Couldn't search right now.");
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });

  it('announces the match count politely', () => {
    setup({ query: { q: 'grace', full: false }, result: result(many(2)) });
    const input = screen.getByRole('textbox');
    const status = document.getElementById(input.getAttribute('aria-describedby')!);
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveTextContent('All 2 matches for “grace”');
  });
});
