import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { SORTS, type Sort } from '@/types/domain';

import { DEFAULT_SORT_DIR, SORT_LABELS, SortControl } from './SortControl';

beforeAll(() => {
  // Radix Select uses these; jsdom doesn't implement them.
  Element.prototype.scrollIntoView ??= () => {};
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.releasePointerCapture ??= () => {};
});

afterEach(cleanup);

const trigger = () => screen.getByRole('combobox', { name: 'Sort by' });
const dirButton = () => screen.getByRole('button', { name: /^Sort(ed)? / });

describe('SortControl', () => {
  it('uses sentence-case labels for every sort', () => {
    expect(Object.keys(SORT_LABELS).sort()).toEqual([...SORTS].sort());
    for (const s of SORTS) expect(SORT_LABELS[s]).toMatch(/^[A-Z][^A-Z]*$|^A–Z$/);
  });

  it('shows "Date added" when unset and there is no query', () => {
    render(<SortControl onChange={vi.fn()} />);
    expect(trigger()).toHaveTextContent('Date added');
    expect(dirButton()).toHaveAttribute('data-dir', 'desc');
    expect(dirButton()).toBeEnabled();
  });

  it('shows "Relevance" when a query is present and no sort is set, and disables direction', () => {
    render(<SortControl hasQuery onChange={vi.fn()} />);
    expect(trigger()).toHaveTextContent('Relevance');
    expect(dirButton()).toBeDisabled();
    expect(dirButton()).toHaveAccessibleName('Sort direction unavailable for relevance');
  });

  it.each(SORTS)('reflects the current selection: %s', (s: Sort) => {
    render(<SortControl sort={s} dir="asc" hasQuery onChange={vi.fn()} />);
    expect(trigger()).toHaveTextContent(SORT_LABELS[s]);
    expect(dirButton()).toHaveAttribute('data-dir', 'asc');
    expect(dirButton()).toHaveAccessibleName('Sorted ascending, switch to descending');
  });

  it('lists every sort, and Relevance only when there is a query', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<SortControl onChange={vi.fn()} />);
    await user.click(trigger());
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(
      SORTS.map((s) => SORT_LABELS[s]),
    );
    unmount();

    render(<SortControl hasQuery onChange={vi.fn()} />);
    await user.click(trigger());
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Relevance',
      ...SORTS.map((s) => SORT_LABELS[s]),
    ]);
  });

  it.each(SORTS.filter((s) => s !== 'date'))(
    'picking %s calls onChange with its default direction',
    async (s) => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(<SortControl onChange={onChange} />);
      await user.click(trigger());
      await user.click(screen.getByRole('option', { name: SORT_LABELS[s] }));
      expect(onChange).toHaveBeenCalledExactlyOnceWith(s, DEFAULT_SORT_DIR[s]);
    },
  );

  it('picking date from relevance calls onChange("date", "desc")', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SortControl hasQuery onChange={onChange} />);
    await user.click(trigger());
    await user.click(screen.getByRole('option', { name: 'Date added' }));
    expect(onChange).toHaveBeenCalledExactlyOnceWith('date', 'desc');
  });

  it('picking Relevance clears sort and direction', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SortControl sort="alpha" dir="desc" hasQuery onChange={onChange} />);
    await user.click(trigger());
    await user.click(screen.getByRole('option', { name: 'Relevance' }));
    expect(onChange).toHaveBeenCalledExactlyOnceWith(undefined, undefined);
  });

  it('re-picking the current sort does not call onChange', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SortControl sort="energy" onChange={onChange} />);
    await user.click(trigger());
    await user.click(screen.getByRole('option', { name: 'Energy' }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('toggles direction, keeping the sort', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(<SortControl sort="key" dir="asc" onChange={onChange} />);
    await user.click(dirButton());
    expect(onChange).toHaveBeenLastCalledWith('key', 'desc');

    rerender(<SortControl sort="key" dir="desc" onChange={onChange} />);
    expect(dirButton()).toHaveAccessibleName('Sorted descending, switch to ascending');
    await user.click(dirButton());
    expect(onChange).toHaveBeenLastCalledWith('key', 'asc');
  });

  it('toggles from the default direction when dir is unset', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SortControl onChange={onChange} />);
    await user.click(dirButton());
    expect(onChange).toHaveBeenCalledExactlyOnceWith('date', 'asc');
  });

  it('is keyboard operable: tab to the select, choose with arrows + Enter, toggle with Space', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SortControl sort="date" dir="desc" onChange={onChange} />);

    await user.tab();
    expect(trigger()).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    await user.keyboard('{ArrowDown}{Enter}');
    expect(onChange).toHaveBeenCalledExactlyOnceWith('alpha', 'asc');

    await user.tab();
    expect(dirButton()).toHaveFocus();
    await user.keyboard(' ');
    expect(onChange).toHaveBeenLastCalledWith('date', 'asc');
  });

  it('closes the list with Escape without changing the sort', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SortControl sort="alpha" dir="asc" onChange={onChange} />);
    trigger().focus();
    await user.keyboard('{Enter}');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('lays out narrow: trigger shrinks to fit 360px and controls do not wrap', () => {
    const { container } = render(<SortControl onChange={vi.fn()} className="w-[360px]" />);
    const root = container.firstElementChild as HTMLElement;
    expect(root).toHaveClass('flex', 'min-w-0', 'items-center', 'w-[360px]');
    expect(trigger()).toHaveClass('min-w-0', 'flex-1');
    expect(dirButton()).toHaveClass('shrink-0');
  });
});
