import {
  act,
  createEvent,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { composers as fixtureComposers, thousandHallelujahs } from '@/fixtures';
import type { ActionResult, Composer } from '@/types/domain';
import {
  addAltTitle,
  BasicInfoSection,
  BasicInfoSectionSkeleton,
  errorsFor,
  moveItem,
  parseYear,
  type BasicInfoSectionProps,
} from './BasicInfoSection';
import { basicInfoFromSong, type SongFormValue } from './types';

beforeAll(() => {
  // cmdk / Radix need these, jsdom doesn't ship them.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  Element.prototype.scrollIntoView ??= function scrollIntoView() {};
});

const [brooke, matt, martha] = [
  fixtureComposers.find((c) => c.name === 'Brooke Ligertwood'),
  fixtureComposers.find((c) => c.popMember === 'current'),
  fixtureComposers.find((c) => c.popMember === 'past'),
] as [Composer, Composer, Composer];

function fakeSearch(results: Composer[] = fixtureComposers) {
  return vi.fn(async (prefix: string) =>
    results.filter((c) => c.name.toLowerCase().includes(prefix.toLowerCase())),
  );
}

type Overrides = Partial<Omit<BasicInfoSectionProps, 'value' | 'onChange'>> & {
  initial?: Partial<SongFormValue>;
};

/** Renders the section with real state so interactions compound like in the form. */
function setup({ initial = {}, ...props }: Overrides = {}) {
  const changes: Array<Partial<SongFormValue>> = [];
  const searchComposers = props.searchComposers ?? fakeSearch();
  const createComposer =
    props.createComposer ??
    vi.fn(async (name: string): Promise<ActionResult<Composer>> => ({
      ok: true,
      data: { id: '3f000000-0000-4000-8000-000000000001', name, popMember: 'none' },
    }));
  function Harness() {
    const [value, setValue] = useState<Partial<SongFormValue>>(initial);
    return (
      <BasicInfoSection
        {...props}
        value={value}
        onChange={(patch) => {
          changes.push(patch);
          setValue((v) => ({ ...v, ...patch }));
        }}
        searchComposers={searchComposers}
        createComposer={createComposer}
      />
    );
  }
  const user = userEvent.setup();
  render(<Harness />);
  const last = () => changes.at(-1)?.basic;
  return { user, changes, last, searchComposers, createComposer };
}

const composerNames = () =>
  within(screen.getByRole('list', { name: 'Composers in order' }))
    .getAllByRole('listitem')
    .map((li) => li.getAttribute('data-composer-id'));

describe('pure helpers', () => {
  it('moveItem moves and ignores out-of-range indices', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
    expect(moveItem(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
    expect(moveItem(['a', 'b'], 0, 0)).toEqual(['a', 'b']);
    expect(moveItem(['a', 'b'], -1, 1)).toEqual(['a', 'b']);
    expect(moveItem(['a', 'b'], 0, 5)).toEqual(['a', 'b']);
  });

  it('addAltTitle trims, dedupes case-insensitively and enforces the limit', () => {
    expect(addAltTitle([], '  1000   Hallelujahs ')).toEqual({
      ok: true,
      altTitles: ['1000 Hallelujahs'],
    });
    expect(addAltTitle([], '   ')).toEqual({ ok: false, reason: 'empty' });
    expect(addAltTitle(['Foo'], 'foo')).toEqual({ ok: false, reason: 'duplicate' });
    const ten = Array.from({ length: 10 }, (_, i) => `t${i}`);
    expect(addAltTitle(ten, 'new')).toEqual({ ok: false, reason: 'full' });
    const long = addAltTitle([], 'x'.repeat(250));
    expect(long.ok && long.altTitles[0]).toHaveLength(200);
  });

  it('errorsFor matches exact and nested keys only', () => {
    const errors = { altTitles: ['a'], 'altTitles.1': ['b'], altTitlesX: ['no'], year: ['c'] };
    expect(errorsFor(errors, 'altTitles')).toEqual(['a', 'b']);
    expect(errorsFor(errors, 'composers', 'year')).toEqual(['c']);
    expect(errorsFor(undefined, 'title')).toEqual([]);
  });

  it('parseYear accepts up to four digits', () => {
    expect(parseYear('2021')).toBe(2021);
    expect(parseYear(' 99 ')).toBe(99);
    expect(parseYear('')).toBeNull();
    expect(parseYear('20a1')).toBeNull();
    expect(parseYear('12345')).toBeNull();
    expect(parseYear('-5')).toBeNull();
  });
});

describe('BasicInfoSection', () => {
  it('renders the empty state for a new song', () => {
    setup();
    expect(screen.getByRole('group', { name: 'Basic info' })).toBeTruthy();
    expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('');
    expect(screen.getByText('No alternate titles.')).toBeTruthy();
    expect(screen.getByText('No composers yet. Add at least one.')).toBeTruthy();
  });

  it('edits title, source group and year', async () => {
    const { user, last } = setup();
    await user.type(screen.getByLabelText('Title'), 'Song');
    expect(last()?.title).toBe('Song');
    await user.type(screen.getByLabelText(/Source group/), 'Hillsong');
    expect(last()?.sourceGroup).toBe('Hillsong');
    await user.clear(screen.getByLabelText(/Source group/));
    expect(last()?.sourceGroup).toBeNull();
    await user.type(screen.getByLabelText(/Year composed/), '2021');
    expect(last()?.year).toBe(2021);
    await user.clear(screen.getByLabelText(/Year composed/));
    expect(last()?.year).toBeNull();
  });

  it('flags an out-of-range year only after blur', async () => {
    const { user } = setup();
    const year = screen.getByLabelText(/Year composed/);
    await user.type(year, '99');
    expect(screen.queryByText(/Year must be between/)).toBeNull();
    await user.tab();
    expect(screen.getByText('Year must be between 1000 and 2100')).toBeTruthy();
    expect(year.getAttribute('aria-invalid')).toBe('true');
  });

  it('adds alternate titles as chips with Enter and removes them', async () => {
    const { user, last } = setup();
    const input = screen.getByLabelText(/Alternate titles/);
    await user.type(input, 'One{Enter}Two,');
    expect(last()?.altTitles).toEqual(['One', 'Two']);
    await user.type(input, 'one{Enter}');
    expect(screen.getByText('That alternate title is already listed')).toBeTruthy();
    await user.clear(input);
    await user.click(screen.getByRole('button', { name: 'Remove alternate title One' }));
    expect(last()?.altTitles).toEqual(['Two']);
    await user.type(input, '{Backspace}');
    expect(last()?.altTitles).toEqual([]);
  });

  it('adds an alternate title with the Add button', async () => {
    const { user, last } = setup();
    await user.type(screen.getByLabelText(/Alternate titles/), 'Three');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(last()?.altTitles).toEqual(['Three']);
  });

  it('searches composers and adds the picked one', async () => {
    const { user, last, searchComposers } = setup();
    await user.click(screen.getByRole('button', { name: 'Add composer' }));
    expect(screen.getByText('Type a name to search.')).toBeTruthy();
    await user.type(screen.getByLabelText('Search composers'), 'brooke');
    expect(screen.getByRole('status', { name: 'Searching composers' })).toBeTruthy();
    const option = await screen.findByRole('option', { name: /Brooke Ligertwood/ });
    expect(searchComposers).toHaveBeenLastCalledWith('brooke');
    await user.click(option);
    expect(last()?.composers).toEqual([brooke]);
    expect(screen.queryByLabelText('Search composers')).toBeNull();
  });

  it('debounces search so one call is made per pause', async () => {
    const { user, searchComposers } = setup();
    await user.click(screen.getByRole('button', { name: 'Add composer' }));
    await user.type(screen.getByLabelText('Search composers'), 'bro');
    await screen.findByRole('option', { name: /Brooke/ });
    expect(searchComposers).toHaveBeenCalledTimes(1);
  });

  it('hides already-selected composers from results', async () => {
    const { user } = setup({ initial: { basic: basicInfoFromSong(thousandHallelujahs) } });
    await user.click(screen.getByRole('button', { name: 'Add composer' }));
    await user.type(screen.getByLabelText('Search composers'), 'Brooke Ligertwood');
    expect(await screen.findByText('Already added.')).toBeTruthy();
    expect(screen.queryByRole('option', { name: /Create/ })).toBeNull();
  });

  it('shows a create option and creates a new composer', async () => {
    const { user, last, createComposer } = setup({ searchComposers: fakeSearch([]) });
    await user.click(screen.getByRole('button', { name: 'Add composer' }));
    await user.type(screen.getByLabelText('Search composers'), 'New Person');
    await user.click(await screen.findByRole('option', { name: 'Create “New Person”' }));
    await waitFor(() => expect(last()?.composers.map((c) => c.name)).toEqual(['New Person']));
    expect(createComposer).toHaveBeenCalledWith('New Person');
  });

  it('keeps the palette open with an error when create fails', async () => {
    const createComposer = vi.fn(async (): Promise<ActionResult<Composer>> => ({
      ok: false,
      error: { code: 'FORBIDDEN', message: 'Not allowed' },
    }));
    const { user, changes } = setup({ searchComposers: fakeSearch([]), createComposer });
    await user.click(screen.getByRole('button', { name: 'Add composer' }));
    await user.type(screen.getByLabelText('Search composers'), 'Someone');
    await user.click(await screen.findByRole('option', { name: /Create/ }));
    expect(await screen.findByText('Not allowed')).toBeTruthy();
    expect(changes).toHaveLength(0);
  });

  it('shows an error state with retry when search fails', async () => {
    let fail = true;
    const searchComposers = vi.fn(async () => {
      if (fail) throw new Error('down');
      return [brooke];
    });
    const { user } = setup({ searchComposers });
    await user.click(screen.getByRole('button', { name: 'Add composer' }));
    await user.type(screen.getByLabelText('Search composers'), 'b');
    expect(await screen.findByText(/Couldn.t load composers/)).toBeTruthy();
    fail = false;
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('option', { name: /Brooke/ })).toBeTruthy();
  });

  it('offers no create option when a result matches the name exactly', async () => {
    const { user } = setup({ searchComposers: fakeSearch([brooke]) });
    await user.click(screen.getByRole('button', { name: 'Add composer' }));
    await user.type(screen.getByLabelText('Search composers'), 'brooke ligertwood');
    expect(await screen.findByRole('option', { name: /Brooke/ })).toBeTruthy();
    expect(screen.queryByRole('option', { name: /Create/ })).toBeNull();
  });

  it('highlights POP composers with a tooltip and a text label', () => {
    setup({
      initial: { basic: { ...basicInfoFromSong(thousandHallelujahs), composers: [matt, martha] } },
    });
    const current = screen.getByText(matt.name);
    expect(current.getAttribute('title')).toBe('People of Praise member (current)');
    expect(current.className).toContain('text-pop-current-on-light');
    const past = screen.getByText(martha.name);
    expect(past.getAttribute('title')).toBe('People of Praise member (past)');
    expect(screen.getByText('(POP current)')).toBeTruthy();
    expect(screen.getByText('(POP past)')).toBeTruthy();
  });

  it('reorders composers with the keyboard and keeps focus on the moved row', async () => {
    const initial = {
      basic: { ...basicInfoFromSong(thousandHallelujahs), composers: [brooke, matt, martha] },
    };
    const { user, last } = setup({ initial });
    const down = screen.getByRole('button', { name: `Move ${brooke.name} down` });
    down.focus();
    await user.keyboard('{Enter}');
    expect(composerNames()).toEqual([matt.id, brooke.id, martha.id]);
    expect(document.activeElement?.getAttribute('aria-label')).toBe(`Move ${brooke.name} down`);
    await user.keyboard('{Enter}');
    expect(last()?.composers.map((c) => c.id)).toEqual([matt.id, martha.id, brooke.id]);
    // Down is now disabled; focus falls back to up.
    expect(document.activeElement?.getAttribute('aria-label')).toBe(`Move ${brooke.name} up`);
    expect(screen.getByText(`Moved ${brooke.name} to position 3 of 3`)).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: `Move ${matt.name} up` }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('reorders composers by drag and drop', () => {
    const initial = {
      basic: { ...basicInfoFromSong(thousandHallelujahs), composers: [brooke, matt, martha] },
    };
    setup({ initial });
    const rows = within(screen.getByRole('list', { name: 'Composers in order' })).getAllByRole(
      'listitem',
    ) as [HTMLElement, HTMLElement, HTMLElement];
    const dataTransfer = { setData: vi.fn(), effectAllowed: '', dropEffect: '' };
    fireEvent.dragStart(rows[2], { dataTransfer });
    const over = createEvent.dragOver(rows[0], { dataTransfer });
    fireEvent(rows[0], over);
    expect(over.defaultPrevented).toBe(true);
    fireEvent.drop(rows[0], { dataTransfer });
    fireEvent.dragEnd(rows[2], { dataTransfer });
    expect(composerNames()).toEqual([martha.id, brooke.id, matt.id]);
  });

  it('removes a composer', async () => {
    const initial = {
      basic: { ...basicInfoFromSong(thousandHallelujahs), composers: [brooke, matt] },
    };
    const { user, last } = setup({ initial });
    await user.click(screen.getByRole('button', { name: `Remove ${brooke.name}` }));
    expect(last()?.composers).toEqual([matt]);
  });

  it('renders server field errors and links them to inputs', () => {
    setup({
      errors: {
        title: ['Title is required'],
        'altTitles.0': ['Too long'],
        composerIds: ['Add at least one composer'],
        sourceGroup: ['Too long'],
        year: ['Bad year'],
      },
    });
    const title = screen.getByLabelText('Title');
    expect(title.getAttribute('aria-invalid')).toBe('true');
    const describedBy = title.getAttribute('aria-describedby') ?? '';
    expect(document.getElementById(describedBy)?.textContent).toBe('Title is required');
    expect(screen.getByText('Add at least one composer')).toBeTruthy();
    expect(screen.getByText('Bad year')).toBeTruthy();
    expect(screen.getAllByText('Too long')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Add composer' }).getAttribute('aria-invalid')).toBe(
      'true',
    );
  });

  it('disables every control when disabled', () => {
    setup({ disabled: true, initial: { basic: basicInfoFromSong(thousandHallelujahs) } });
    expect(
      (screen.getByRole('group', { name: 'Basic info' }) as HTMLFieldSetElement).disabled,
    ).toBe(true);
    expect(
      (screen.getByRole('button', { name: 'Add composer' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('caps composers at the schema limit', () => {
    const ten = Array.from({ length: 10 }, (_, i) => ({
      id: `3f000000-0000-4000-8000-00000000000${i}`,
      name: `Composer ${i}`,
      popMember: 'none' as const,
    }));
    setup({ initial: { basic: { ...basicInfoFromSong(thousandHallelujahs), composers: ten } } });
    const btn = screen.getByRole('button', { name: 'Up to 10 composers' }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('ignores a stale search result after the query changes', async () => {
    let resolveFirst: (v: Composer[]) => void = () => {};
    const searchComposers = vi
      .fn<(p: string) => Promise<Composer[]>>()
      .mockImplementationOnce(() => new Promise((r) => (resolveFirst = r)))
      .mockImplementation(async () => [matt]);
    const { user } = setup({ searchComposers });
    await user.click(screen.getByRole('button', { name: 'Add composer' }));
    const input = screen.getByLabelText('Search composers');
    await user.type(input, 'a');
    await waitFor(() => expect(searchComposers).toHaveBeenCalledTimes(1));
    await user.type(input, 'b');
    await screen.findByRole('option', { name: new RegExp(matt.name) });
    await act(async () => resolveFirst([brooke]));
    expect(screen.queryByRole('option', { name: /Brooke/ })).toBeNull();
  });
});

describe('BasicInfoSectionSkeleton', () => {
  it('renders a labelled loading status', () => {
    render(<BasicInfoSectionSkeleton />);
    expect(screen.getByRole('status', { name: 'Loading basic info' })).toBeTruthy();
  });
});
