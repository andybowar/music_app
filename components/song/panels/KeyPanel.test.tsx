import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { thousandHallelujahs } from '@/fixtures';
import type { SongKey } from '@/types/domain';
import { KeyPanel, KeyPanelSkeleton, chordText, initialKey } from './KeyPanel';

afterEach(cleanup);

const keys = thousandHallelujahs.keys; // D (primary), Db (bridge null), E

function chords() {
  const region = screen.getByRole('region', { name: /^First chords in/ });
  return within(region)
    .getAllByRole('definition')
    .map((dd) => dd.firstChild?.textContent);
}

describe('chordText', () => {
  it('shows X for null or blank and ♯/♭ otherwise', () => {
    expect(chordText(null)).toBe('X');
    expect(chordText('  ')).toBe('X');
    expect(chordText('Gb')).toBe('G♭');
    expect(chordText(' F#m ')).toBe('F♯m');
  });
});

describe('initialKey', () => {
  const k = (key: string, isPrimary: boolean): SongKey => ({ ...keys[0]!, key, isPrimary });
  it('prefers highlight, then primary, then first', () => {
    expect(initialKey(keys, 'E')).toBe('E');
    expect(initialKey([k('A', false), k('B', true)])).toBe('B');
    expect(initialKey([k('A', false), k('B', false)])).toBe('A');
    expect(initialKey([])).toBeNull();
  });
});

describe('KeyPanel', () => {
  it('lists every key and opens on the primary key', () => {
    render(<KeyPanel keys={keys} />);
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(3);
    expect(screen.getByRole('radio', { name: 'Key D, usual' })).toBeChecked();
    expect(screen.getByRole('region', { name: 'First chords in D' })).toBeInTheDocument();
    expect(chords()).toEqual(['D', 'D', 'G', 'D']);
  });

  it('shows the chosen key’s four first chords, with X for a missing one', async () => {
    const user = userEvent.setup();
    render(<KeyPanel keys={keys} />);
    await user.click(screen.getByRole('radio', { name: 'Key D flat' }));
    expect(chords()).toEqual(['D♭', 'D♭', 'G♭', 'X']);
    expect(screen.getByText('(not recorded)')).toBeInTheDocument();
  });

  it('keeps a key selected when the selected key is pressed again', async () => {
    const user = userEvent.setup();
    render(<KeyPanel keys={keys} />);
    await user.click(screen.getByRole('radio', { name: 'Key D, usual' }));
    expect(screen.getByRole('radio', { name: 'Key D, usual' })).toBeChecked();
  });

  it('is keyboard operable', async () => {
    const user = userEvent.setup();
    render(<KeyPanel keys={keys} />);
    await user.tab();
    expect(screen.getByRole('radio', { name: 'Key D, usual' })).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: 'Key D flat' })).toHaveFocus();
    await user.keyboard(' ');
    expect(chords()).toEqual(['D♭', 'D♭', 'G♭', 'X']);
  });

  it('opens on the highlight key and tags it', () => {
    render(<KeyPanel keys={keys} highlightKey="E" />);
    expect(screen.getByRole('radio', { name: 'Key E, this event' })).toBeChecked();
    expect(chords()).toEqual(['E', 'E', 'A', 'E']);
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  it('shows an override key with no files as all X with an upload prompt', async () => {
    const user = userEvent.setup();
    render(<KeyPanel keys={keys} highlightKey="F" />);
    expect(screen.getAllByRole('radio')).toHaveLength(4);
    expect(screen.getByRole('radio', { name: 'Key F, this event' })).toBeChecked();
    expect(chords()).toEqual(['X', 'X', 'X', 'X']);
    expect(screen.getByRole('note')).toHaveTextContent('No files for F yet');
    await user.click(screen.getByRole('radio', { name: 'Key D, usual' }));
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  it('works with only an override key', () => {
    render(<KeyPanel keys={[]} highlightKey="Bb" />);
    expect(screen.getByRole('radio', { name: 'Key B flat, this event' })).toBeChecked();
    expect(chords()).toEqual(['X', 'X', 'X', 'X']);
  });

  it('shows an empty state', () => {
    render(<KeyPanel keys={[]} />);
    expect(screen.getByText('No keys recorded for this song yet.')).toBeInTheDocument();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
  });

  it('has a loading skeleton', () => {
    render(<KeyPanelSkeleton />);
    expect(screen.getByRole('status', { name: 'Loading keys' })).toHaveAttribute(
      'aria-busy',
      'true',
    );
  });
});
