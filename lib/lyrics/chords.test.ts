import { describe, expect, it } from 'vitest';

import {
  chordLineTokens,
  chordsMatchLyrics,
  hasChords,
  inlineChords,
  parseChordLine,
  stripChords,
} from './chords';
import { isHeadingLine, parseLyrics } from './parse';

describe('hasChords', () => {
  it('finds inline chords only', () => {
    expect(hasChords('[G]Amazing grace')).toBe(true);
    expect(hasChords('Amazing grace')).toBe(false);
    expect(hasChords('[]empty brackets')).toBe(false);
    expect(hasChords(null)).toBe(false);
    expect(hasChords(undefined)).toBe(false);
    expect(hasChords('')).toBe(false);
  });
});

describe('parseChordLine', () => {
  it('splits a line into chord + text segments', () => {
    expect(parseChordLine('[G]Amazing [C]grace')).toEqual([
      { chord: 'G', text: 'Amazing ' },
      { chord: 'C', text: 'grace' },
    ]);
  });

  it('keeps text before the first chord and chords mid-word', () => {
    expect(parseChordLine('How swe[D/F#]et')).toEqual([
      { chord: null, text: 'How swe' },
      { chord: 'D/F#', text: 'et' },
    ]);
  });

  it('handles chords at the end, back to back and with spaces inside', () => {
    expect(parseChordLine('sound[G]')).toEqual([
      { chord: null, text: 'sound' },
      { chord: 'G', text: '' },
    ]);
    expect(parseChordLine('[G][C]Lord')).toEqual([
      { chord: 'G', text: '' },
      { chord: 'C', text: 'Lord' },
    ]);
    expect(parseChordLine('[ Am ]me')).toEqual([{ chord: 'Am', text: 'me' }]);
  });

  it('returns one plain segment for a line without chords, even an empty one', () => {
    expect(parseChordLine('Just words')).toEqual([{ chord: null, text: 'Just words' }]);
    expect(parseChordLine('')).toEqual([{ chord: null, text: '' }]);
  });
});

describe('stripChords', () => {
  it('removes chords and tidies the spaces they leave', () => {
    expect(stripChords('[G]Amazing [G7]grace, how [C]sweet the [G]sound')).toBe(
      'Amazing grace, how sweet the sound',
    );
    expect(stripChords('word [G] word')).toBe('word word');
    expect(stripChords('A[G]mazing')).toBe('Amazing');
  });

  it('drops lines of only chords and keeps the other lines as they are', () => {
    expect(stripChords('[G] [C] [D]\n[G]Line one\n\n  Line  two  ')).toBe(
      'Line one\n\n  Line  two  ',
    );
  });

  it('returns text without chords unchanged', () => {
    expect(stripChords('  Untouched   text\n')).toBe('  Untouched   text\n');
  });
});

describe('chordsMatchLyrics', () => {
  it('compares the chord-free words, ignoring outer whitespace', () => {
    expect(chordsMatchLyrics('[G]Amazing grace\n', 'Amazing grace')).toBe(true);
    expect(chordsMatchLyrics('[G]Amazing love', 'Amazing grace')).toBe(false);
    expect(chordsMatchLyrics(null, null)).toBe(true);
    expect(chordsMatchLyrics('[G] [C]', undefined)).toBe(true);
    expect(chordsMatchLyrics(undefined, 'Words')).toBe(false);
  });
});

describe('chordLineTokens', () => {
  it('recognises lines of chords and bar marks', () => {
    expect(chordLineTokens('G    D/F#   Em7  Cmaj7')?.map((t) => t.token)).toEqual([
      'G',
      'D/F#',
      'Em7',
      'Cmaj7',
    ]);
    expect(chordLineTokens('| Asus4 | Bm7b5 | N.C. | (x2)')).not.toBeNull();
    expect(chordLineTokens('Dsus2  Gadd9  C#m  Bb  F+  Edim7')).not.toBeNull();
    expect(chordLineTokens('G      C')?.map((t) => t.column)).toEqual([0, 7]);
  });

  it('rejects lyric lines, mark-only lines, blank lines and inline chords', () => {
    expect(chordLineTokens('Amazing grace')).toBeNull();
    expect(chordLineTokens('A mighty fortress')).toBeNull();
    expect(chordLineTokens('Be still')).toBeNull();
    expect(chordLineTokens('| | (x2)')).toBeNull();
    expect(chordLineTokens('   ')).toBeNull();
    expect(chordLineTokens('[G]Amazing')).toBeNull();
  });

  it('expands tabs to 8-column stops', () => {
    expect(chordLineTokens('G\tC')?.map((t) => t.column)).toEqual([0, 8]);
  });
});

describe('inlineChords', () => {
  it('moves chords above a line into it at their columns', () => {
    const sheet = ['G          C       G', 'Amazing grace, how sweet the sound'].join('\n');
    expect(inlineChords(sheet)).toBe('[G]Amazing gra[C]ce, how [G]sweet the sound');
  });

  it('pads a short lyric line for chords past its end', () => {
    expect(inlineChords('G        D\nShort')).toBe('[G]Short    [D]');
  });

  it('keeps a chord line with nothing under it as a chord-only line', () => {
    expect(inlineChords('G  C  D\n\nWords')).toBe('[G] [C] [D]\n\nWords');
    expect(inlineChords('G  C\nD  G\nWords')).toBe('[G] [C]\n[D]Wor[G]ds');
    expect(inlineChords('| G | C |')).toBe('[|] [G] [|] [C] [|]');
    expect(inlineChords('Em')).toBe('[Em]');
  });

  it("doesn't merge into a heading and drops bar marks when merging", () => {
    const heading = (line: string) => line.trim() === 'Chorus';
    expect(inlineChords('G  C\nChorus\nWords', heading)).toBe('[G] [C]\nChorus\nWords');
    expect(inlineChords('G  |  C\nWords and more')).toBe('[G]Words [C]and more');
  });

  it('leaves text without chord lines alone', () => {
    const text = 'Verse 1\n[G]Already inline\nPlain line';
    expect(inlineChords(text)).toBe(text);
  });

  it('works with the paste parser: sections keep chords, repeats prefer the chorded copy', () => {
    const sheet = [
      'Verse 1',
      'G          C',
      'First line here',
      '',
      'Chorus',
      'D       G',
      'Sing it now',
      '',
      'Verse 2',
      'Another line here',
      '',
      'Chorus',
      'Sing it now',
    ].join('\n');
    const parsed = parseLyrics(inlineChords(sheet, isHeadingLine));
    expect(parsed.lyrics.verse_1).toBe('[G]First line [C]here');
    expect(parsed.lyrics.chorus).toBe('[D]Sing it [G]now');
    expect(parsed.arrangement).toEqual(['verse_1', 'chorus', 'verse_2', 'chorus']);
    expect(parsed.warnings).toEqual([]);

    // Chords only on the second chorus: that copy wins, without a "different lyrics" merge.
    const later = parseLyrics('Chorus\nSing it now\n\nChorus\n[D]Sing it [G]now');
    expect(later.lyrics.chorus).toBe('[D]Sing it [G]now');
    expect(later.arrangement).toEqual(['chorus', 'chorus']);
  });
});
