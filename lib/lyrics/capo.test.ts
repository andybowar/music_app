import { afterEach, describe, expect, it } from 'vitest';

import {
  capoShape,
  chordsInText,
  clampCapo,
  prettyChord,
  readCapo,
  shapeKey,
  suggestCapo,
  writeCapo,
} from './capo';

afterEach(() => window.localStorage.clear());

describe('shapeKey', () => {
  it('lowers the key by the capo fret, keeping major or minor', () => {
    expect(shapeKey('Ab', 1)).toBe('G');
    expect(shapeKey('Bb', 3)).toBe('G');
    expect(shapeKey('Eb', 1)).toBe('D');
    expect(shapeKey('Eb', 3)).toBe('C');
    expect(shapeKey('Fm', 1)).toBe('Em');
    expect(shapeKey('Bbm', 1)).toBe('Am');
    expect(shapeKey('G', 0)).toBe('G');
    expect(shapeKey('?', 1)).toBeNull();
  });
});

describe('capoShape', () => {
  it('gives the shape to play for each sounding chord', () => {
    // Song in A♭, capo 1 → G shapes.
    expect(['Ab', 'Db', 'Eb', 'Fm', 'Eb/G'].map((c) => capoShape(c, 1, 'Ab'))).toEqual([
      'G',
      'C',
      'D',
      'Em',
      'D/F#',
    ]);
    // Song in B♭, capo 3 → G shapes.
    expect(['Bb', 'Eb', 'F', 'Gm7', 'Cm'].map((c) => capoShape(c, 3, 'Bb'))).toEqual([
      'G',
      'C',
      'D',
      'Em7',
      'Am',
    ]);
  });

  it('leaves marks alone and returns the chord with no capo', () => {
    expect(capoShape('N.C.', 2, 'Bb')).toBe('N.C.');
    expect(capoShape('Ab', 0, 'Ab')).toBe('Ab');
    expect(capoShape('Ab', 1, null)).toBe('G');
  });
});

describe('suggestCapo', () => {
  it('picks the fret with the fewest sharps and flats, lowest on a tie', () => {
    expect(suggestCapo(['Ab', 'Db', 'Eb', 'Fm'], 'Ab')).toBe(1);
    // B♭: capo 1 gives A D E F♯m (one sharp); capo 3 gives G C D Em (none).
    expect(suggestCapo(['Bb', 'Eb', 'F', 'Gm'], 'Bb')).toBe(3);
    expect(suggestCapo(['G', 'C', 'D', 'Em'], 'G')).toBe(0);
    expect(suggestCapo([], 'G')).toBeNull();
    expect(suggestCapo(['G'], null)).toBeNull();
  });
});

describe('chordsInText and prettyChord', () => {
  it('collects note-starting chords in order', () => {
    expect(chordsInText('[G]a [x2] [D/F#]b\n[N.C.] [C G]')).toEqual(['G', 'D/F#', 'C', 'G']);
    expect(chordsInText(null)).toEqual([]);
  });

  it('shows ♯ and ♭ on note names only', () => {
    expect(prettyChord('F#m7/C#')).toBe('F♯m7/C♯');
    expect(prettyChord('Bbmaj7')).toBe('B♭maj7');
    expect(prettyChord('Cm7b5')).toBe('Cm7b5');
  });
});

describe('remembered capo', () => {
  it('is kept per song and key, and capo 0 clears it', () => {
    expect(readCapo('s1', 'Ab')).toBe(0);
    writeCapo('s1', 'Ab', 1);
    writeCapo('s1', 'Bb', 3);
    expect(readCapo('s1', 'Ab')).toBe(1);
    expect(readCapo('s1', 'Bb')).toBe(3);
    expect(readCapo('s2', 'Ab')).toBe(0);
    writeCapo('s1', 'Ab', 0);
    expect(window.localStorage.getItem('capo:s1:Ab')).toBeNull();
    expect(readCapo('s1', null)).toBe(0);
  });

  it('clamps to whole frets 0–7', () => {
    expect(clampCapo('3')).toBe(3);
    expect(clampCapo(12)).toBe(7);
    expect(clampCapo(-1)).toBe(0);
    expect(clampCapo(1.5)).toBe(0);
    expect(clampCapo('x')).toBe(0);
  });
});
