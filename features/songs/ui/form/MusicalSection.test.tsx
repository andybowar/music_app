import '@testing-library/jest-dom/vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeAll, describe, expect, it } from 'vitest';
import { getSong, SONG_IDS, songs, thousandHallelujahs } from '@/fixtures';
import { ENERGY_LEVELS, ENERGY_META } from '@/types/domain';
import { songInputSchema, songKeysInputSchema } from '@/types/validation';
import {
  emptyMusicalInfo,
  isValidChord,
  isValidTimeSignature,
  joinKey,
  MESSAGES,
  MUSICAL_LIMITS,
  musicalInfoFromSong,
  MusicalSection,
  MusicalSectionSkeleton,
  newKeyRow,
  parseTempo,
  removeKey,
  setPrimary,
  splitKey,
  tempoInRange,
  validateMusical,
  type MusicalSectionProps,
  type MusicalValue,
} from './MusicalSection';
import type { SongFormValue } from './types';

beforeAll(() => {
  // Radix Select needs these; jsdom doesn't ship them.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  Element.prototype.scrollIntoView ??= function scrollIntoView() {};
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.releasePointerCapture ??= () => {};
});

const editing = musicalInfoFromSong(thousandHallelujahs);

type Overrides = Partial<Omit<MusicalSectionProps, 'value' | 'onChange'>> & {
  initial?: Partial<SongFormValue>;
};

