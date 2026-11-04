import { describe, expect, it } from 'vitest';

import { chordsMatchLyrics } from '@/lib/lyrics/chords';
import { parseLyrics } from '@/lib/lyrics/parse';
import { SECTIONS } from '@/types/domain';

import {
  alignChordsToLyrics,
  anyChordsTyped,
  applyPaste,
  captureAnchors,
  chordWordErrors,
  chordsOn,
  fillChordsFrom,
  removeAllChords,
  removeChords,
  setKeyChordText,
  startChords,
  type ChordState,
  type KeyRow,
} from './chordKeys';

const row = (key: string, isPrimary = false, chords?: KeyRow['chords']): KeyRow => ({
  key,
  isPrimary,
  firstChords: { intro: null, verse: null, chorus: null, bridge: null },
  ...(chords === undefined ? {} : { chords }),
});

const state = (): ChordState => ({
  lyrics: {
    lyrics: { verse_1: 'Amazing grace how sweet', chorus: 'My chains are gone' },
    arrangement: ['verse_1', 'chorus'],
  },
  keys: [
    row('G', true, {
      verse_1: '[G]Amazing [C]grace how [G]sweet',
      chorus: '[G]My chains are [C]gone',
    }),
    row('A', false, { verse_1: '[A]Amazing [D]grace how [A]sweet', chorus: 'My chains are gone' }),
    row('D'),
  ],
});

describe('chord state', () => {
  it('knows when chords are on and typed', () => {
    expect(chordsOn(state().keys)).toBe(true);
    expect(anyChordsTyped(state().keys)).toBe(true);
    expect(chordsOn([row('G'), row('A', false, null)])).toBe(false);
    expect(anyChordsTyped([row('G', true, { chorus: 'no chords' })])).toBe(false);
  });

  it('starts a key from the words, or fills it by transposing', () => {
    const s = state();
    const started = startChords(s, 2)[2]!.chords!;
    expect(started.verse_1).toBe('Amazing grace how sweet');
    expect(started.verse_5).toBeNull();
    const filled = fillChordsFrom(s, 2, 0, 'sharp')[2]!.chords!;
    expect(filled.verse_1).toBe('[D]Amazing [G]grace how [D]sweet');
    expect(filled.chorus).toBe('[D]My chains are [G]gone');
    // A section the source never chorded starts from the words.
    expect(fillChordsFrom(s, 2, 1, 'sharp')[2]!.chords!.chorus).toBe('My chains are gone');
    expect(
      fillChordsFrom({ ...s, keys: [s.keys[0]!, row('F')] }, 1, 0, 'flat')[1]!.chords!.chorus,
    ).toBe('[F]My chains are [Bb]gone');
  });

  it('removes one key’s chords, or all', () => {
    expect(removeChords(state().keys, 1)[1]!.chords).toBeNull();
    const none = removeAllChords(state().keys);
    expect(none.map((k) => k.chords)).toEqual([null, null, undefined]);
  });
});

