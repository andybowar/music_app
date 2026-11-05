/**
 * Chords over the lyrics, per key, in the song form (LIB-23). Pure.
 *
 * The words live once, in `lyrics`. Each key may have its own chorded copy of them
 * (`keys[i].chords`, `null`/absent when it has none). Editing a section in one key sets the words
 * for every key: the edited key keeps what was typed, and every other key's chords are moved to
 * follow the new words (`realignChords`).
 */
import { chordsMatchLyrics, sectionsHaveChords, stripChords } from '@/lib/lyrics/chords';
import type { ParsedLyrics } from '@/lib/lyrics/parse';
import { realignChords } from '@/lib/lyrics/realign';
import { canTranspose, transposeChordText, type Spelling } from '@/lib/lyrics/transpose';
import { SECTION_LABEL, SECTIONS, type Section, type SongLyrics } from '@/types/domain';

import type { SongFormValue } from './types';

export type KeyRow = SongFormValue['musical']['keys'][number];
export type LyricsSlice = SongFormValue['lyrics'];
export type KeyChords = Partial<SongLyrics>;

export interface ChordState {
  lyrics: LyricsSlice;
  keys: KeyRow[];
}

/** Whether a key has a chord set (possibly with no chords typed yet). */
export const hasChordSet = (k: KeyRow): k is KeyRow & { chords: KeyChords } =>
  k.chords !== null && k.chords !== undefined;

/** Whether chords are on for the song: any key has a chord set. */
export const chordsOn = (keys: readonly KeyRow[]): boolean => keys.some(hasChordSet);

/** Whether any key has a chord typed in. */
export const anyChordsTyped = (keys: readonly KeyRow[]): boolean =>
  keys.some((k) => sectionsHaveChords(k.chords));

/** The words as a full chord set with no chords yet. */
function copyOfWords(lyrics: LyricsSlice['lyrics']): KeyChords {
  return Object.fromEntries(SECTIONS.map((s) => [s, lyrics[s] ?? null]));
}

const withKey = (keys: KeyRow[], index: number, chords: KeyChords | null): KeyRow[] =>
  keys.map((k, i) => (i === index ? { ...k, chords } : k));

/** Starts a key's chords from the plain words. */
export function startChords(state: ChordState, index: number): KeyRow[] {
  return withKey(state.keys, index, copyOfWords(state.lyrics.lyrics));
}

/** Starts a key's chords by transposing another key's (TODO #2). */
export function fillChordsFrom(
  state: ChordState,
  index: number,
  fromIndex: number,
  spelling: Spelling,
): KeyRow[] {
  const from = state.keys[fromIndex]!;
  const to = state.keys[index]!;
  // Major only into major, minor only into minor (the UI only offers those).
  if (!canTranspose(from.key, to.key)) return state.keys;
  const chords = Object.fromEntries(
    SECTIONS.map((s) => {
      const source = from.chords?.[s] ?? state.lyrics.lyrics[s] ?? null;
      return [s, source === null ? null : transposeChordText(source, from.key, to.key, spelling)];
    }),
  );
  return withKey(state.keys, index, chords);
}

/** Removes one key's chords (saved as "none" for that key). */
export function removeChords(keys: KeyRow[], index: number): KeyRow[] {
  return withKey(keys, index, null);
}

/** Turns chords off for the song: every key's chords are removed. */
export function removeAllChords(keys: KeyRow[]): KeyRow[] {
  return keys.map((k) => (hasChordSet(k) ? { ...k, chords: null } : k));
}

/** Each other key's text for one section, keyed by key index: where its chords follow from. */
export type ChordAnchors = Record<number, string | null>;

/** The other keys' current text for a section, to follow from while one field is edited. */
export function captureAnchors(
  keys: readonly KeyRow[],
  skip: number,
  section: Section,
): ChordAnchors {
  const anchors: ChordAnchors = {};
  keys.forEach((k, i) => {
    if (i !== skip && hasChordSet(k)) anchors[i] = k.chords[section] ?? null;
  });
  return anchors;
}

/**
 * Moves one section of every other key's chords onto `plain`, from `anchors` when given (so
 * clearing a field and typing it again doesn't lose the other keys' chords on the way).
 */
function followWords(
  keys: KeyRow[],
  skip: number,
  section: Section,
  plain: string,
  anchors?: ChordAnchors,
): KeyRow[] {
  return keys.map((k, i) => {
    if (i === skip || !hasChordSet(k)) return k;
    const from = anchors && i in anchors ? anchors[i] : k.chords[section];
    const moved = realignChords(from ?? '', plain).text;
    return { ...k, chords: { ...k.chords, [section]: moved === '' ? null : moved } };
  });
}

