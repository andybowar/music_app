import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { getSong, SONG_IDS, themes as fixtureThemes } from '@/fixtures';
import type { ActionResult, Theme } from '@/types/domain';
import {
  addSectionTheme,
  generalErrors,
  hasSectionTheme,
  nonEmptySections,
  normalizeThemeName,
  removeSectionTheme,
  sectionErrors,
  sectionForErrorKey,
  ThemesSection,
  ThemesSectionSkeleton,
  type ThemeEntry,
  type ThemesSectionProps,
} from './ThemesSection';
import type { SongFormValue } from './types';

beforeAll(() => {
  // cmdk / Radix need these, jsdom doesn't ship them.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  Element.prototype.scrollIntoView ??= function scrollIntoView() {};
});

const theme = (name: string): Theme => {
  const t = fixtureThemes.find((x) => x.name === name);
  if (!t) throw new Error(`no fixture theme ${name}`);
  return t;
};
const [glory, praise, lamb, holiness] = ['glory', 'praise', 'lamb', 'holiness'].map(theme) as [
  Theme,
  Theme,
  Theme,
  Theme,
];

const agnusDei = getSong(SONG_IDS.agnusDei);
/** Agnus Dei: chorus + verse 1 have lyrics. */
const withLyrics = (themes: ThemeEntry[] = []): Partial<SongFormValue> => ({
  lyrics: { lyrics: { ...agnusDei.lyrics }, arrangement: [...agnusDei.arrangement] },
  themes,
});

function fakeSearch(results: Theme[] = fixtureThemes) {
  return vi.fn(async (prefix: string) =>
    results.filter((t) => t.name.split(' ').some((w) => w.startsWith(prefix))),
  );
}

type Overrides = Partial<Omit<ThemesSectionProps, 'value' | 'onChange'>> & {
  initial?: Partial<SongFormValue>;
};

/** Renders the section with real state so interactions compound like in the form. */
function setup({ initial = withLyrics(), ...props }: Overrides = {}) {
  const changes: Array<Partial<SongFormValue>> = [];
  const searchThemes = props.searchThemes ?? fakeSearch();
  const createTheme =
    props.createTheme ??
    vi.fn(async (name: string): Promise<ActionResult<Theme>> => ({
      ok: true,
      data: { id: '7f000000-0000-4000-8000-000000000001', name },
    }));
  function Harness() {
    const [value, setValue] = useState<Partial<SongFormValue>>(initial);
    return (
      <ThemesSection
        {...props}
        value={value}
        onChange={(patch) => {
          changes.push(patch);
          setValue((v) => ({ ...v, ...patch }));
        }}
        searchThemes={searchThemes}
        createTheme={createTheme}
      />
    );
  }
  const user = userEvent.setup();
  render(<Harness />);
  const last = () => changes.at(-1)?.themes?.map((e) => `${e.section}:${e.theme.name}`);
  return { user, changes, last, searchThemes, createTheme };
}

const sectionBox = (label: string) => screen.getByRole('listitem', { name: label });
const chips = (label: string) =>
  within(sectionBox(label))
    .queryAllByRole('listitem')
    .map((li) => li.textContent);

async function openPicker(user: ReturnType<typeof userEvent.setup>, label: string) {
  await user.click(screen.getByRole('button', { name: `Add theme to ${label}` }));
  return screen.getByLabelText(`Search themes for ${label}`);
}

