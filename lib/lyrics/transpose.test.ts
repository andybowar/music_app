import { describe, expect, it } from 'vitest';

import {
  canTranspose,
  isMinorKey,
  keySignature,
  noteIndex,
  noteNameInKey,
  semitonesBetween,
  transposeChord,
  transposeChordText,
} from './transpose';

/** The 12 notes, named in `key`, starting from its tonic. */
const chromatic = (key: string) =>
  Array.from({ length: 12 }, (_, i) => noteNameInKey((noteIndex(key)! + i) % 12, key));

describe('notes and keys', () => {
  it('has 12 notes; sharp and flat names of a note are the same note', () => {
    expect(noteIndex('C')).toBe(0);
    expect(noteIndex('C#')).toBe(noteIndex('Db'));
    expect(noteIndex('F#')).toBe(6);
    expect(noteIndex('Gb')).toBe(6);
    expect(noteIndex('A#')).toBe(noteIndex('Bb'));
    expect(noteIndex('B')).toBe(11);
    expect(noteIndex('H')).toBeNull();
  });

  it('tells major from minor keys and only pairs keys of the same kind', () => {
    expect(isMinorKey('Em')).toBe(true);
    expect(isMinorKey('F#m')).toBe(true);
    expect(isMinorKey('G')).toBe(false);
    expect(isMinorKey('Bb')).toBe(false);
    expect(canTranspose('G', 'A')).toBe(true);
    expect(canTranspose('Em', 'F#m')).toBe(true);
    expect(canTranspose('G', 'Em')).toBe(false);
    expect(canTranspose('Am', 'C')).toBe(false);
    expect(canTranspose('G', 'H')).toBe(false);
  });

  it('knows each key signature', () => {
    for (const k of ['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Dm', 'Gm', 'Cm', 'Fm']) {
      expect(keySignature(k), k).toBe('flat');
    }
    for (const k of ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'Am', 'Em', 'Bm', 'C#m']) {
      expect(keySignature(k), k).toBe('sharp');
    }
  });

  it('counts half steps up between tonics', () => {
    expect(semitonesBetween('G', 'A')).toBe(2);
    expect(semitonesBetween('A', 'G')).toBe(10);
    expect(semitonesBetween('Em', 'F#m')).toBe(2);
    expect(semitonesBetween('G', 'H')).toBeNull();
  });
});

describe('spelling by the key', () => {
  it('names the scale notes with the key’s own sharps or flats', () => {
    // Major scales: degrees 1 2 3 4 5 6 7 sit at chromatic positions 0 2 4 5 7 9 11.
    const scale = (key: string) => [0, 2, 4, 5, 7, 9, 11].map((i) => chromatic(key)[i]);
    expect(scale('C')).toEqual(['C', 'D', 'E', 'F', 'G', 'A', 'B']);
    expect(scale('G')).toEqual(['G', 'A', 'B', 'C', 'D', 'E', 'F#']);
    expect(scale('D')).toEqual(['D', 'E', 'F#', 'G', 'A', 'B', 'C#']);
    expect(scale('E')).toEqual(['E', 'F#', 'G#', 'A', 'B', 'C#', 'D#']);
    expect(scale('F')).toEqual(['F', 'G', 'A', 'Bb', 'C', 'D', 'E']);
    expect(scale('Bb')).toEqual(['Bb', 'C', 'D', 'Eb', 'F', 'G', 'A']);
    expect(scale('Eb')).toEqual(['Eb', 'F', 'G', 'Ab', 'Bb', 'C', 'D']);
    expect(scale('Ab')).toEqual(['Ab', 'Bb', 'C', 'Db', 'Eb', 'F', 'G']);
  });

  it('names the minor scale with its flat 3rd, 6th and 7th', () => {
    // Natural minor: positions 0 2 3 5 7 8 10. C minor: C D Eb F G Ab Bb.
    const minor = (key: string) => [0, 2, 3, 5, 7, 8, 10].map((i) => chromatic(key)[i]);
    expect(minor('Cm')).toEqual(['C', 'D', 'Eb', 'F', 'G', 'Ab', 'Bb']);
    expect(minor('Am')).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G']);
    expect(minor('Em')).toEqual(['E', 'F#', 'G', 'A', 'B', 'C', 'D']);
    expect(minor('Dm')).toEqual(['D', 'E', 'F', 'G', 'A', 'Bb', 'C']);
  });

  it('names notes outside the key the usual way: flat 2, 3, 6, 7 and sharp 4', () => {
    expect(chromatic('C')).toEqual([
      'C',
      'Db',
      'D',
      'Eb',
      'E',
      'F',
      'F#',
      'G',
      'Ab',
      'A',
      'Bb',
      'B',
    ]);
    expect(chromatic('D')).toEqual([
      'D',
      'Eb',
      'E',
      'F',
      'F#',
      'G',
      'G#',
      'A',
      'Bb',
      'B',
      'C',
      'C#',
    ]);
    expect(chromatic('Am')).toEqual([
      'A',
      'Bb',
      'B',
      'C',
      'C#',
      'D',
      'D#',
      'E',
      'F',
      'F#',
      'G',
      'G#',
    ]);
  });

  it('swaps the awkward names (E#, B#, Cb, Fb, doubles) for the plain one', () => {
    // B major's raised 4th is E#; F# major's 7th is E#, its raised 4th B#.
    expect(chromatic('B')[6]).toBe('F');
    expect(chromatic('F#')[11]).toBe('F');
    expect(chromatic('F#')[6]).toBe('C');
    // Db major's flat 2nd would be Ebb.
    expect(chromatic('Db')[1]).toBe('D');
    expect(chromatic('Gb')[5]).toBe('B');
  });
});