/**
 * Types into one section of one key's chords. The words follow (chords removed) for the song,
 * and every other key's chords for that section move to the new words. A section emptied of
 * words leaves the arrangement (`removed` entries), as in plain editing.
 */
export function setKeyChordText(
  state: ChordState,
  index: number,
  section: Section,
  text: string,
  anchors?: ChordAnchors,
): { lyrics: LyricsSlice; keys: KeyRow[]; removed: number } {
  const plain = stripChords(text);
  const lyrics = { ...state.lyrics.lyrics, [section]: plain === '' ? null : plain };
  let arrangement = state.lyrics.arrangement;
  let removed = 0;
  if (!plain.trim()) {
    arrangement = arrangement.filter((s) => s !== section);
    removed = state.lyrics.arrangement.length - arrangement.length;
  }
  const own = state.keys[index]!;
  const keys = followWords(
    withKey(state.keys, index, { ...(own.chords ?? {}), [section]: text === '' ? null : text }),
    index,
    section,
    plain,
    anchors,
  );
  return { lyrics: { ...state.lyrics, lyrics, arrangement }, keys, removed };
}

/**
 * Applies a paste. Its words replace the lyrics. With `index` (the key being edited, chords on)
 * the paste's chords go into that key, or into the primary key when chords were off and
 * `keepChords`. Every other key's chords move to the new words; `moved` names the keys that had
 * chords typed, and `dropped` counts chords whose lines went away.
 */
export function applyPaste(
  state: ChordState,
  parsed: ParsedLyrics,
  index: number | null,
  keepChords: boolean,
): { lyrics: LyricsSlice; keys: KeyRow[]; moved: string[]; dropped: number } {
  const plainOf = (s: Section) => {
    const text = parsed.lyrics[s];
    return text == null ? null : stripChords(text) || null;
  };
  const words = Object.fromEntries(SECTIONS.map((s) => [s, plainOf(s)])) as KeyChords;
  const lyrics: LyricsSlice = {
    lyrics: words,
    arrangement: parsed.arrangement.filter((s) => !!words[s]?.trim()),
  };
  // Chords were off: a paste with chords (kept) turns them on for the primary key.
  const primary = state.keys.findIndex((k) => k.isPrimary);
  const target =
    index ??
    (keepChords && sectionsHaveChords(parsed.lyrics) && state.keys.length > 0
      ? Math.max(primary, 0)
      : null);
  const moved: string[] = [];
  let dropped = 0;
  const keys = state.keys.map((k, i) => {
    if (i === target) {
      const chords = keepChords
        ? (Object.fromEntries(SECTIONS.map((s) => [s, parsed.lyrics[s] ?? null])) as KeyChords)
        : { ...words };
      return { ...k, chords };
    }
    if (!hasChordSet(k)) return k;
    if (sectionsHaveChords(k.chords)) moved.push(k.key);
    const chords = Object.fromEntries(
      SECTIONS.map((s) => {
        const r = realignChords(k.chords[s] ?? '', words[s] ?? '');
        dropped += r.dropped;
        return [s, r.text === '' ? null : r.text];
      }),
    ) as KeyChords;
    return { ...k, chords };
  });
  return { lyrics, keys, moved, dropped };
}

/**
 * Brings every key's chords onto the current words, for a song whose lyrics were changed
 * somewhere that didn't update its chords (an import, an older app version).
 */
export function alignChordsToLyrics(keys: KeyRow[], lyrics: LyricsSlice['lyrics']): KeyRow[] {
  return keys.map((k) => {
    if (!hasChordSet(k)) return k;
    let changed = false;
    const chords = Object.fromEntries(
      SECTIONS.map((s) => {
        const text = k.chords[s] ?? null;
        const words = lyrics[s] ?? null;
        if (chordsMatchLyrics(text, words) && (text === null) === (words === null))
          return [s, text];
        changed = true;
        const moved = realignChords(text ?? '', words ?? '').text;
        return [s, moved === '' ? null : moved];
      }),
    ) as KeyChords;
    return changed ? { ...k, chords } : k;
  });
}

/** Client-side check before saving: every key's chords keep the song's words. */
export function chordWordErrors(
  keys: readonly KeyRow[],
  lyrics: LyricsSlice['lyrics'],
): Record<string, string[]> {
  const errors: Record<string, string[]> = {};
  keys.forEach((k, i) => {
    if (!sectionsHaveChords(k.chords)) return;
    for (const s of SECTIONS) {
      if (!chordsMatchLyrics(k.chords![s], lyrics[s])) {
        errors[`chords.${i}.${s}`] = [
          `${SECTION_LABEL[s]} in ${k.key} has different words from the lyrics; only chords can differ`,
        ];
      }
    }
  });
  return errors;
}
