import { describe, expect, it } from 'vitest';

import { chordsMatchLyrics, stripChords } from './chords';
import { realignChords } from './realign';

const check = (chorded: string, plain: string) => {
  const r = realignChords(chorded, plain);
  expect(chordsMatchLyrics(r.text, plain)).toBe(true);
  return r;
};

describe('realignChords', () => {
  it('keeps unchanged text exactly as it was', () => {
    const text = '[G] [C]\n[G]Amazing [C]grace\nHow sweet the [D]sound';
    expect(check(text, stripChords(text))).toEqual({ text, dropped: 0 });
  });

  it('moves chords with their letters when a line is edited', () => {
    const r = check('[G]Amazing [C]grace, how [D]sweet', 'Amazing love, how sweet');
    // "grace" became "love": its chord moves to where the replaced word sits.
    expect(r.text).toBe('[G]Amazing [C]love, how [D]sweet');
    expect(check('A[G]mazing grace', 'So amazing grace').text).toBe('So a[G]mazing grace');
  });

  it('keeps chords on the lines that stay when lines are added or removed', () => {
    const old = '[G]Line one\n[C]Line two\n[D]Line three';
    const added = check(old, 'Line one\nA new line\nLine two\nLine three');
    expect(added.text).toBe('[G]Line one\nA new line\n[C]Line two\n[D]Line three');
    const removed = check(old, 'Line one\nLine three');
    expect(removed).toEqual({ text: '[G]Line one\n[D]Line three', dropped: 1 });
  });

  it('pairs an edited line with the old one in the same place', () => {
    const r = check('[G]First\n[C]Second line\n[D]Third', 'First\nSecond lines\nThird');
    expect(r.text).toBe('[G]First\n[C]Second lines\n[D]Third');
  });

  it('puts chord-only lines back where they were', () => {
    const r = check('[G] [C]\nVerse [G]words\n[D] [G]', 'Verse words here');
    expect(r.text).toBe('[G] [C]\nVerse [G]words here\n[D] [G]');
  });

  it('copes with empty input and with spacing-only differences', () => {
    expect(check('', 'New words').text).toBe('New words');
    expect(check('[G]Old words', '').text).toBe('');
    expect(realignChords('[G]Old words', '').dropped).toBe(1);
    expect(check('[G]Hello  world', 'Hello world').text).toBe('[G]Hello world');
  });
});

describe('realignChords on random edits', () => {
  // Small seeded generator, so a failure always reproduces.
  let seed = 42;
  const rand = (n: number) => {
    seed = (seed * 1103515245 + 12345) % 2 ** 31;
    return seed % n;
  };
  const WORDS = ['grace', 'love', 'Lord', 'sing', 'how', 'sweet', 'the', 'sound', 'A', 'is'];
  const CHORDS = ['G', 'C', 'D/F#', 'Em7', 'Asus4'];
  const line = () => Array.from({ length: 1 + rand(6) }, () => WORDS[rand(WORDS.length)]).join(' ');
  const chordify = (plain: string) =>
    plain
      .split(' ')
      .map((w) => (rand(3) === 0 ? `[${CHORDS[rand(CHORDS.length)]}]${w}` : w))
      .join(' ');

  it('always ends on exactly the new words', () => {
    for (let run = 0; run < 300; run++) {
      const lines = Array.from({ length: 1 + rand(5) }, line);
      const chorded = [rand(4) === 0 ? '[G] [C]' : '', ...lines.map(chordify)]
        .filter((l, i) => i > 0 || l)
        .join('\n');
      const edited = lines
        .flatMap((l) => {
          const r = rand(5);
          if (r === 0) return [];
          if (r === 1) return [l, line()];
          if (r === 2) return [`${l} ${WORDS[rand(WORDS.length)]}`];
          return [l];
        })
        .join('\n');
      const { text } = realignChords(chorded, edited);
      expect(chordsMatchLyrics(text, edited), `${chorded} -> ${edited}`).toBe(true);
    }
  });
});
