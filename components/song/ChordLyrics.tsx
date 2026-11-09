import type { CSSProperties, ReactNode } from 'react';

import { cn } from '@/components/ui/utils';
import { parseChordLine, type ChordSegment } from '@/lib/lyrics/chords';

export interface ChordLyricsProps {
  /** Lyrics with chords inline, e.g. "[G]Amazing [C]grace". Line breaks are kept. */
  text: string;
  className?: string;
  style?: CSSProperties;
  /** How to show each chord (e.g. a capo shape); defaults to the chord as written. */
  chordLabel?(chord: string): ReactNode;
}

/** A piece of one word: the chord played on it (if any) and the letters under the chord. */
type Piece = ChordSegment;

/**
 * Groups a line's segments into words, so the line wraps between words and never splits a
 * word whose chord sits mid-word ("A[G]mazing").
 */
export function chordWords(segments: ChordSegment[]): Piece[][] {
  const words: Piece[][] = [];
  let word: Piece[] = [];
  const close = () => {
    if (word.length) words.push(word);
    word = [];
  };
  for (const { chord, text } of segments) {
    if (/\s$/.test(word[word.length - 1]?.text ?? '')) close();
    // Split after each run of spaces, keeping the spaces on the word before.
    const parts = text.split(/(?<=\s)(?=\S)/);
    parts.forEach((part, i) => {
      if (i > 0) close();
      word.push({ chord: i === 0 ? chord : null, text: part });
    });
  }
  close();
  return words;
}

/** Keeps an empty chord or lyric row one line tall, so the rows of a line stay aligned. */
const NBSP = '\u00a0';

const chordClass = 'pe-1 text-[0.8em] leading-tight font-bold';

function ChordLine({ line, label }: { line: string; label(chord: string): ReactNode }) {
  const segments = parseChordLine(line);
  if (segments.every((s) => s.chord === null)) {
    return line.trim() ? <span className="block">{line}</span> : <span className="block h-3" />;
  }
  // Chords only (an intro or a turnaround): one row of chords, no lyric row under it.
  if (segments.every((s) => !s.text.trim())) {
    return (
      <span className="flex flex-wrap gap-x-3" data-chord-line="">
        {segments.map((s, i) =>
          s.chord ? (
            <span key={i} className={chordClass}>
              {label(s.chord)}
            </span>
          ) : null,
        )}
      </span>
    );
  }
  return (
    <span className="flex flex-wrap items-end">
      {chordWords(segments).map((word, w) => (
        <span key={w} className="inline-flex">
          {word.map((piece, p) => (
            <span key={p} className="inline-flex flex-col">
              <span className={chordClass} aria-hidden={piece.chord ? undefined : true}>
                {piece.chord ? label(piece.chord) : NBSP}
              </span>
              <span className="whitespace-pre">{piece.text || NBSP}</span>
            </span>
          ))}
        </span>
      ))}
    </span>
  );
}

/**
 * Lyrics with each chord shown above the syllable it's played on (LIB-22). Lines without
 * chords render as plain text; lines of only chords render as a row of chords.
 */
export function ChordLyrics({ text, className, style, chordLabel }: ChordLyricsProps) {
  const label = chordLabel ?? ((chord: string) => chord);
  return (
    <div className={cn('flex flex-col', className)} style={style} data-chords="">
      {text.split(/\r\n?|\n/).map((line, i) => (
        <ChordLine key={i} line={line} label={label} />
      ))}
    </div>
  );
}