describe('pure helpers', () => {
  it('normalizeThemeName trims, collapses whitespace and lowercases', () => {
    expect(normalizeThemeName('  Holy   SPIRIT \n')).toBe('holy spirit');
    expect(normalizeThemeName('   ')).toBe('');
  });

  it('adds a theme once per section but allows it on other sections', () => {
    const one = addSectionTheme([], 'chorus', glory);
    expect(one).toEqual({ ok: true, themes: [{ section: 'chorus', theme: glory }] });
    if (!one.ok) throw new Error('unreachable');
    expect(addSectionTheme(one.themes, 'chorus', glory)).toEqual({
      ok: false,
      reason: 'duplicate',
    });
    // Same name, different id (e.g. a stale copy) still counts as a duplicate.
    expect(hasSectionTheme(one.themes, 'chorus', { id: 'x', name: ' Glory ' })).toBe(true);
    const two = addSectionTheme(one.themes, 'bridge', glory);
    expect(two.ok && two.themes).toHaveLength(2);
  });

  it('removes a theme from one section only', () => {
    const entries: ThemeEntry[] = [
      { section: 'chorus', theme: glory },
      { section: 'bridge', theme: glory },
    ];
    expect(removeSectionTheme(entries, 'chorus', glory.id)).toEqual([entries[1]]);
  });

  it('nonEmptySections keeps sections with text, in SECTIONS order', () => {
    expect(nonEmptySections(undefined)).toEqual([]);
    expect(nonEmptySections({ bridge: 'x', verse_1: '  ', chorus: 'y', verse_2: null })).toEqual([
      'chorus',
      'bridge',
    ]);
  });

  it('places server errors on sections by key or entry index', () => {
    const entries: ThemeEntry[] = [
      { section: 'chorus', theme: glory },
      { section: 'verse_1', theme: praise },
    ];
    expect(sectionForErrorKey('themes.1.themeId', entries)).toBe('verse_1');
    expect(sectionForErrorKey('entries.0', entries)).toBe('chorus');
    expect(sectionForErrorKey('themes.bridge', entries)).toBe('bridge');
    expect(sectionForErrorKey('entries.bridge', entries)).toBeNull();
    expect(sectionForErrorKey('themes.9', entries)).toBeNull();
    expect(sectionForErrorKey('themes', entries)).toBeNull();
    expect(sectionForErrorKey('title', entries)).toBeNull();
    const errors = { themes: ['A'], 'themes.0': ['B'], 'themes.9': ['C'], title: ['D'] };
    expect(sectionErrors(errors, entries, 'chorus')).toEqual(['B']);
    expect(sectionErrors(undefined, entries, 'chorus')).toEqual([]);
    expect(generalErrors(errors, entries)).toEqual(['A', 'C']);
    expect(generalErrors(undefined, entries)).toEqual([]);
  });
});

