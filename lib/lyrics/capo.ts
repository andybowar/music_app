/**
 * Capo (2026-11-05 owner request). Pure.
 *
 * With a capo on fret n, a guitarist plays chord *shapes* n half steps below the chords that
 * sound, so the song stays in its key. E.g. a song in A♭ with the capo on fret 1 is played with
 * G shapes. Shapes are named by the key they're played in (`noteNameInKey`), so G-shape songs
 * show F♯, not G♭.
 */
import { isMinorKey, noteIndex, transposeChord } from './transpose';

export const CAPO_MAX = 7;

const MAJOR_KEY_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'] as const;
const MINOR_KEY_NAMES = [
  'Cm',
  'C#m',
  'Dm',
  'Ebm',
  'Em',
  'Fm',
  'F#m',
  'Gm',
  'G#m',
  'Am',
  'Bbm',
  'Bm',
];

/** Whole frets from 0 (no capo) to CAPO_MAX; anything else is 0. */
export function clampCapo(value: unknown): number {
  const n = typeof value === 'string' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isInteger(n)) return 0;
  return Math.min(CAPO_MAX, Math.max(0, n));
}

/** The key the shapes are played in: `key` lowered by `capo` half steps ("Ab", 1 → "G"). */
export function shapeKey(key: string, capo: number): string | null {
  const root = noteIndex(key);
  if (root === null) return null;
  const i = (root - capo + 120) % 12;
  return isMinorKey(key) ? MINOR_KEY_NAMES[i]! : MAJOR_KEY_NAMES[i]!;
}

/**
 * The shape to play for a sounding chord with the capo on `capo` in `key`. Marks (N.C., x2)
 * and unknown keys come back unchanged; capo 0 returns the chord itself.
 */
export function capoShape(chord: string, capo: number, key: string | null): string {
  if (capo === 0) return chord;
  const shapesIn = key ? shapeKey(key, capo) : null;
  return transposeChord(chord, 12 - capo, shapesIn ?? 'C', shapesIn ? 'key' : 'sharp');
}

/** The note-starting chords in chorded text, in order ("[G]a [x2] [D/F#]" → ["G", "D/F#"]). */
export function chordsInText(text: string | null | undefined): string[] {
  if (!text) return [];
  return [...text.matchAll(/\[([^[\]\n]{1,16})\]/g)].flatMap((m) =>
    m[1]!
      .trim()
      .split(/\s+/)
      .filter((t) => /^[A-G]/.test(t)),
  );
}

/** How awkward a set of shapes is: each sharp or flat note (root or bass) counts one. */
function awkwardness(shapes: string[]): number {
  let score = 0;
  for (const s of shapes) {
    if (/^[A-G][#b]/.test(s)) score += 1;
    if (/\/[A-G][#b]$/.test(s)) score += 1;
  }
  return score;
}

/**
 * The capo fret (0–CAPO_MAX) whose shapes have the fewest sharps and flats, preferring the
 * lowest fret on a tie. Null when there's nothing to judge (no chords, or an unknown key).
 */
export function suggestCapo(chords: readonly string[], key: string | null): number | null {
  if (!key || noteIndex(key) === null || chords.length === 0) return null;
  let best = 0;
  let bestScore = Infinity;
  for (let capo = 0; capo <= CAPO_MAX; capo++) {
    const score = awkwardness(chords.map((c) => capoShape(c, capo, key)));
    if (score < bestScore) {
      best = capo;
      bestScore = score;
    }
  }
  return best;
}

/** Note names with ♯/♭ for display: root and slash bass only ("F#m7/C#" → "F♯m7/C♯"). */
export function prettyChord(chord: string): string {
  return chord
    .replace(/^([A-G])#/, '$1♯')
    .replace(/^([A-G])b/, '$1♭')
    .replace(/\/([A-G])#$/, '/$1♯')
    .replace(/\/([A-G])b$/, '/$1♭');
}

// ---------- Remembered per song and key, on this device ----------

const storageKey = (songId: string, key: string) => `capo:${songId}:${key}`;

export function readCapo(songId: string, key: string | null): number {
  if (!key) return 0;
  try {
    return clampCapo(window.localStorage.getItem(storageKey(songId, key)));
  } catch {
    return 0;
  }
}

export function writeCapo(songId: string, key: string | null, capo: number): void {
  if (!key) return;
  try {
    if (capo === 0) window.localStorage.removeItem(storageKey(songId, key));
    else window.localStorage.setItem(storageKey(songId, key), String(clampCapo(capo)));
  } catch {
    // Not saved: the capo still applies until the page closes.
  }
}
