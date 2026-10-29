import '@testing-library/jest-dom/vitest';
import { createEvent, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { getSong, SONG_IDS, thousandHallelujahs } from '@/fixtures';
import { parseLyrics } from '@/lib/lyrics/parse';
import type { Section } from '@/types/domain';
import {
  addToArrangement,
  emptyLyrics,
  hasAnyLyrics,
  lyricsFromParse,
  lyricsFromSong,
  LyricsSection,
  LyricsSectionSkeleton,
  setSectionText,
  versesInUse,
  type LyricsSectionProps,
} from './LyricsSection';
import type { SongFormValue } from './types';

type Overrides = Partial<Omit<LyricsSectionProps, 'value' | 'onChange'>> & {
  initial?: Partial<SongFormValue>;
};

/** Renders the section with real state so interactions compound like in the form. */
function setup({ initial = {}, ...props }: Overrides = {}) {
  const changes: Array<Partial<SongFormValue>> = [];
  function Harness() {
    const [value, setValue] = useState<Partial<SongFormValue>>(initial);
    return (
      <LyricsSection
        {...props}
        value={value}
        onChange={(patch) => {
          changes.push(patch);
          setValue((v) => ({ ...v, ...patch }));
        }}
      />
    );
  }
  const user = userEvent.setup();
  render(<Harness />);
  const last = () => changes.at(-1)?.lyrics;
  return { user, changes, last };
}

const placeholder = (section: string) => `Made-up ${section} line`;
const field = (label: string) => screen.getByLabelText(label, { selector: 'textarea' });
const order = () =>
  screen.queryByRole('list', { name: 'Order as sung' })
    ? within(screen.getByRole('list', { name: 'Order as sung' }))
        .getAllByRole('listitem')
        .map((li) => li.querySelector('.font-medium')?.textContent)
    : [];
const song = () => lyricsFromSong(thousandHallelujahs);

describe('pure helpers', () => {
  it('setSectionText stores null for "" and strips the arrangement when blank', () => {
    const start = song();
    const typed = setSectionText(start, 'chorus', 'x');
    expect(typed.removed).toBe(0);
    expect(typed.value.lyrics.chorus).toBe('x');
    expect(typed.value.arrangement).toEqual(start.arrangement);
    const cleared = setSectionText(start, 'chorus', '');
    expect(cleared.value.lyrics.chorus).toBeNull();
    expect(cleared.removed).toBe(3);
    expect(cleared.value.arrangement).not.toContain('chorus');
    expect(setSectionText(start, 'bridge', '   ').removed).toBe(1);
  });

  it('addToArrangement allows repeats but not blank sections or more than 30', () => {
    const start = song();
    expect(addToArrangement(start, 'chorus')).toEqual([...start.arrangement, 'chorus']);
    expect(addToArrangement(start, 'verse_4')).toBeNull();
    const full = { ...start, arrangement: Array<Section>(30).fill('chorus') };
    expect(addToArrangement(full, 'chorus')).toBeNull();
  });

  it('versesInUse counts filled, arranged and errored verses', () => {
    expect(versesInUse(emptyLyrics())).toBe(2);
    expect(versesInUse({ lyrics: { verse_4: 'x' }, arrangement: [] })).toBe(4);
    expect(versesInUse({ lyrics: {}, arrangement: ['verse_3'] })).toBe(3);
    expect(versesInUse(emptyLyrics(), ['lyrics.verse_5'])).toBe(5);
  });

  it('hasAnyLyrics and lyricsFromParse', () => {
    expect(hasAnyLyrics(emptyLyrics())).toBe(false);
    expect(hasAnyLyrics({ lyrics: { chorus: '  ' }, arrangement: [] })).toBe(false);
    expect(hasAnyLyrics(song())).toBe(true);
    const next = lyricsFromParse(parseLyrics('Chorus\nla la'));
    expect(next.lyrics).toEqual({
      chorus: 'la la',
      verse_1: null,
      verse_2: null,
      verse_3: null,
      verse_4: null,
      verse_5: null,
      bridge: null,
    });
    expect(next.arrangement).toEqual(['chorus']);
  });
});

describe('LyricsSection', () => {
  it('types into each section and sends the whole lyrics slice', async () => {
    const { user, last } = setup();
    await user.click(screen.getByRole('button', { name: 'Add verse 3' }));
    await user.click(screen.getByRole('button', { name: 'Add verse 4' }));
    await user.click(screen.getByRole('button', { name: 'Add verse 5' }));
    for (const label of [
      'Verse 1',
      'Verse 2',
      'Verse 3',
      'Verse 4',
      'Verse 5',
      'Chorus',
      'Bridge',
    ]) {
      await user.type(field(label), placeholder(label));
    }
    expect(last()?.lyrics).toMatchObject({
      verse_1: placeholder('Verse 1'),
      verse_5: placeholder('Verse 5'),
      chorus: placeholder('Chorus'),
      bridge: placeholder('Bridge'),
    });
    expect(last()?.arrangement).toEqual([]);
  });

  it('keeps verses 3–5 collapsed until used, and focuses a revealed verse', async () => {
    const { user } = setup();
    expect(screen.queryByLabelText('Verse 3')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Add verse 3' }));
    expect(field('Verse 3')).toHaveFocus();
    expect(screen.queryByLabelText('Verse 4')).toBeNull();
  });

  it('shows filled later verses straight away', () => {
    setup({ initial: { lyrics: lyricsFromSong(getSong(SONG_IDS.amazingGrace)) } });
    expect(field('Verse 5')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Add verse/ })).toBeNull();
  });

  it('offers chips only for non-empty sections and allows repeats', async () => {
    const { user, last } = setup();
    expect(screen.getByText('Type lyrics in a section to add it to the order.')).toBeVisible();
    await user.type(field('Chorus'), 'la');
    await user.type(field('Verse 1'), 'da');
    const chips = within(screen.getByRole('list', { name: 'Sections to add' }));
    expect(chips.getAllByRole('button').map((b) => b.textContent)).toEqual(['Chorus', 'Verse 1']);
    await user.click(chips.getByRole('button', { name: 'Add Verse 1 to the order' }));
    await user.click(chips.getByRole('button', { name: 'Add Chorus to the order' }));
    await user.click(chips.getByRole('button', { name: 'Add Chorus to the order' }));
    expect(last()?.arrangement).toEqual(['verse_1', 'chorus', 'chorus']);
    expect(order()).toEqual(['Verse 1', 'Chorus', 'Chorus']);
  });

  it('removes and reorders entries with buttons', async () => {
    const { user, last } = setup({ initial: { lyrics: song() } });
    await user.click(screen.getByRole('button', { name: 'Remove Bridge (position 5)' }));
    expect(last()?.arrangement).toEqual(['verse_1', 'chorus', 'verse_2', 'chorus', 'chorus']);
    await user.click(screen.getByRole('button', { name: 'Move Verse 1 (position 1) down' }));
    expect(last()?.arrangement).toEqual(['chorus', 'verse_1', 'verse_2', 'chorus', 'chorus']);
    expect(screen.getByRole('button', { name: 'Move Verse 1 (position 2) down' })).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Move Chorus (position 1) up' })).toBeDisabled();
  });

  it('reorders with the keyboard and keeps focus on the moved row', async () => {
    const { user, last } = setup({ initial: { lyrics: song() } });
    screen.getByRole('button', { name: 'Move Chorus (position 6) up' }).focus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('button', { name: 'Move Chorus (position 5) up' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(last()?.arrangement).toEqual([
      'verse_1',
      'chorus',
      'verse_2',
      'chorus',
      'chorus',
      'bridge',
    ]);
    // At the top, focus falls back to the other arrow.
    screen.getByRole('button', { name: 'Move Chorus (position 2) up' }).focus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('button', { name: 'Move Chorus (position 1) down' })).toHaveFocus();
    expect(screen.getByText(/Moved Chorus to position 1 of 6/)).toBeInTheDocument();
  });

  it('reorders by drag and drop', () => {
    setup({ initial: { lyrics: song() } });
    const rows = within(screen.getByRole('list', { name: 'Order as sung' })).getAllByRole(
      'listitem',
    );
    const dataTransfer = { setData() {}, effectAllowed: '', dropEffect: '' };
    const start = createEvent.dragStart(rows[4]!);
    Object.defineProperty(start, 'dataTransfer', { value: dataTransfer });
    fireEvent(rows[4]!, start);
    const over = createEvent.dragOver(rows[0]!);
    Object.defineProperty(over, 'dataTransfer', { value: dataTransfer });
    fireEvent(rows[0]!, over);
    fireEvent.drop(rows[0]!);
    expect(order()).toEqual(['Bridge', 'Verse 1', 'Chorus', 'Verse 2', 'Chorus', 'Chorus']);
  });

  it('emptying a section removes it from the order with a warning, and can put it back', async () => {
    const { user, last } = setup({ initial: { lyrics: song() } });
    await user.clear(field('Chorus'));
    expect(last()?.arrangement).toEqual(['verse_1', 'verse_2', 'bridge']);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Chorus is empty, so it was taken out of the order (3 times).',
    );
    expect(screen.queryByRole('button', { name: 'Add Chorus to the order' })).toBeNull();
    await user.type(field('Chorus'), 'new words');
    await user.click(screen.getByRole('button', { name: 'Put it back' }));
    expect(last()?.arrangement).toEqual(song().arrangement);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('dismisses the removal warning', async () => {
    const { user } = setup({ initial: { lyrics: song() } });
    await user.clear(field('Bridge'));
    expect(screen.getByRole('alert')).toHaveTextContent('Bridge is empty');
    await user.click(screen.getByRole('button', { name: 'Dismiss warning' }));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('enforces the 5000-character and 30-entry limits', async () => {
    const long = 'x'.repeat(5001);
    const { user } = setup({
      initial: {
        lyrics: {
          lyrics: { chorus: long, verse_1: 'a' },
          arrangement: Array<Section>(30).fill('verse_1'),
        },
      },
    });
    expect(field('Chorus')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Chorus is 5001 characters; the limit is 5000')).toBeVisible();
    expect(field('Verse 1')).toHaveAttribute('maxLength', '5000');
    expect(screen.getByText('The order is full (30 sections).')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Add Verse 1 to the order' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Remove Verse 1 (position 30)' }));
    expect(screen.getByRole('button', { name: 'Add Verse 1 to the order' })).toBeEnabled();
  });

  it('shows server field errors on sections and the order, revealing errored verses', () => {
    setup({
      initial: { lyrics: { lyrics: { chorus: 'a' }, arrangement: ['chorus', 'bridge'] } },
      errors: {
        'lyrics.verse_4': ['Too long'],
        'arrangement.1': ['Arrangement uses bridge, which has no lyrics'],
        arrangement: ['Too many entries'],
      },
    });
    expect(field('Verse 4')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Too long')).toBeVisible();
    expect(screen.getByText('Arrangement uses bridge, which has no lyrics')).toBeVisible();
    expect(screen.getByText('Too many entries')).toBeVisible();
    expect(screen.getByText('No lyrics')).toBeVisible();
  });

  it('paste dialog splits lyrics and shows parser warnings', async () => {
    const { user, last } = setup();
    await user.click(screen.getByRole('button', { name: 'Paste full lyrics' }));
    const dialog = within(screen.getByRole('dialog'));
    expect(dialog.getByRole('button', { name: 'Split into sections' })).toBeDisabled();
    await user.type(
      dialog.getByLabelText('Lyrics with headings'),
      'Made-up opener{Enter}{Enter}Chorus{Enter}Sing la la{Enter}{Enter}Tag{Enter}Oh oh{Enter}{Enter}Chorus',
    );
    await user.click(dialog.getByRole('button', { name: 'Split into sections' }));
    expect(dialog.getByRole('list', { name: 'Sections found' })).toHaveTextContent(
      'Chorus:Sing la la',
    );
    expect(dialog.getByText('Verse 1, Chorus, Chorus')).toBeVisible();
    const warnings = dialog.getByRole('list', { name: 'Warnings' });
    expect(warnings).toHaveTextContent('Text before the first heading was put in Verse 1.');
    expect(warnings).toHaveTextContent('"Tag" has no field of its own');
    await user.click(dialog.getByRole('button', { name: 'Use these lyrics' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(last()?.lyrics.chorus).toBe('Sing la la\n\nOh oh');
    expect(last()?.arrangement).toEqual(['verse_1', 'chorus', 'chorus']);
    expect(field('Verse 1')).toHaveValue('Made-up opener');
  });

  it('paste asks before overwriting existing lyrics', async () => {
    const { user, changes, last } = setup({ initial: { lyrics: song() } });
    await user.click(screen.getByRole('button', { name: 'Paste full lyrics' }));
    const dialog = within(screen.getByRole('dialog'));
    await user.type(dialog.getByLabelText('Lyrics with headings'), 'Verse 4{Enter}Placeholder');
    await user.click(dialog.getByRole('button', { name: 'Split into sections' }));
    await user.click(dialog.getByRole('button', { name: 'Use these lyrics' }));
    expect(dialog.getByRole('alert')).toHaveTextContent('This replaces the lyrics and order');
    expect(changes).toHaveLength(0);
    await user.click(dialog.getByRole('button', { name: 'Replace lyrics' }));
    expect(last()?.lyrics.chorus).toBeNull();
    expect(last()?.arrangement).toEqual(['verse_4']);
    expect(field('Verse 4')).toHaveValue('Placeholder');
  });

  it('cancelling the paste dialog changes nothing and resets it', async () => {
    const { user, changes } = setup({ initial: { lyrics: song() } });
    await user.click(screen.getByRole('button', { name: 'Paste full lyrics' }));
    let dialog = within(screen.getByRole('dialog'));
    await user.type(dialog.getByLabelText('Lyrics with headings'), 'Chorus{Enter}x');
    await user.click(dialog.getByRole('button', { name: 'Split into sections' }));
    await user.click(dialog.getByRole('button', { name: 'Back' }));
    expect(dialog.getByLabelText('Lyrics with headings')).toHaveValue('Chorus\nx');
    await user.click(dialog.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(changes).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: 'Paste full lyrics' }));
    dialog = within(screen.getByRole('dialog'));
    expect(dialog.getByLabelText('Lyrics with headings')).toHaveValue('');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('is fully disabled while saving', () => {
    setup({ initial: { lyrics: song() }, disabled: true });
    expect(field('Chorus')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Paste full lyrics' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Remove Bridge (position 5)' })).toBeDisabled();
  });

  it('renders a loading skeleton', () => {
    render(<LyricsSectionSkeleton />);
    expect(screen.getByRole('status', { name: 'Loading lyrics' })).toBeInTheDocument();
  });
});
