import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { mockViewport } from '@/components/ui/test-media';
import { branches } from '@/fixtures';
import { ENERGY_LEVELS, ENERGY_META, type FacetOptions, type SearchParams } from '@/types/domain';

import {
  activeFilterChips,
  clearFilters,
  countActiveFilters,
  effectiveUsage,
  FILTER_KEYS,
  FilterBar,
  toggleValue,
  withSelected,
} from './FilterBar';

beforeAll(() => {
  // Radix Select/Popover use these; jsdom doesn't implement them.
  Element.prototype.scrollIntoView ??= () => {};
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.releasePointerCapture ??= () => {};
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const facets: FacetOptions = {
  keys: ['C', 'D', 'E', 'G'],
  decades: [1980, 1990, 2010],
  chords: { chorus: ['C', 'G'], verse: ['D'], bridge: ['Em'] },
  branches,
};

const emptyFacets: FacetOptions = {
  keys: [],
  decades: [],
  chords: { chorus: [], verse: [], bridge: [] },
  branches: [],
};

function setup(params: SearchParams = {}, width = 1024, extra: Partial<FacetOptions> = {}) {
  mockViewport(width);
  const onChange = vi.fn();
  const user = userEvent.setup();
  render(<FilterBar params={params} facets={{ ...facets, ...extra }} onChange={onChange} />);
  return { onChange, user };
}

/** Last params passed to onChange, without the keys explicitly set to undefined. */
function lastDefined(onChange: ReturnType<typeof vi.fn>): SearchParams {
  const p = onChange.mock.lastCall?.[0] as SearchParams;
  return Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined));
}

describe('pure helpers', () => {
  it('toggleValue adds in option order, removes, and empties to undefined', () => {
    expect(toggleValue(undefined, 'E', ['C', 'D', 'E'])).toEqual(['E']);
    expect(toggleValue(['E'], 'C', ['C', 'D', 'E'])).toEqual(['C', 'E']);
    expect(toggleValue(['C', 'E'], 'C', ['C', 'D', 'E'])).toEqual(['E']);
    expect(toggleValue(['E'], 'E', ['C', 'D', 'E'])).toBeUndefined();
    // Unknown values sort after known ones, keeping their own order.
    expect(toggleValue(['Z', 'Y'], 'C', ['C'])).toEqual(['C', 'Z', 'Y']);
  });

  it('withSelected keeps stale selections visible', () => {
    expect(withSelected(['C', 'D'], ['F#', 'D'])).toEqual(['C', 'D', 'F#']);
    expect(withSelected(['C'], undefined)).toEqual(['C']);
  });

  it('effectiveUsage defaults to high/low/rare only when a branch is set', () => {
    expect(effectiveUsage({})).toEqual([]);
    expect(effectiveUsage({ usage: ['none'] })).toEqual([]);
    expect(effectiveUsage({ branch: 'OR' })).toEqual(['high', 'low', 'rare']);
    expect(effectiveUsage({ branch: 'OR', usage: [] })).toEqual(['high', 'low', 'rare']);
    expect(effectiveUsage({ branch: 'OR', usage: ['none'] })).toEqual(['none']);
  });

  it('countActiveFilters counts values, with branch use once', () => {
    expect(countActiveFilters({ q: 'x', sort: 'alpha' })).toBe(0);
    expect(
      countActiveFilters({
        energy: ['high_praise'],
        key: ['C', 'D'],
        decade: [1990],
        branch: 'OR',
        usage: ['high', 'low'],
        chordChorus: ['G'],
        chordVerse: ['D'],
        chordBridge: ['Em'],
      }),
    ).toBe(8);
  });

  it('clearFilters removes every filter key but keeps search, sort and fields', () => {
    const next = clearFilters({
      q: 'grace',
      fields: ['title'],
      sort: 'alpha',
      key: ['C'],
      page: 3,
    });
    for (const k of FILTER_KEYS) {
      expect(k in next).toBe(true);
      expect(next[k]).toBeUndefined();
    }
    expect(next.page).toBeUndefined();
    expect(next).toMatchObject({ q: 'grace', fields: ['title'], sort: 'alpha' });
  });

  it('activeFilterChips builds one chip per value with a removal patch', () => {
    const params: SearchParams = {
      energy: ['high_praise'],
      key: ['C', 'D'],
      decade: [1990],
      branch: 'OR',
      chordBridge: ['Em'],
    };
    const chips = activeFilterChips(params, facets);
    expect(chips.map((c) => c.label)).toEqual([
      ENERGY_META.high_praise.label,
      'Key C',
      'Key D',
      '1990s',
      'Portland (OR): high, low, rare',
      'Bridge starts on Em',
    ]);
    expect(chips[1]?.remove).toEqual({ key: ['D'] });
    expect(chips[3]?.remove).toEqual({ decade: undefined });
    expect(chips[4]?.remove).toEqual({ branch: undefined, usage: undefined });
    expect(chips[0]?.energy).toBe('high_praise');
  });

  it('falls back to the raw code for an unknown branch', () => {
    const [chip] = activeFilterChips({ branch: 'ZZ', usage: ['none'] }, facets);
    expect(chip?.label).toBe('ZZ: not used');
  });
});