describe('ThemesSection', () => {
  it('shows an empty state when no section has lyrics', () => {
    setup({ initial: {} });
    expect(screen.getByRole('group', { name: 'Themes' })).toBeTruthy();
    expect(screen.getByText(/Add lyrics first/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Add theme/ })).toBeNull();
  });

  it('renders one box per non-empty section with its themes', () => {
    setup({ initial: withLyrics(agnusDei.themes) });
    const boxes = screen.getAllByRole('listitem').filter((li) => li.dataset.section);
    expect(boxes.map((b) => b.dataset.section)).toEqual(['chorus', 'verse_1']);
    expect(chips('Chorus')).toEqual(['holiness', 'worthy', 'lamb']);
    expect(chips('Verse 1')).toEqual(['reigns', 'praise']);
  });

  it('searches with a normalized query and adds the picked theme to that section', async () => {
    const { user, last, searchThemes } = setup();
    const input = await openPicker(user, 'Chorus');
    expect(screen.getByText('Type a theme to search.')).toBeTruthy();
    await user.type(input, '  GLO');
    expect(screen.getByRole('status', { name: 'Searching themes' })).toBeTruthy();
    const option = await screen.findByRole('option', { name: 'glory' });
    expect(searchThemes).toHaveBeenLastCalledWith('glo');
    expect(searchThemes).toHaveBeenCalledTimes(1);
    await user.click(option);
    expect(last()).toEqual(['chorus:glory']);
    expect(chips('Chorus')).toEqual(['glory']);
    expect(chips('Verse 1')).toEqual([]);
    expect(screen.queryByLabelText('Search themes for Chorus')).toBeNull();
    expect(screen.getByText('Added glory to Chorus')).toBeTruthy();
  });

  it('allows the same theme on several sections but hides it where it is already tagged', async () => {
    const { user, last } = setup({ initial: withLyrics([{ section: 'chorus', theme: praise }]) });
    await user.type(await openPicker(user, 'Verse 1'), 'pra');
    await user.click(await screen.findByRole('option', { name: 'praise' }));
    expect(last()).toEqual(['chorus:praise', 'verse_1:praise']);

    await user.type(await openPicker(user, 'Chorus'), 'praise');
    expect(await screen.findByText('Already on Chorus.')).toBeTruthy();
    expect(screen.queryByRole('option', { name: 'praise' })).toBeNull();
    expect(screen.queryByRole('option', { name: /Create/ })).toBeNull();
  });

  it('creates a new theme with the normalized name', async () => {
    const { user, last, createTheme } = setup({ searchThemes: fakeSearch([]) });
    await user.type(await openPicker(user, 'Verse 1'), '  Living   WATER ');
    await user.click(await screen.findByRole('option', { name: 'Create “living water”' }));
    await waitFor(() => expect(last()).toEqual(['verse_1:living water']));
    expect(createTheme).toHaveBeenCalledWith('living water');
  });

  it('offers no create option when a result matches the normalized name', async () => {
    const { user } = setup({ searchThemes: fakeSearch([glory]) });
    await user.type(await openPicker(user, 'Chorus'), 'GLORY ');
    expect(await screen.findByRole('option', { name: 'glory' })).toBeTruthy();
    expect(screen.queryByRole('option', { name: /Create/ })).toBeNull();
  });

  it('does not duplicate when createTheme returns a theme already on the section', async () => {
    // Idempotent create: another tab created "glory" after our search ran.
    const { user, changes } = setup({
      initial: withLyrics([{ section: 'chorus', theme: glory }]),
      searchThemes: vi.fn(async () => []),
      createTheme: vi.fn(async (): Promise<ActionResult<Theme>> => ({ ok: true, data: glory })),
    });
    // Search returns nothing and the typed name differs from "glory", so Create shows.
    await user.type(await openPicker(user, 'Chorus'), 'glory2');
    await user.click(await screen.findByRole('option', { name: /Create/ }));
    await waitFor(() => expect(screen.queryByLabelText('Search themes for Chorus')).toBeNull());
    expect(changes).toHaveLength(0);
    expect(chips('Chorus')).toEqual(['glory']);
  });

  it('keeps the palette open with an error when create fails', async () => {
    const createTheme = vi.fn(async (): Promise<ActionResult<Theme>> => ({
      ok: false,
      error: { code: 'FORBIDDEN', message: 'Not allowed' },
    }));
    const { user, changes } = setup({ searchThemes: fakeSearch([]), createTheme });
    await user.type(await openPicker(user, 'Chorus'), 'new one');
    await user.click(await screen.findByRole('option', { name: /Create/ }));
    expect(await screen.findByText('Not allowed')).toBeTruthy();
    expect(changes).toHaveLength(0);
  });

  it('shows a generic error when create throws', async () => {
    const createTheme = vi.fn(async (): Promise<ActionResult<Theme>> => {
      throw new Error('network');
    });
    const { user } = setup({ searchThemes: fakeSearch([]), createTheme });
    await user.type(await openPicker(user, 'Chorus'), 'new one');
    await user.click(await screen.findByRole('option', { name: /Create/ }));
    expect(await screen.findByText('Something went wrong. Try again.')).toBeTruthy();
  });

  it('shows the error state with retry when search fails', async () => {
    let fail = true;
    const searchThemes = vi.fn(async () => {
      if (fail) throw new Error('down');
      return [glory];
    });
    const { user } = setup({ searchThemes });
    await user.type(await openPicker(user, 'Chorus'), 'g');
    expect(await screen.findByText(/Couldn.t load themes/)).toBeTruthy();
    fail = false;
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('option', { name: 'glory' })).toBeTruthy();
  });

  it('shows a create-only list when search finds nothing', async () => {
    const { user } = setup({ searchThemes: fakeSearch([]) });
    await user.type(await openPicker(user, 'Chorus'), 'zzz');
    expect(await screen.findByRole('option', { name: 'Create “zzz”' })).toBeTruthy();
    expect(screen.getAllByRole('option')).toHaveLength(1);
  });

  it('does not search names over the length limit', async () => {
    const { user, searchThemes } = setup();
    await user.type(await openPicker(user, 'Chorus'), 'x'.repeat(61));
    expect(screen.getByText('Theme names are up to 60 characters.')).toBeTruthy();
    expect(searchThemes).not.toHaveBeenCalled();
  });

  it('ignores a stale search result after the query changes', async () => {
    let resolveFirst: (v: Theme[]) => void = () => {};
    const searchThemes = vi
      .fn<(p: string) => Promise<Theme[]>>()
      .mockImplementationOnce(() => new Promise((r) => (resolveFirst = r)))
      .mockImplementation(async () => [lamb]);
    const { user } = setup({ searchThemes });
    const input = await openPicker(user, 'Chorus');
    await user.type(input, 'l');
    await waitFor(() => expect(searchThemes).toHaveBeenCalledTimes(1));
    await user.type(input, 'a');
    await screen.findByRole('option', { name: 'lamb' });
    await act(async () => resolveFirst([glory]));
    expect(screen.queryByRole('option', { name: 'glory' })).toBeNull();
  });

  it('removes a theme from one section only', async () => {
    const { user, last } = setup({
      initial: withLyrics([
        { section: 'chorus', theme: praise },
        { section: 'verse_1', theme: praise },
      ]),
    });
    await user.click(screen.getByRole('button', { name: 'Remove praise from Chorus' }));
    expect(last()).toEqual(['verse_1:praise']);
    expect(screen.getByText('Removed praise from Chorus')).toBeTruthy();
  });

  it('works with the keyboard alone', async () => {
    const { user, last } = setup();
    const trigger = screen.getByRole('button', { name: 'Add theme to Chorus' });
    trigger.focus();
    await user.keyboard('{Enter}');
    const input = screen.getByLabelText('Search themes for Chorus');
    await waitFor(() => expect(document.activeElement).toBe(input));
    await user.keyboard('hol');
    await screen.findByRole('option', { name: 'holiness' });
    await user.keyboard('{Enter}');
    expect(last()?.[0]).toMatch(/^chorus:hol/);
    // Escape closes without adding.
    screen.getByRole('button', { name: 'Add theme to Chorus' }).focus();
    await user.keyboard('{Enter}');
    await user.keyboard('{Escape}');
    expect(screen.queryByLabelText('Search themes for Chorus')).toBeNull();
    // Remove via keyboard.
    const remove = within(sectionBox('Chorus')).getAllByRole('button', { name: /^Remove / })[0];
    remove?.focus();
    await user.keyboard('{Enter}');
    expect(last()).toEqual([]);
  });

  it('keeps themes on a section that lost its lyrics, removable but not addable', async () => {
    const { user, last } = setup({
      initial: {
        lyrics: { lyrics: { chorus: 'x' }, arrangement: ['chorus'] },
        themes: [{ section: 'bridge', theme: holiness }],
      },
    });
    expect(within(sectionBox('Bridge')).getByText(/This section has no lyrics/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Add theme to Bridge' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Remove holiness from Bridge' }));
    expect(last()).toEqual([]);
    expect(screen.queryByRole('listitem', { name: 'Bridge' })).toBeNull();
  });

  it('renders server field errors on the right section and in general', () => {
    setup({
      initial: withLyrics(agnusDei.themes),
      errors: {
        themes: ['Couldn’t save themes'],
        'themes.0.themeId': ['Theme no longer exists'],
        title: ['Not mine'],
      },
    });
    const chorus = sectionBox('Chorus');
    expect(within(chorus).getByText('Theme no longer exists')).toBeTruthy();
    const trigger = within(chorus).getByRole('button', { name: 'Add theme to Chorus' });
    expect(trigger.getAttribute('aria-invalid')).toBe('true');
    expect(
      document.getElementById(trigger.getAttribute('aria-describedby') ?? '')?.textContent,
    ).toBe('Theme no longer exists');
    expect(within(sectionBox('Verse 1')).queryByText('Theme no longer exists')).toBeNull();
    expect(screen.getByText('Couldn’t save themes')).toBeTruthy();
    expect(screen.queryByText('Not mine')).toBeNull();
  });

  it('disables every control when disabled', () => {
    setup({ disabled: true, initial: withLyrics(agnusDei.themes) });
    expect((screen.getByRole('group', { name: 'Themes' }) as HTMLFieldSetElement).disabled).toBe(
      true,
    );
    expect(
      (screen.getByRole('button', { name: 'Add theme to Chorus' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(
      (screen.getByRole('button', { name: 'Remove lamb from Chorus' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });
});

describe('ThemesSectionSkeleton', () => {
  it('renders a labelled loading status', () => {
    render(<ThemesSectionSkeleton />);
    expect(screen.getByRole('status', { name: 'Loading themes' })).toBeTruthy();
  });
});
