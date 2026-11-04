import '@testing-library/jest-dom/vitest';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { parseChordLine } from '@/lib/lyrics/chords';
import { ChordLyrics, chordWords } from './ChordLyrics';

afterEach(cleanup);

const words = (line: string) =>
  chordWords(parseChordLine(line)).map((w) => w.map((p) => `${p.chord ?? ''}|${p.text}`));

describe('chordWords', () => {
  it('splits at spaces and keeps a word with a mid-word chord together', () => {
    expect(words('[G]Amazing gra[C]ce, how')).toEqual([
      ['G|Amazing '],
      ['|gra', 'C|ce, '],
      ['|how'],
    ]);
  });

  it('starts a new word when a chord follows a space, and keeps a chord over a space', () => {
    expect(words('Amazing [C]grace')).toEqual([['|Amazing '], ['C|grace']]);
    expect(words('[G] grace')).toEqual([['G| '], ['|grace']]);
    expect(words('end[D]')).toEqual([['|end', 'D|']]);
  });
});

describe('ChordLyrics', () => {
  it('puts each chord above its text and keeps line breaks', () => {
    const { container } = render(
      <ChordLyrics text={'[G]Amazing [C]grace\nPlain line\n\n[D] [G]'} />,
    );
    const lines = container.querySelector('[data-chords]')!.children;
    expect(lines).toHaveLength(4);
    const first = lines[0]!;
    const columns = first.querySelectorAll('.flex-col');
    expect(columns[0]!.children[0]).toHaveTextContent('G');
    expect(columns[0]!.children[1]).toHaveTextContent('Amazing');
    expect(columns[1]!.children[0]).toHaveTextContent('C');
    expect(lines[1]).toHaveTextContent('Plain line');
    expect(lines[1]!.querySelector('.flex-col')).toBeNull();
    expect(lines[2]).toHaveTextContent('');
    expect(lines[3]).toHaveAttribute('data-chord-line');
    expect(lines[3]).toHaveTextContent('DG');
  });

  it('hides the empty chord placeholder from screen readers', () => {
    const { container } = render(<ChordLyrics text="Who [G]else" />);
    const chordRows = [...container.querySelectorAll('.inline-flex.flex-col > :first-child')];
    expect(chordRows.map((r) => r.getAttribute('aria-hidden'))).toEqual(['true', null]);
  });
});