describe('setKeyChordText', () => {
  it('sets the words for every key and moves the other keys’ chords', () => {
    const next = setKeyChordText(state(), 0, 'verse_1', '[G]Amazing [C]love how [G]sweet');
    expect(next.lyrics.lyrics.verse_1).toBe('Amazing love how sweet');
    expect(next.keys[0]!.chords!.verse_1).toBe('[G]Amazing [C]love how [G]sweet');
    expect(next.keys[1]!.chords!.verse_1).toBe('[A]Amazing [D]love how [A]sweet');
    expect(next.keys[2]!.chords).toBeUndefined();
    expect(next.removed).toBe(0);
    for (const k of next.keys.slice(0, 2)) {
      for (const sec of SECTIONS) {
        expect(chordsMatchLyrics(k.chords![sec], next.lyrics.lyrics[sec])).toBe(true);
      }
    }
  });

  it('follows from anchors, so clearing a field and typing again keeps the other chords', () => {
    const s = state();
    const anchors = captureAnchors(s.keys, 0, 'verse_1');
    expect(anchors).toEqual({ 1: s.keys[1]!.chords!.verse_1 });
    const cleared = setKeyChordText(s, 0, 'verse_1', '', anchors);
    expect(cleared.keys[1]!.chords!.verse_1).toBeNull();
    const retyped = setKeyChordText(
      { lyrics: cleared.lyrics, keys: cleared.keys },
      0,
      'verse_1',
      '[G]Amazing grace how sweet',
      anchors,
    );
    expect(retyped.keys[1]!.chords!.verse_1).toBe('[A]Amazing [D]grace how [A]sweet');
  });

  it('emptying a section of words takes it out of the order', () => {
    const next = setKeyChordText(state(), 1, 'chorus', '[A] [D]');
    expect(next.lyrics.lyrics.chorus).toBeNull();
    expect(next.lyrics.arrangement).toEqual(['verse_1']);
    expect(next.removed).toBe(1);
    expect(next.keys[1]!.chords!.chorus).toBe('[A] [D]');
    expect(next.keys[0]!.chords!.chorus).toBeNull();
  });
});

describe('applyPaste', () => {
  const pasted = parseLyrics(
    'Verse 1\n[E]Amazing grace how sweet it is\n\nChorus\nMy chains are gone',
  );

  it('puts the paste into the key being edited and moves the others, saying which', () => {
    const r = applyPaste(state(), pasted, 1, true);
    expect(r.lyrics.lyrics.verse_1).toBe('Amazing grace how sweet it is');
    expect(r.keys[1]!.chords!.verse_1).toBe('[E]Amazing grace how sweet it is');
    expect(r.keys[0]!.chords!.verse_1).toBe('[G]Amazing [C]grace how [G]sweet it is');
    expect(r.moved).toEqual(['G']);
    expect(r.dropped).toBe(0);
  });

  it('with chords off, a paste with chords (kept) turns them on for the primary key', () => {
    const off: ChordState = { lyrics: state().lyrics, keys: [row('C'), row('D', true)] };
    const kept = applyPaste(off, pasted, null, true);
    expect(kept.keys[1]!.chords!.verse_1).toBe('[E]Amazing grace how sweet it is');
    expect(kept.keys[0]!.chords).toBeUndefined();
    const plain = applyPaste(off, pasted, null, false);
    expect(plain.keys.every((k) => k.chords === undefined)).toBe(true);
    expect(plain.lyrics.lyrics.verse_1).toBe('Amazing grace how sweet it is');
  });

  it('counts chords on lines that are gone', () => {
    const r = applyPaste(state(), parseLyrics('Verse 1\nAmazing grace how sweet'), 1, true);
    expect(r.keys[0]!.chords!.chorus).toBeNull();
    expect(r.dropped).toBe(2);
  });
});

describe('alignChordsToLyrics and chordWordErrors', () => {
  it('moves stale chords onto the current words and leaves matching ones alone', () => {
    const s = state();
    const lyrics = { ...s.lyrics.lyrics, chorus: 'My chains are gone!' };
    const keys = alignChordsToLyrics(s.keys, lyrics);
    expect(keys[0]!.chords!.chorus).toBe('[G]My chains are [C]gone!');
    expect(keys[0]!.chords!.verse_1).toBe(s.keys[0]!.chords!.verse_1);
    expect(keys[2]).toBe(s.keys[2]);
    expect(alignChordsToLyrics(s.keys, s.lyrics.lyrics)[0]).toBe(s.keys[0]);
  });

  it('reports every key and section whose words differ', () => {
    const s = state();
    expect(chordWordErrors(s.keys, s.lyrics.lyrics)).toEqual({});
    const bad = [
      s.keys[0]!,
      { ...s.keys[1]!, chords: { ...s.keys[1]!.chords, chorus: '[A]Other' } },
    ];
    expect(Object.keys(chordWordErrors(bad, s.lyrics.lyrics))).toEqual(['chords.1.chorus']);
  });
});