describe('transposeChord', () => {
  it('moves the root and slash bass, keeping major/minor and the rest of the chord', () => {
    expect(transposeChord('G', 2, 'A')).toBe('A');
    expect(transposeChord('Em', 2, 'A')).toBe('F#m');
    expect(transposeChord('D/F#', 2, 'A')).toBe('E/G#');
    expect(transposeChord('Bm7b5', 1, 'C')).toBe('Cm7b5');
    expect(transposeChord('Cmaj7', 5, 'F')).toBe('Fmaj7');
    expect(transposeChord('Ebsus4', 2, 'F')).toBe('Fsus4');
    expect(transposeChord('C6/9', 2, 'D')).toBe('D6/9');
  });

  it('spells by the target key unless told otherwise', () => {
    // G's F chord (flat 7) into C is Bb, not A#.
    expect(transposeChord('F', 5, 'C')).toBe('Bb');
    expect(transposeChord('F', 5, 'C', 'sharp')).toBe('A#');
    expect(transposeChord('C#m', 1, 'D', 'flat')).toBe('Dm');
    expect(transposeChord('A', 1, 'Bb')).toBe('Bb');
  });

  it('leaves marks alone', () => {
    expect(transposeChord('N.C.', 3, 'C')).toBe('N.C.');
    expect(transposeChord('x2', 3, 'C')).toBe('x2');
    expect(transposeChord('|', 3, 'C')).toBe('|');
  });
});

describe('transposeChordText', () => {
  it('transposes every chord into the target key', () => {
    const text = '[G]Amazing [G7]grace how [C]sweet\n[D] [Em] [N.C.] [x2]';
    expect(transposeChordText(text, 'G', 'A')).toBe(
      '[A]Amazing [A7]grace how [D]sweet\n[E] [F#m] [N.C.] [x2]',
    );
    expect(transposeChordText('[G]a [D/F#]b [F]c', 'G', 'F')).toBe('[F]a [C/E]b [Eb]c');
    expect(transposeChordText('[G]a [F]b [D]c', 'G', 'C')).toBe('[C]a [Bb]b [G]c');
  });

  it('keeps minor-key charts minor: Em to F#m', () => {
    expect(transposeChordText('[Em]a [C]b [G]c [D]d [B7]e', 'Em', 'F#m')).toBe(
      '[F#m]a [D]b [A]c [E]d [C#7]e',
    );
  });

  it('honours an all-sharps or all-flats choice', () => {
    expect(transposeChordText('[C]a [A#m]b', 'C', 'Db', 'sharp')).toBe('[C#]a [Bm]b');
    expect(transposeChordText('[C]a [Bb]b', 'C', 'D', 'flat')).toBe('[D]a [C]b');
  });

  it('leaves the text alone across major and minor, or for an unknown key', () => {
    expect(transposeChordText('[G]a', 'G', 'Em')).toBe('[G]a');
    expect(transposeChordText('[Am]a', 'Am', 'C')).toBe('[Am]a');
    expect(transposeChordText('[G]a', 'G', '?')).toBe('[G]a');
  });
});
