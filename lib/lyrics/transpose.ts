/**
 * Transposing inline chords between keys (LIB-23; TODO #2). Pure.
 *
 * Only bracket contents that start with a note name are treated as chords; marks such as
 * `[N.C.]`, `[x2]` or `[|]` are left alone. A chord's root and slash bass move; its quality
 * (m7, sus4, add9, b5 …) is kept as written.
 */

export type Spelling = 'sharp' | 'flat';

const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'] as const;
const NATURAL: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** Major keys and minor keys whose signatures use flats (C and Am use neither: sharps). */
const FLAT_KEYS = new Set([
  'F',
  'Bb',
  'Eb',
  'Ab',
  'Db',
  'Gb',
  'Cb',
  'Dm',
  'Gm',
  'Cm',
  'Fm',
  'Bbm',
  'Ebm',
  'Abm',
]);

const NOTE = /^([A-G])(#|b)?/;

/** Semitone of a note name like "F#", "Bb", "E" (0 = C), or null. */
export function noteIndex(note: string): number | null {
  const m = NOTE.exec(note);
  if (!m) return null;
  const shift = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
  return (NATURAL[m[1]!]! + shift + 12) % 12;
}

/** The spelling a key's signature uses: flats for F, B♭, E♭ … and d, g, c … minor; else sharps. */
export function keySpelling(key: string): Spelling {
  if (FLAT_KEYS.has(key)) return 'flat';
  if (/^[A-G]#/.test(key)) return 'sharp';
  if (/^[A-G]b/.test(key)) return 'flat';
  return 'sharp';
}

/** Semitones from one key to another (roots only; "m" is ignored), 0–11. */
export function semitonesBetween(fromKey: string, toKey: string): number | null {
  const from = noteIndex(fromKey);
  const to = noteIndex(toKey);
  if (from === null || to === null) return null;
  return (to - from + 12) % 12;
}

function moveNote(note: string, semitones: number, spelling: Spelling): string {
  const i = noteIndex(note)!;
  const names = spelling === 'flat' ? FLAT_NAMES : SHARP_NAMES;
  return names[(i + semitones + 12) % 12]!;
}

/** A chord symbol moved by `semitones`, e.g. ("D/F#", 2, 'sharp') → "E/G#". Non-chords unchanged. */
export function transposeChord(chord: string, semitones: number, spelling: Spelling): string {
  const root = NOTE.exec(chord);
  if (!root) return chord;
  const rest = chord.slice(root[0].length);
  // A slash bass is a note name after the last "/" (C6/9 has no bass: "9" isn't a note).
  const bass = /\/([A-G](?:#|b)?)$/.exec(rest);
  const quality = bass ? rest.slice(0, bass.index) : rest;
  const movedBass = bass ? `/${moveNote(bass[1]!, semitones, spelling)}` : '';
  return `${moveNote(root[0], semitones, spelling)}${quality}${movedBass}`;
}

/**
 * Chorded text moved from one key to another. Every `[chord]` is transposed; spacing inside
 * brackets is kept. `spelling` defaults to the target key's signature.
 */
export function transposeChordText(
  text: string,
  fromKey: string,
  toKey: string,
  spelling: Spelling = keySpelling(toKey),
): string {
  const semitones = semitonesBetween(fromKey, toKey);
  if (semitones === null) return text;
  return text.replace(/\[([^[\]\n]{1,16})\]/g, (_, inner: string) => {
    const moved = inner.replace(/\S+/g, (token) => transposeChord(token, semitones, spelling));
    return `[${moved}]`;
  });
}