describe('FilterBar on desktop', () => {
  it('shows every filter dropdown', () => {
    setup();
    const bar = screen.getByRole('toolbar', { name: 'Filters' });
    expect(
      within(bar)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual([
      'Energy',
      'Key',
      'Decade',
      'Branch use',
      'First chord: chorus/refrain',
      'First chord: verse',
      'First chord: bridge',
    ]);
    expect(screen.queryByRole('list', { name: 'Active filters' })).not.toBeInTheDocument();
  });

  it('lists every energy level with its label and a color swatch', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: 'Energy' }));
    const group = screen.getByRole('group', { name: 'Energy' });
    const boxes = within(group).getAllByRole('checkbox');
    expect(boxes).toHaveLength(ENERGY_LEVELS.length);
    for (const e of ENERGY_LEVELS) {
      expect(
        within(group).getByRole('checkbox', { name: ENERGY_META[e].label }),
      ).toBeInTheDocument();
      expect(group.querySelector(`[data-energy="${e}"]`)).not.toBeNull();
    }
  });

  it('combines filters: picking a key keeps the other params and resets the page', async () => {
    const { user, onChange } = setup({ q: 'grace', energy: ['mid_worship'], key: ['G'], page: 2 });
    await user.click(screen.getByRole('button', { name: 'Key, 1 selected' }));
    await user.click(screen.getByRole('checkbox', { name: 'D' }));
    expect(lastDefined(onChange)).toEqual({ q: 'grace', energy: ['mid_worship'], key: ['D', 'G'] });
    expect(onChange.mock.lastCall?.[0]).toHaveProperty('page', undefined);
  });

  it('unchecking the last value removes the filter', async () => {
    const { user, onChange } = setup({ decade: [1990] });
    await user.click(screen.getByRole('button', { name: 'Decade, 1 selected' }));
    expect(screen.getByRole('checkbox', { name: '1990s' })).toBeChecked();
    await user.click(screen.getByRole('checkbox', { name: '1990s' }));
    expect(onChange.mock.lastCall?.[0]).toHaveProperty('decade', undefined);
  });

  it('shows the single selected value on the trigger', () => {
    setup({ key: ['D'], chordVerse: ['D', 'A'] });
    expect(screen.getByRole('button', { name: 'Key, 1 selected' })).toHaveTextContent('Key: D');
    expect(
      screen.getByRole('button', { name: 'First chord: verse, 2 selected' }),
    ).toHaveTextContent('First chord: verse2');
  });

  it('filters by first chord of the chorus', async () => {
    const { user, onChange } = setup();
    await user.click(screen.getByRole('button', { name: 'First chord: chorus/refrain' }));
    await user.click(screen.getByRole('checkbox', { name: 'G' }));
    expect(lastDefined(onChange)).toEqual({ chordChorus: ['G'] });
  });

  it('branch use: pick a branch, then adjust levels; the last level cannot be unchecked', async () => {
    const { user, onChange } = setup();
    await user.click(screen.getByRole('button', { name: 'Branch use' }));
    expect(screen.queryByRole('group', { name: 'Usage level' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('combobox', { name: 'Branch' }));
    await user.click(screen.getByRole('option', { name: 'Portland (OR)' }));
    expect(lastDefined(onChange)).toEqual({ branch: 'OR' });
    cleanup();

    const second = setup({ branch: 'OR', usage: ['high'] });
    await second.user.click(screen.getByRole('button', { name: 'Branch use, 1 selected' }));
    const levels = screen.getByRole('group', { name: 'Usage level' });
    expect(within(levels).getByRole('checkbox', { name: 'High' })).toBeChecked();
    expect(within(levels).getByRole('checkbox', { name: 'Low' })).not.toBeChecked();
    await second.user.click(within(levels).getByRole('checkbox', { name: 'Not used' }));
    expect(lastDefined(second.onChange)).toEqual({ branch: 'OR', usage: ['high', 'none'] });
    second.onChange.mockClear();
    await second.user.click(within(levels).getByRole('checkbox', { name: 'High' }));
    expect(second.onChange).not.toHaveBeenCalled();
  });

  it('branch use: "Any branch" removes branch and usage', async () => {
    const { user, onChange } = setup({ branch: 'OR', usage: ['high'] });
    await user.click(screen.getByRole('button', { name: 'Branch use, 1 selected' }));
    expect(screen.getByRole('group', { name: 'Usage level' })).toBeInTheDocument();
    await user.click(screen.getByRole('combobox', { name: 'Branch' }));
    await user.click(screen.getByRole('option', { name: 'Any branch' }));
    const p = onChange.mock.lastCall?.[0] as SearchParams;
    expect(p.branch).toBeUndefined();
    expect(p.usage).toBeUndefined();
  });

  it('defaults usage checkboxes to high/low/rare when only a branch is set', async () => {
    const { user } = setup({ branch: 'SV' });
    await user.click(screen.getByRole('button', { name: 'Branch use, 1 selected' }));
    const levels = screen.getByRole('group', { name: 'Usage level' });
    const checked = within(levels)
      .getAllByRole('checkbox')
      .filter((c) => c.getAttribute('data-state') === 'checked')
      .map((c) => c.getAttribute('aria-labelledby') ?? c.closest('label')?.textContent);
    expect(checked).toEqual(['High', 'Low', 'Rare']);
  });

  it('keeps a selected value that is no longer a facet so it can be unchecked', async () => {
    const { user, onChange } = setup({ key: ['F#'] });
    await user.click(screen.getByRole('button', { name: 'Key, 1 selected' }));
    await user.click(screen.getByRole('checkbox', { name: 'F#' }));
    expect(onChange.mock.lastCall?.[0]).toHaveProperty('key', undefined);
  });

  it('is keyboard operable', async () => {
    const { user, onChange } = setup();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Energy' })).toHaveFocus();
    await user.keyboard('{Enter}');
    // The popover moves focus to its first option.
    const first = screen.getByRole('checkbox', { name: ENERGY_META.high_praise.label });
    expect(first).toHaveFocus();
    await user.keyboard(' ');
    expect(lastDefined(onChange)).toEqual({ energy: ['high_praise'] });
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('group', { name: 'Energy' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Energy' })).toHaveFocus();
  });
});

describe('active filter chips', () => {
  it('removes one value and clears all', async () => {
    const { user, onChange } = setup({ q: 'x', energy: ['deep_worship'], key: ['C', 'E'] });
    const list = screen.getByRole('list', { name: 'Active filters' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(4); // 3 chips + Clear
    await user.click(screen.getByRole('button', { name: 'Remove key filter C' }));
    expect(lastDefined(onChange)).toEqual({ q: 'x', energy: ['deep_worship'], key: ['E'] });
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(lastDefined(onChange)).toEqual({ q: 'x' });
  });

  it('shows an energy swatch on energy chips', () => {
    setup({ energy: ['quiet_worship'] });
    const list = screen.getByRole('list', { name: 'Active filters' });
    expect(list.querySelector('[data-energy="quiet_worship"]')).not.toBeNull();
    expect(list).toHaveTextContent(ENERGY_META.quiet_worship.label);
  });
});

describe('FilterBar on mobile', () => {
  it('collapses the dropdowns into a sheet', async () => {
    const { user, onChange } = setup({ key: ['D'] }, 360);
    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument();
    const trigger = screen.getByRole('button', { name: 'Filters, 1 active' });
    await user.click(trigger);
    const sheet = screen.getByRole('dialog', { name: 'Filters' });
    for (const heading of ['Energy', 'Key', 'Decade', 'Branch use', 'First chord: bridge']) {
      expect(within(sheet).getByRole('heading', { name: heading })).toBeInTheDocument();
    }
    expect(within(sheet).getByRole('group', { name: 'Energy' })).toBeInTheDocument();
    await user.click(within(sheet).getByRole('checkbox', { name: '1980s' }));
    expect(lastDefined(onChange)).toEqual({ key: ['D'], decade: [1980] });
    await user.click(within(sheet).getByRole('button', { name: 'Clear filters' }));
    expect(lastDefined(onChange)).toEqual({});
    await user.click(within(sheet).getByRole('button', { name: 'Show results' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('disables "Clear filters" in the sheet when nothing is active', async () => {
    const { user } = setup({}, 360);
    await user.click(screen.getByRole('button', { name: 'Filters' }));
    const sheet = screen.getByRole('dialog', { name: 'Filters' });
    expect(within(sheet).getByRole('button', { name: 'Clear filters' })).toBeDisabled();
  });
});

describe('loading, empty and error states', () => {
  it('shows a skeleton while facets load, chips stay removable', async () => {
    mockViewport(1024);
    const onChange = vi.fn();
    render(<FilterBar params={{ key: ['C'] }} facets={facets} onChange={onChange} loading />);
    expect(screen.getByLabelText('Loading filters')).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Remove key filter C' }));
    expect(onChange).toHaveBeenCalled();
  });

  it('shows an alert when facets fail', () => {
    mockViewport(1024);
    render(<FilterBar params={{}} facets={facets} onChange={vi.fn()} error="Network down." />);
    expect(screen.getByRole('alert')).toHaveTextContent('Filters couldn’t load. Network down.');
  });

  it('explains empty facets inside each dropdown', async () => {
    const { user } = setup({}, 1024, emptyFacets);
    await user.click(screen.getByRole('button', { name: 'Key' }));
    expect(screen.getByText('No keys yet')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Branch use' }));
    expect(screen.getByText('No branches yet')).toBeInTheDocument();
  });
});
