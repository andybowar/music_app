/**
 * Transposing inline chords between keys (LIB-23; TODO #2). Pure.
 *
 * Music rules followed (owner's notes, 2026-11-05):
 * - There are 12 notes; five have two names (C#/Db, D#/Eb, F#/Gb, G#/Ab, A#/Bb). A sharp raises
 *   a note by a half step, a flat lowers it by one.
 * - Transposing moves every chord's root (and slash bass) by the same number of half steps. The
 *   chord's quality stays: a minor chord stays minor (Em → F#m), m7b5 stays m7b5.
 * - Only keys of the same kind transpose into each other: major to major, minor to minor
 *   (`canTranspose`). Moving G's chords into Em would give A-major chords labelled Em.
 * - **Spelling by the key** (the default): each note is named by its place in the target key,
 *   the way the key's scale names it, so chords in the key have the key's own sharps or flats,
 *   and notes outside it get the usual names: the flat 2nd, 3rd, 6th and 7th as flats and the
 *   raised 4th as a sharp. In C: C D♭ D E♭ E F F♯ G A♭ A B♭ B. In D: D E♭ E F F♯ G G♯ A B♭ B C C♯.
 *   Names the owner asked us not to bother with (E♯, B♯, C♭, F♭, double sharps and flats) are
 *   swapped for their plain name (F, C, B, E).
 * - "All sharps" / "All flats" override that for charts that want one or the other.
 *
 * Only bracket contents that start with a note name are treated as chords; marks such as
 * `[N.C.]`, `[x2]` or `[|]` are left alone.
 */

/** How transposed notes are named. */
export type Spelling = 'key' | 'sharp' | 'flat';

export const SPELLING_LABEL: Record<Spelling, string> = {
  key: 'Spell by the key',
  sharp: 'All sharps (♯)',
  flat: 'All flats (♭)',
};

const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const;
const NATURAL: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'] as const;
/** Spellings left out on purpose; each is swapped for its plain name. */
const AVOIDED = new Set(['E#', 'B#', 'Cb', 'Fb']);

/**
 * Letters above the key's tonic for each half step above it: 1, ♭2, 2, ♭3, 3, 4, ♯4, 5, ♭6, 6,
 * ♭7, 7. The same for major and minor keys (in A minor: A B♭ B C C♯ D D♯ E F F♯ G G♯).
 */
const LETTER_STEPS = [0, 1, 1, 2, 2, 3, 3, 4, 5, 5, 6, 6] as const;

/** Major keys and minor keys whose signatures use flats (C and Am use neither). */
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

/** Half steps above C of a note name like "F#", "Bb", "E" (0 = C), or null. */
export function noteIndex(note: string): number | null {
  const m = NOTE.exec(note);
  if (!m) return null;
  const shift = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
  return (NATURAL[m[1]!]! + shift + 12) % 12;
}

/** Whether a key is minor ("Em", "F#m") rather than major ("G", "Bb"). */
export const isMinorKey = (key: string): boolean => /^[A-G](#|b)?m$/.test(key);

/** Whether chords can be transposed from one key into the other: both major, or both minor. */
export function canTranspose(fromKey: string, toKey: string): boolean {
  return (
    noteIndex(fromKey) !== null &&
    noteIndex(toKey) !== null &&
    isMinorKey(fromKey) === isMinorKey(toKey)
  );
}

/** Whether a key's signature uses sharps or flats (sharps for C and Am, which have neither). */
export function keySignature(key: string): 'sharp' | 'flat' {
  if (FLAT_KEYS.has(key)) return 'flat';
  if (/^[A-G]#/.test(key)) return 'sharp';
  if (/^[A-G]b/.test(key)) return 'flat';
  return 'sharp';
}

/** Half steps from one key's tonic up to another's, 0–11. */
export function semitonesBetween(fromKey: string, toKey: string): number | null {
  const from = noteIndex(fromKey);
  const to = noteIndex(toKey);
  if (from === null || to === null) return null;
  return (to - from + 12) % 12;
}

/** The name of a note (0–11) in `key`, by its place in the key (see the module notes). */
export function noteNameInKey(note: number, key: string): string {
  const tonic = NOTE.exec(key);
  const tonicIndex = noteIndex(key);
  const plain = () => (keySignature(key) === 'flat' ? FLAT_NAMES : SHARP_NAMES)[note]!;
  if (!tonic || tonicIndex === null) return plain();
  const degree = (note - tonicIndex + 12) % 12;
  const letter =
    LETTERS[(LETTERS.indexOf(tonic[1] as (typeof LETTERS)[number]) + LETTER_STEPS[degree]!) % 7]!;
  const offset = (note - NATURAL[letter]! + 12) % 12;
  const name =
    offset === 0 ? letter : offset === 1 ? `${letter}#` : offset === 11 ? `${letter}b` : null;
  return name === null || AVOIDED.has(name) ? plain() : name;
}

/** Names a note (0–11) for the target key under a spelling choice. */
function nameNote(note: number, toKey: string, spelling: Spelling): string {
  if (spelling === 'sharp') return SHARP_NAMES[note]!;
  if (spelling === 'flat') return FLAT_NAMES[note]!;
  return noteNameInKey(note, toKey);
}

/**
 * A chord symbol moved by `semitones` into `toKey`, e.g. ("D/F#", 2, "A") → "E/G#". The quality
 * after the root is kept; a slash bass moves too (C6/9 has none: "9" isn't a note). Anything
 * that doesn't start with a note name comes back unchanged.
 */
export function transposeChord(
  chord: string,
  semitones: number,
  toKey: string,
  spelling: Spelling = 'key',
): string {
  const root = NOTE.exec(chord);
  if (!root) return chord;
  const move = (name: string) =>
    nameNote((noteIndex(name)! + semitones + 12) % 12, toKey, spelling);
  const rest = chord.slice(root[0].length);
  const bass = /\/([A-G](?:#|b)?)$/.exec(rest);
  const quality = bass ? rest.slice(0, bass.index) : rest;
  return `${move(root[0])}${quality}${bass ? `/${move(bass[1]!)}` : ''}`;
}

/**
 * Chorded text moved from one key to another: every `[chord]` is transposed (spacing inside the
 * brackets kept). Text comes back unchanged when the keys can't be transposed into each other
 * (`canTranspose`): callers should only offer keys of the same kind.
 */
export function transposeChordText(
  text: string,
  fromKey: string,
  toKey: string,
  spelling: Spelling = 'key',
): string {
  const semitones = semitonesBetween(fromKey, toKey);
  if (semitones === null || !canTranspose(fromKey, toKey)) return text;
  return text.replace(/\[([^[\]\n]{1,16})\]/g, (_, inner: string) => {
    const moved = inner.replace(/\S+/g, (token) =>
      transposeChord(token, semitones, toKey, spelling),
    );
    return `[${moved}]`;
  });
}
