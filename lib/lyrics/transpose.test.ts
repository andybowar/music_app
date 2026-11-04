import { describe, expect, it } from 'vitest';

import {
  keySpelling,
  noteIndex,
  semitonesBetween,
  transposeChord,
  transposeChordText,
} from './transpose';

describe('notes and keys', () => {
  it('knows note numbers, including enharmonics', () => {
    expect(noteIndex('C')).toBe(0);
    expect(noteIndex('F#')).toBe(6);
    expect(noteIndex('Gb')).toBe(6);
    expect(noteIndex('Cb')).toBe(11);
    expect(noteIndex('B#')).toBe(0);
    expect(noteIndex('H')).toBeNull();
  });

  it('spells by the key signature', () => {
    expect(keySpelling('F')).toBe('flat');
    expect(keySpelling('Bb')).toBe('flat');
    expect(keySpelling('Dm')).toBe('flat');
    expect(keySpelling('G')).toBe('sharp');
    expect(keySpelling('C')).toBe('sharp');
    expect(keySpelling('F#')).toBe('sharp');
    expect(keySpelling('Am')).toBe('sharp');
    expect(keySpelling('Db')).toBe('flat');
  });

  it('counts semitones up, root only', () => {
    expect(semitonesBetween('G', 'A')).toBe(2);
    expect(semitonesBetween('A', 'G')).toBe(10);
    expect(semitonesBetween('Em', 'F#m')).toBe(2);
    expect(semitonesBetween('G', 'H')).toBeNull();
  });
});

describe('transposeChord', () => {
  it('moves the root and slash bass, keeping the quality', () => {
    expect(transposeChord('G', 2, 'sharp')).toBe('A');
    expect(transposeChord('D/F#', 2, 'sharp')).toBe('E/G#');
    expect(transposeChord('Bm7b5', 1, 'sharp')).toBe('Cm7b5');
    expect(transposeChord('Cmaj7', 5, 'flat')).toBe('Fmaj7');
    expect(transposeChord('Ebsus4', 2, 'sharp')).toBe('Fsus4');
    expect(transposeChord('C6/9', 2, 'sharp')).toBe('D6/9');
    expect(transposeChord('A', 1, 'flat')).toBe('Bb');
    expect(transposeChord('A', 1, 'sharp')).toBe('A#');
  });

  it('leaves marks alone', () => {
    expect(transposeChord('N.C.', 3, 'sharp')).toBe('N.C.');
    expect(transposeChord('x2', 3, 'sharp')).toBe('x2');
    expect(transposeChord('|', 3, 'sharp')).toBe('|');
  });
});

describe('transposeChordText', () => {
  it('transposes every chord, by the target key unless told otherwise', () => {
    const text = '[G]Amazing [G7]grace how [C]sweet\n[D] [N.C.] [x2]';
    expect(transposeChordText(text, 'G', 'A')).toBe(
      '[A]Amazing [A7]grace how [D]sweet\n[E] [N.C.] [x2]',
    );
    expect(transposeChordText('[G]a [D/F#]b', 'G', 'F')).toBe('[F]a [C/E]b');
    expect(transposeChordText('[G]a [D/F#]b', 'G', 'F', 'sharp')).toBe('[F]a [C/E]b');
    expect(transposeChordText('[C]a [A#m]b', 'C', 'Db')).toBe('[Db]a [Bm]b');
    expect(transposeChordText('[C]a [Bb]b', 'C', 'D', 'flat')).toBe('[D]a [C]b');
  });

  it('keeps text unchanged for an unknown key', () => {
    expect(transposeChordText('[G]a', 'G', '?')).toBe('[G]a');
  });
});
