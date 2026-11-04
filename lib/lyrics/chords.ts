/**
 * Chords over lyrics (LIB-22). Pure: no I/O, safe on client and server.
 *
 * Chords are written inline in ChordPro style: a chord in square brackets sits just before
 * the syllable it's played on, e.g. `[G]Amazing [G7]grace, how [C]sweet the [G]sound`.
 * Removing the brackets gives the plain lyrics, which is what search, first lines and the
 * lyrics columns store. A line with only chords on it (an intro or a turnaround) is dropped
 * from the plain lyrics.
 *
 * Many chord sheets put the chords on their own line above the words instead. `inlineChords`
 * converts that layout to inline brackets, lining each chord up with the column it sat over.
 */

/** A chord written inline: `[…]`, 1–16 characters, no brackets or line breaks inside. */
const INLINE_CHORD = /\[([^[\]\n]{1,16})\]/g;
const HAS_INLINE_CHORD = /\[[^[\]\n]{1,16}\]/;

/**
 * A chord symbol on a chord-only line. Stricter than `CHORD_RE` in `@/types/domain` (which
 * also matches words like "Amazing"), so ordinary lyric lines aren't mistaken for chords.
 */
const STRICT_CHORD =
  /^[A-G](?:#|b)?(?:maj|min|m|M|dim|aug|sus|add|°|ø|\+|-)?(?:\d{1,2}|maj\d{1,2}|sus\d?|add\d{1,2}|[b#]\d{1,2}|\([^)\s]{1,8}\)|alt|°|ø|\+)*(?:\/[A-G](?:#|b)?)?$/;
/** Other marks found on chord lines; kept on chord-only lines, dropped when merging. */
const CHORD_LINE_MARK = /^(?:\||\|\||\/|-|%|\(?[x×]\d{1,2}\)?|\(?\d{1,2}[x×]\)?|N\.?C\.?)$/i;

export interface ChordSegment {
  /** The chord played at the start of `text`, or null for text before the first chord. */
  chord: string | null;
  text: string;
}

/** True when the text has at least one inline chord. */
export function hasChords(text: string | null | undefined): boolean {
  return !!text && HAS_INLINE_CHORD.test(text);
}

/**
 * Splits one line into chord + text segments.
 * `"[G]Amazing [C]grace"` → `[{ chord: 'G', text: 'Amazing ' }, { chord: 'C', text: 'grace' }]`.
 * A line without chords is one segment with `chord: null`.
 */
export function parseChordLine(line: string): ChordSegment[] {
  const segments: ChordSegment[] = [];
  let chord: string | null = null;
  let last = 0;
  for (const match of line.matchAll(INLINE_CHORD)) {
    const text = line.slice(last, match.index);
    if (chord !== null || text) segments.push({ chord, text });
    chord = match[1]!.trim();
    last = match.index + match[0].length;
  }
  const rest = line.slice(last);
  if (chord !== null || rest || segments.length === 0) segments.push({ chord, text: rest });
  return segments;
}

/**
 * The plain lyrics of chorded text. Chords are removed, the spaces they leave are tidied, and
 * lines that held only chords are dropped. Text without chords comes back unchanged.
 */
export function stripChords(text: string): string {
  if (!hasChords(text)) return text;
  const out: string[] = [];
  for (const line of text.split('\n')) {
    if (!HAS_INLINE_CHORD.test(line)) {
      out.push(line);
      continue;
    }
    const plain = line.replace(INLINE_CHORD, '').replace(/ {2,}/g, ' ').trim();
    if (plain) out.push(plain);
  }
  return out.join('\n');
}

/** Whether the plain lyrics of `chorded` match `lyrics` (ignoring outer whitespace). */
export function chordsMatchLyrics(
  chorded: string | null | undefined,
  lyrics: string | null | undefined,
): boolean {
  return stripChords(chorded ?? '').trim() === (lyrics ?? '').trim();
}

// ---------- Chords on their own line → inline ----------

function expandTabs(line: string): string {
  let out = '';
  for (const ch of line) out += ch === '\t' ? ' '.repeat(8 - (out.length % 8)) : ch;
  return out;
}

interface ChordToken {
  column: number;
  token: string;
  isChord: boolean;
}

/** The chord tokens of a line made only of chords (and bar marks), or null for any other line. */
export function chordLineTokens(line: string): ChordToken[] | null {
  if (HAS_INLINE_CHORD.test(line)) return null;
  const tokens: ChordToken[] = [];
  let chords = 0;
  for (const match of expandTabs(line).matchAll(/\S+/g)) {
    const token = match[0];
    const isChord = STRICT_CHORD.test(token);
    if (!isChord && !CHORD_LINE_MARK.test(token)) return null;
    if (isChord) chords += 1;
    tokens.push({ column: match.index, token, isChord });
  }
  return chords > 0 ? tokens : null;
}

/** Puts each chord into the lyric line at the column it sat over. */
function mergeChordLine(tokens: ChordToken[], lyric: string): string {
  let line = expandTabs(lyric).trimEnd();
  const chords = tokens.filter((t) => t.isChord || /^N\.?C\.?$/i.test(t.token));
  for (let i = chords.length - 1; i >= 0; i--) {
    const { column, token } = chords[i]!;
    if (column > line.length) line = line.padEnd(column, ' ');
    line = `${line.slice(0, column)}[${token}]${line.slice(column)}`;
  }
  return line;
}

/**
 * Converts chords written on the line above the words into inline brackets:
 *
 * ```
 * G          C       G          →  [G]Amazing grace, [C]how sweet [G]the sound
 * Amazing grace, how sweet the sound
 * ```
 *
 * A chord line followed by a blank line, another chord line, a heading (`isHeading`) or the end
 * becomes a chord-only line (`[G] [C] [D]`). Text that is already inline is left as it is.
 */
export function inlineChords(text: string, isHeading: (line: string) => boolean = () => false) {
  const lines = text.split('\n');
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const tokens = chordLineTokens(line);
    if (!tokens) {
      out.push(line);
      continue;
    }
    const next = lines[i + 1];
    const lyric =
      next !== undefined && next.trim() !== '' && !chordLineTokens(next) && !isHeading(next);
    if (lyric) {
      out.push(mergeChordLine(tokens, next));
      i += 1;
    } else {
      out.push(tokens.map((t) => `[${t.token}]`).join(' '));
    }
  }
  return out.join('\n');
}