/** Renders the section with real state so interactions compound like in the form. */
function setup({ initial = {}, ...props }: Overrides = {}) {
  const changes: Array<Partial<SongFormValue>> = [];
  function Harness() {
    const [value, setValue] = useState<Partial<SongFormValue>>(initial);
    return (
      <MusicalSection
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
  const last = () => changes.at(-1)?.musical as MusicalValue;
  return { user, changes, last };
}

/** Server-side truth for the slice, so client validation can be compared with it. */
function serverAccepts(m: MusicalValue) {
  const song = songInputSchema.safeParse({
    title: 'T',
    composerIds: ['30000000-0000-4000-8000-000000000001'],
    tempoBpm: m.tempoBpm,
    timeSignature: m.timeSignature,
    energyLevel: m.energyLevel,
    energyNotes: m.energyNotes,
  }).success;
  const keys = songKeysInputSchema.safeParse(
    m.keys.map(({ key, isPrimary, firstChords }) => ({ key, isPrimary, firstChords })),
  ).success;
  return song && keys;
}

// ---------- Pure helpers ----------

describe('helpers', () => {
  it('splitKey / joinKey round-trip major and minor keys', () => {
    expect(splitKey('F#m')).toEqual({ root: 'F#', minor: true });
    expect(splitKey('Bb')).toEqual({ root: 'Bb', minor: false });
    expect(splitKey('')).toEqual({ root: '', minor: false });
    expect(joinKey('F#', true)).toBe('F#m');
    expect(joinKey('D', false)).toBe('D');
    expect(joinKey('', true)).toBe('');
  });

  it('parseTempo accepts whole numbers only', () => {
    expect(parseTempo('72')).toBe(72);
    expect(parseTempo(' 120 ')).toBe(120);
    expect(parseTempo('')).toBeNull();
    expect(parseTempo('7.5')).toBeNull();
    expect(parseTempo('abc')).toBeNull();
    expect(parseTempo('1000')).toBeNull();
  });

  it('tempo boundaries match songInputSchema (20–300)', () => {
    for (const bpm of [19, 20, 300, 301, 72.5]) {
      const expected = songInputSchema.safeParse({
        title: 'T',
        composerIds: ['30000000-0000-4000-8000-000000000001'],
        tempoBpm: bpm,
      }).success;
      expect(tempoInRange(bpm), String(bpm)).toBe(expected);
    }
    expect(tempoInRange(20)).toBe(true);
    expect(tempoInRange(300)).toBe(true);
    expect(tempoInRange(19)).toBe(false);
    expect(tempoInRange(301)).toBe(false);
  });

  it('chord and time signature checks match the schema regexes', () => {
    for (const c of ['G', 'Bm7', 'D/F#', 'Asus4', 'Cmaj7(9)', 'Gb'])
      expect(isValidChord(c)).toBe(true);
    for (const c of ['H', 'g', 'D/', 'Cmaj7add9add11', 'X']) expect(isValidChord(c)).toBe(false);
    for (const t of ['4/4', '6/8', '12/8']) expect(isValidTimeSignature(t)).toBe(true);
    for (const t of ['4', '4/', '123/4', 'four']) expect(isValidTimeSignature(t)).toBe(false);
  });

  it('setPrimary leaves exactly one primary', () => {
    const next = setPrimary(editing.keys, 2);
    expect(next.map((k) => k.isPrimary)).toEqual([false, false, true]);
  });

  it('removeKey promotes the first remaining key when the primary is removed', () => {
    expect(removeKey(editing.keys, 0).map((k) => [k.key, k.isPrimary])).toEqual([
      ['Db', true],
      ['E', false],
    ]);
    expect(removeKey(editing.keys, 1).map((k) => [k.key, k.isPrimary])).toEqual([
      ['D', true],
      ['E', false],
    ]);
    expect(removeKey([newKeyRow(true)], 0)).toEqual([]);
    expect(removeKey(editing.keys, 9)).toHaveLength(3);
  });

  it('musicalInfoFromSong copies keys so edits do not alias the fixture', () => {
    const m = musicalInfoFromSong(thousandHallelujahs);
    expect(m.tempoBpm).toBe(68);
    expect(m.keys[0]?.firstChords).not.toBe(thousandHallelujahs.keys[0]?.firstChords);
    expect(emptyMusicalInfo()).not.toBe(emptyMusicalInfo());
  });
});

describe('validateMusical', () => {
  it('accepts every fixture song, like the server', () => {
    for (const s of songs) {
      const m = musicalInfoFromSong(s);
      expect(validateMusical(m), s.title).toEqual({});
      expect(serverAccepts(m), s.title).toBe(true);
    }
  });

  it('requires at least one key and exactly one primary', () => {
    expect(validateMusical(emptyMusicalInfo())).toEqual({ keys: [MESSAGES.noKeys] });
    const none = { ...editing, keys: editing.keys.map((k) => ({ ...k, isPrimary: false })) };
    expect(validateMusical(none)).toEqual({ keys: [MESSAGES.noPrimary] });
    expect(serverAccepts(none)).toBe(false);
    const two = { ...editing, keys: editing.keys.map((k, i) => ({ ...k, isPrimary: i < 2 })) };
    expect(validateMusical(two)).toEqual({ keys: [MESSAGES.manyPrimaries] });
    expect(serverAccepts(two)).toBe(false);
  });

  it('flags a missing, duplicate or invalid key on its row', () => {
    const keys = [...editing.keys, newKeyRow(false), { ...newKeyRow(false), key: 'D' }];
    expect(validateMusical({ ...editing, keys })).toEqual({
      'keys.3.key': [MESSAGES.chooseKey],
      'keys.4.key': [MESSAGES.duplicateKey('D')],
    });
    expect(validateMusical({ ...editing, keys: [{ ...newKeyRow(true), key: 'H' }] })).toEqual({
      'keys.0.key': [MESSAGES.invalidKey],
    });
  });

  it('caps keys at 12', () => {
    const keys = Array.from({ length: 13 }, (_, i) => ({
      ...newKeyRow(i === 0),
      key: ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B', 'Cm'][i] ?? '',
    }));
    expect(validateMusical({ ...editing, keys })).toEqual({ keys: [MESSAGES.tooManyKeys] });
    expect(validateMusical({ ...editing, keys: keys.slice(0, 12) })).toEqual({});
  });

  it('checks chords, tempo, time signature and notes length at the schema limits', () => {
    const [first, ...rest] = editing.keys;
    const badChord = [{ ...first!, firstChords: { ...first!.firstChords, verse: 'Q' } }, ...rest];
    const bad: MusicalValue = {
      keys: badChord,
      tempoBpm: 301,
      timeSignature: '4',
      energyLevel: 'high_praise',
      energyNotes: 'x'.repeat(501),
    };
    expect(validateMusical(bad)).toEqual({
      'keys.0.firstChords.verse': [MESSAGES.chord],
      tempoBpm: [MESSAGES.tempo],
      timeSignature: [MESSAGES.timeSignature],
      energyNotes: [MESSAGES.energyNotes],
    });
    expect(serverAccepts(bad)).toBe(false);
    const edge: MusicalValue = {
      ...editing,
      tempoBpm: 20,
      timeSignature: '12/8',
      energyNotes: 'x'.repeat(500),
    };
    expect(validateMusical(edge)).toEqual({});
    expect(serverAccepts(edge)).toBe(true);
    expect(validateMusical({ ...edge, tempoBpm: 19 })).toEqual({ tempoBpm: [MESSAGES.tempo] });
  });
});

// ---------- Component ----------

describe('MusicalSection', () => {
  it('renders an empty new-song state', () => {
    setup();
    expect(screen.getByRole('group', { name: 'Musical tags' })).toBeInTheDocument();
    expect(screen.getByText('No keys yet. Add at least one.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add key' })).toBeInTheDocument();
    expect(screen.getByLabelText(/^Tempo \(BPM\)/)).toHaveValue('');
    expect(screen.getByLabelText(/Energy level/)).toHaveTextContent('Not set');
    // No primary error before any key exists.
    expect(screen.queryByText(MESSAGES.noPrimary)).not.toBeInTheDocument();
  });

  it('shows an existing song: keys, primary, chords, tempo, energy, notes', () => {
    setup({ initial: { musical: editing } });
    const rows = within(screen.getByRole('list', { name: 'Keys' })).getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    expect(screen.getByRole('radio', { name: 'Primary key (D)' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Primary key (D flat)' })).not.toBeChecked();
    expect(screen.getByLabelText('Chorus first chord in D')).toHaveValue('G');
    expect(screen.getByLabelText('Bridge first chord in D flat')).toHaveValue('');
    expect(screen.getByLabelText(/^Tempo \(BPM\)/)).toHaveValue('68');
    expect(screen.getByLabelText(/Time signature/)).toHaveValue('4/4');
    expect(screen.getByLabelText(/Energy level/)).toHaveTextContent(ENERGY_META.mid_worship.label);
    expect(screen.getByLabelText(/Energy notes/)).toHaveValue(thousandHallelujahs.energyNotes);
    expect(
      screen.getByRole('img', { name: `68 BPM, ${ENERGY_META.mid_worship.label}` }),
    ).toBeVisible();
  });

  it('adds the first key as primary and focuses its key select', async () => {
    const { user, last } = setup();
    await user.click(screen.getByRole('button', { name: 'Add key' }));
    expect(last().keys).toEqual([newKeyRow(true)]);
    const trigger = screen.getByRole('combobox', { name: 'Key' });
    expect(trigger).toHaveFocus();
    await user.click(trigger);
    await user.click(screen.getByRole('option', { name: 'Eb' }));
    expect(last().keys[0]?.key).toBe('Eb');
    await user.click(screen.getByRole('checkbox', { name: /Minor/ }));
    expect(last().keys[0]?.key).toBe('Ebm');
    await user.click(screen.getByRole('checkbox', { name: /Minor/ }));
    expect(last().keys[0]?.key).toBe('Eb');
    expect(screen.getByRole('button', { name: 'Add alternate key' })).toBeInTheDocument();
  });

  it('disables the minor toggle until a key is chosen', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: 'Add key' }));
    expect(screen.getByRole('checkbox', { name: 'Minor' })).toBeDisabled();
  });

  it('adds alternates as non-primary and moves primary with the radio', async () => {
    const { user, last } = setup({ initial: { musical: editing } });
    await user.click(screen.getByRole('button', { name: 'Add alternate key' }));
    expect(last().keys).toHaveLength(4);
    expect(last().keys[3]?.isPrimary).toBe(false);
    await user.click(screen.getByRole('radio', { name: 'Primary key (E)' }));
    expect(last().keys.map((k) => k.isPrimary)).toEqual([false, false, true, false]);
  });

  it('moves primary with arrow keys (native radio group)', async () => {
    const { user, last } = setup({ initial: { musical: editing } });
    screen.getByRole('radio', { name: 'Primary key (D)' }).focus();
    await user.keyboard('{ArrowDown}');
    expect(last().keys.map((k) => k.isPrimary)).toEqual([false, true, false]);
  });

  it('removing the primary promotes the next key', async () => {
    const { user, last } = setup({ initial: { musical: editing } });
    await user.click(screen.getByRole('button', { name: 'Remove key D' }));
    expect(last().keys.map((k) => [k.key, k.isPrimary])).toEqual([
      ['Db', true],
      ['E', false],
    ]);
    expect(screen.getByText('Removed key D. D flat is now primary')).toBeInTheDocument();
  });

  it('removing the last key returns to the empty state', async () => {
    const { user, last } = setup({
      initial: { musical: { ...editing, keys: [editing.keys[0]!] } },
    });
    await user.click(screen.getByRole('button', { name: 'Remove key D' }));
    expect(last().keys).toEqual([]);
    expect(screen.getByText('No keys yet. Add at least one.')).toBeInTheDocument();
  });

  it('shows an inline error for zero primaries', () => {
    setup({
      initial: {
        musical: { ...editing, keys: editing.keys.map((k) => ({ ...k, isPrimary: false })) },
      },
    });
    const group = screen.getByRole('group', { name: /^Keys/ });
    expect(within(group).getByText(MESSAGES.noPrimary)).toBeInTheDocument();
    expect(group).toHaveAccessibleDescription(MESSAGES.noPrimary);
  });

  it('shows an inline error for two primaries, cleared by choosing one', async () => {
    const { user } = setup({
      initial: {
        musical: { ...editing, keys: editing.keys.map((k, i) => ({ ...k, isPrimary: i < 2 })) },
      },
    });
    expect(screen.getByText(MESSAGES.manyPrimaries)).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'Primary key (E)' }));
    expect(screen.queryByText(MESSAGES.manyPrimaries)).not.toBeInTheDocument();
  });

  it('flags a duplicate key on the later row', async () => {
    const { user } = setup({ initial: { musical: editing } });
    await user.click(screen.getByRole('button', { name: 'Add alternate key' }));
    const triggers = screen.getAllByRole('combobox', { name: 'Key' });
    await user.click(triggers[3]!);
    await user.click(screen.getByRole('option', { name: 'E' }));
    expect(screen.getByText(MESSAGES.duplicateKey('E'))).toBeInTheDocument();
    expect(triggers[3]).toHaveAttribute('aria-invalid', 'true');
    expect(triggers[2]).not.toHaveAttribute('aria-invalid');
  });

  it('caps keys at 12', () => {
    const keys = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'].map(
      (key, i) => ({
        ...newKeyRow(i === 0),
        key,
      }),
    );
    setup({ initial: { musical: { ...editing, keys } } });
    expect(screen.getByRole('button', { name: MESSAGES.tooManyKeys })).toBeDisabled();
  });

  it('keeps a valid key outside MAJOR_KEYS selectable', () => {
    setup({ initial: { musical: { ...editing, keys: [{ ...newKeyRow(true), key: 'A#m' }] } } });
    expect(screen.getByRole('combobox', { name: 'Key' })).toHaveTextContent('A#');
    expect(screen.getByRole('checkbox', { name: /Minor/ })).toBeChecked();
  });

  it('edits chords, clears them to null and validates on blur', async () => {
    const { user, last } = setup({ initial: { musical: editing } });
    const bridge = screen.getByLabelText('Bridge first chord in D flat');
    await user.type(bridge, 'D b/F');
    expect(last().keys[1]?.firstChords.bridge).toBe('Db/F');
    await user.clear(bridge);
    expect(last().keys[1]?.firstChords.bridge).toBeNull();
    await user.type(bridge, 'Q');
    expect(screen.queryByText(MESSAGES.chord)).not.toBeInTheDocument();
    await user.tab();
    expect(screen.getByText(MESSAGES.chord)).toBeInTheDocument();
    expect(bridge).toHaveAttribute('aria-invalid', 'true');
    expect(bridge).toHaveAttribute('maxLength', String(MUSICAL_LIMITS.chordMax));
  });

  it('tempo: parses, clears to null, validates 20–300 on blur', async () => {
    const { user, last } = setup({ initial: { musical: editing } });
    const tempo = screen.getByLabelText(/^Tempo \(BPM\)/);
    await user.clear(tempo);
    expect(last().tempoBpm).toBeNull();
    await user.type(tempo, '19');
    await user.tab();
    expect(screen.getByText(MESSAGES.tempo)).toBeInTheDocument();
    expect(tempo).toHaveAttribute('aria-invalid', 'true');
    await user.clear(tempo);
    await user.type(tempo, '20');
    await user.tab();
    expect(last().tempoBpm).toBe(20);
    expect(screen.queryByText(MESSAGES.tempo)).not.toBeInTheDocument();
    await user.clear(tempo);
    await user.type(tempo, '301');
    await user.tab();
    expect(screen.getByText(MESSAGES.tempo)).toBeInTheDocument();
    await user.clear(tempo);
    await user.type(tempo, '300');
    await user.tab();
    expect(screen.queryByText(MESSAGES.tempo)).not.toBeInTheDocument();
    await user.clear(tempo);
    await user.type(tempo, 'ab');
    expect(last().tempoBpm).toBeNull();
  });

  it('time signature: edits, clears to null, validates on blur', async () => {
    const { user, last } = setup({ initial: { musical: editing } });
    const ts = screen.getByLabelText(/Time signature/);
    await user.clear(ts);
    expect(last().timeSignature).toBeNull();
    await user.type(ts, '6');
    await user.tab();
    expect(screen.getByText(MESSAGES.timeSignature)).toBeInTheDocument();
    await user.type(ts, '/8');
    expect(screen.queryByText(MESSAGES.timeSignature)).not.toBeInTheDocument();
    await user.tab();
    expect(last().timeSignature).toBe('6/8');
    expect(screen.queryByText(MESSAGES.timeSignature)).not.toBeInTheDocument();
  });

  it('energy select lists every level with its exact label and a swatch, and clears to null', async () => {
    const { user, last } = setup({ initial: { musical: editing } });
    const trigger = screen.getByLabelText(/Energy level/);
    await user.click(trigger);
    const options = screen.getAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual([
      'Not set',
      ...ENERGY_LEVELS.map((l) => ENERGY_META[l].label),
    ]);
    expect(options[1]?.querySelector('[data-swatch="high_praise"]')).not.toBeNull();
    await user.click(screen.getByRole('option', { name: ENERGY_META.high_praise.label }));
    expect(last().energyLevel).toBe('high_praise');
    await user.click(trigger);
    await user.click(screen.getByRole('option', { name: 'Not set' }));
    expect(last().energyLevel).toBeNull();
  });

  it('energy select works from the keyboard', async () => {
    const { user, last } = setup({ initial: { musical: { ...editing, energyLevel: null } } });
    screen.getByLabelText(/Energy level/).focus();
    await user.keyboard('{Enter}');
    await user.keyboard('{ArrowDown}{Enter}');
    expect(last().energyLevel).toBe('high_praise');
  });

  it('energy notes: edits, clears to null, counts, capped at 500', async () => {
    const { user, last } = setup();
    const notes = screen.getByLabelText(/Energy notes/);
    expect(notes).toHaveAttribute('maxLength', '500');
    await user.type(notes, 'Big bridge');
    expect(last().energyNotes).toBe('Big bridge');
    expect(screen.getByText('10/500 characters')).toBeInTheDocument();
    await user.clear(notes);
    expect(last().energyNotes).toBeNull();
  });

  it('sends only the musical slice, preserving other fields', async () => {
    const { user, changes } = setup({ initial: { musical: editing } });
    await user.type(screen.getByLabelText(/^Tempo \(BPM\)/), '0');
    expect(Object.keys(changes.at(-1)!)).toEqual(['musical']);
    expect(changes.at(-1)?.musical?.keys).toEqual(editing.keys);
  });

  it('shows server field errors next to each field', () => {
    setup({
      initial: { musical: editing },
      errors: {
        keys: ['Exactly one key must be primary'],
        'keys.1.key': ['Duplicate key Db'],
        'keys.2.firstChords.chorus': ['Invalid chord'],
        'keys.0': ['Key row problem'],
        tempoBpm: ['Too fast'],
        timeSignature: ['Bad time signature'],
        energyLevel: ['Bad energy'],
        energyNotes: ['Too long'],
      },
    });
    expect(screen.getByText('Exactly one key must be primary')).toBeInTheDocument();
    expect(screen.getAllByRole('combobox', { name: 'Key' })[1]).toHaveAccessibleDescription(
      'Duplicate key Db',
    );
    expect(screen.getByLabelText('Chorus first chord in E')).toHaveAccessibleDescription(
      'Invalid chord',
    );
    expect(screen.getByText('Key row problem')).toBeInTheDocument();
    expect(screen.getByLabelText(/^Tempo \(BPM\)/)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Too fast')).toBeInTheDocument();
    expect(screen.getByLabelText(/Time signature/)).toHaveAccessibleDescription(
      'Bad time signature',
    );
    expect(screen.getByLabelText(/Energy level/)).toHaveAccessibleDescription('Bad energy');
    expect(screen.getByText('Too long')).toBeInTheDocument();
  });

  it('disables every control while saving', () => {
    setup({ initial: { musical: editing }, disabled: true });
    expect(screen.getByLabelText(/^Tempo \(BPM\)/)).toBeDisabled();
    expect(screen.getByLabelText(/Energy level/)).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Add alternate key' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Remove key D' })).toBeDisabled();
    expect(screen.getByRole('radio', { name: 'Primary key (D)' })).toBeDisabled();
  });

  it('works with another fixture song', () => {
    setup({ initial: { musical: musicalInfoFromSong(getSong(SONG_IDS.beTheCenter)) } });
    expect(screen.getByLabelText(/Energy level/)).toHaveTextContent(
      ENERGY_META.quiet_worship.label,
    );
  });
});

describe('MusicalSectionSkeleton', () => {
  it('announces loading', () => {
    render(<MusicalSectionSkeleton />);
    expect(screen.getByRole('status', { name: 'Loading musical tags' })).toBeInTheDocument();
  });
});
