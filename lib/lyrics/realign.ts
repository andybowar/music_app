/**
 * Keeping chords in place when the words change (LIB-23). Pure.
 *
 * Each key's chords are written into its own copy of the lyrics. When the words are edited in
 * one key (or replaced by a paste), every other key's chorded text is rebuilt on the new words:
 * unchanged lines keep their chords as they are, edited lines move each chord with the letters
 * around it, and chords on lines that were removed are dropped (and counted, so the editor can
 * say so). Lines of only chords (intros, turnarounds) stay where they were.
 */
import { parseChordLine } from './chords';

interface WordLine {
  /** The line's words, as `stripChords` gives them. */
  plain: string;
  /** Chords and where they sit in `plain` (0 = before the first letter, plain.length = end). */
  chords: Array<{ pos: number; chord: string }>;
}

type OldLine = { kind: 'chords'; text: string } | ({ kind: 'words' } & WordLine);

/** Lines compare equal when they differ only in spacing. */
const norm = (line: string) => line.replace(/\s+/g, ' ').trim();

/** Splits a line into its words and chords, the way `stripChords` tidies a chorded line. */
function readLine(line: string): OldLine {
  const segments = parseChordLine(line);
  if (segments.every((s) => s.chord === null)) return { kind: 'words', plain: line, chords: [] };
  // Raw text with the chords taken out, and each chord's position in it.
  let raw = '';
  const at: Array<{ pos: number; chord: string }> = [];
  for (const s of segments) {
    if (s.chord !== null) at.push({ pos: raw.length, chord: s.chord });
    raw += s.text;
  }
  if (!raw.trim()) return { kind: 'chords', text: line };
  // Collapse runs of spaces and trim, mapping each raw index to its tidied index.
  const map: number[] = [];
  let plain = '';
  for (let i = 0; i < raw.length; i++) {
    map.push(plain.length);
    const ch = raw[i]!;
    if (ch === ' ' && (plain.length === 0 || plain.endsWith(' '))) continue;
    plain += ch;
  }
  map.push(plain.length);
  const trimmed = plain.replace(/ +$/, '');
  return {
    kind: 'words',
    plain: trimmed,
    chords: at.map(({ pos, chord }) => ({ pos: Math.min(map[pos]!, trimmed.length), chord })),
  };
}

/** Writes chords back into a line of words. */
function writeLine(plain: string, chords: WordLine['chords']): string {
  let out = plain;
  // Right to left keeps earlier positions valid; equal positions keep their order.
  for (let i = chords.length - 1; i >= 0; i--) {
    const { pos, chord } = chords[i]!;
    out = `${out.slice(0, pos)}[${chord}]${out.slice(pos)}`;
  }
  return out;
}

/** Index pairs of a longest common subsequence of `a` and `b` under `same`. */
function lcs<T>(a: readonly T[], b: readonly T[], same: (x: T, y: T) => boolean) {
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i]![j] = same(a[i]!, b[j]!)
        ? dp[i + 1]![j + 1]! + 1
        : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }
  const pairs: Array<[number, number]> = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (same(a[i]!, b[j]!)) {
      pairs.push([i, j]);
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) i++;
    else j++;
  }
  return pairs;
}

/** Moves a line's chords onto an edited version of it, letter by letter. */
function moveChords(line: WordLine, next: string): WordLine['chords'] {
  const a = [...line.plain];
  const b = [...next];
  const pairs = lcs(a, b, (x, y) => x === y);
  // Where each old index lands: its match, or (for replaced text) just after the last
  // letter before it that survived, i.e. the start of whatever replaced it.
  const match = new Map(pairs);
  const to: number[] = [];
  let after = 0;
  for (let i = 0; i <= a.length; i++) {
    const j = match.get(i);
    if (j !== undefined) {
      to.push(j);
      after = j + 1;
    } else {
      to.push(i === a.length ? Math.max(after, b.length) : after);
    }
  }
  return line.chords.map(({ pos, chord }) => ({ pos: to[pos]!, chord }));
}

export interface Realigned {
  /** The chorded text on the new words. */
  text: string;
  /** Chords that had nowhere to go (their whole line was removed). */
  dropped: number;
}

/**
 * Rebuilds `chorded` (one key's chords on the old words) on `newPlain` (the new words).
 * `stripChords(result.text)` equals `newPlain` apart from spacing.
 */
export function realignChords(chorded: string, newPlain: string): Realigned {
  const old = chorded.split('\n').map(readLine);
  const words = old.flatMap((l, i) => (l.kind === 'words' ? [{ ...l, index: i }] : []));
  const next = newPlain.split('\n');
  const pairs = lcs(
    words.map((w) => norm(w.plain)),
    next.map(norm),
    (x, y) => x === y,
  );

  // For each new line, the old word line it continues (matched, or paired by order in a gap).
  const source = new Array<number | null>(next.length).fill(null);
  let dropped = 0;
  let prevOld = -1;
  let prevNew = -1;
  for (const [oi, ni] of [...pairs, [words.length, next.length] as [number, number]]) {
    // Blank lines never take another line's chords.
    const gapOld = words
      .slice(prevOld + 1, oi)
      .map((_, k) => prevOld + 1 + k)
      .filter((o) => words[o]!.plain.trim() !== '');
    const gapNew = next
      .slice(prevNew + 1, ni)
      .map((_, k) => prevNew + 1 + k)
      .filter((n) => next[n]!.trim() !== '');
    gapNew.forEach((n, k) => {
      if (k < gapOld.length) source[n] = gapOld[k]!;
    });
    for (const o of gapOld.slice(gapNew.length)) dropped += words[o]!.chords.length;
    if (oi < words.length) source[ni] = oi;
    prevOld = oi;
    prevNew = ni;
  }

  // Chord-only lines go back in front of the word line they came before.
  const chordLinesBefore = new Map<number, string[]>();
  let pending: string[] = [];
  let wordCount = 0;
  for (const l of old) {
    if (l.kind === 'chords') pending.push(l.text);
    else {
      if (pending.length) chordLinesBefore.set(wordCount, pending);
      pending = [];
      wordCount++;
    }
  }
  const trailing = pending;

  const out: string[] = [];
  let emittedUpTo = 0; // old word lines whose chord-only lines are already out
  next.forEach((line, n) => {
    const o = source[n];
    if (o !== null && o !== undefined) {
      for (let k = emittedUpTo; k <= o; k++) out.push(...(chordLinesBefore.get(k) ?? []));
      emittedUpTo = Math.max(emittedUpTo, o + 1);
      const w = words[o]!;
      const chords =
        norm(w.plain) === norm(line) && w.plain === line ? w.chords : moveChords(w, line);
      out.push(chords.length ? writeLine(line, chords) : line);
    } else {
      out.push(line);
    }
  });
  for (let k = emittedUpTo; k <= words.length; k++) out.push(...(chordLinesBefore.get(k) ?? []));
  out.push(...trailing);
  return { text: out.join('\n'), dropped };
}
