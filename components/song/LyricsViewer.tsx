'use client';

import { GuitarIcon } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Toggle } from '@/components/ui/toggle';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { hasChords } from '@/lib/lyrics/chords';
import {
  SECTIONS,
  SECTION_LABEL,
  type Section,
  type SongChords,
  type SongLyrics,
} from '@/types/domain';
import { ChordLyrics } from './ChordLyrics';

export type LyricsViewerMode = 'arrangement' | 'sections';

export interface LyricsViewerProps {
  lyrics: SongLyrics;
  arrangement: Section[];
  /** Initial view. Defaults to 'arrangement' (as sung); the reader can switch. */
  mode?: LyricsViewerMode;
  /** Chords over the lyrics (LIB-22). When any section has chords, a "Chords" toggle shows. */
  chords?: SongChords | null;
}

/** Remembers whether the reader last hid the chords (`localStorage`). */
export const SHOW_CHORDS_STORAGE_KEY = 'lyrics:show-chords';

function readShowChords(): boolean {
  try {
    return window.localStorage.getItem(SHOW_CHORDS_STORAGE_KEY) !== 'false';
  } catch {
    return true;
  }
}

function writeShowChords(show: boolean): void {
  try {
    window.localStorage.setItem(SHOW_CHORDS_STORAGE_KEY, String(show));
  } catch {
    // Storage can be unavailable (private mode); the toggle still works for this page.
  }
}

export interface LyricsBlock {
  section: Section;
  text: string | null;
  /** 1-based count of this section so far in the arrangement; >1 is a repeat. */
  occurrence: number;
}

const hasText = (t: string | null | undefined): t is string => !!t && t.trim().length > 0;

/** Sections in arrangement order; repeats keep their text and carry an occurrence count. */
export function arrangementBlocks(lyrics: SongLyrics, arrangement: Section[]): LyricsBlock[] {
  const seen = new Map<Section, number>();
  return arrangement.map((section) => {
    const occurrence = (seen.get(section) ?? 0) + 1;
    seen.set(section, occurrence);
    const text = lyrics[section];
    return { section, text: hasText(text) ? text : null, occurrence };
  });
}

/** Sections with lyrics, in fixed order (chorus, verse 1–5, bridge). */
export function sectionBlocks(lyrics: SongLyrics): LyricsBlock[] {
  return SECTIONS.filter((s) => hasText(lyrics[s])).map((section) => ({
    section,
    text: lyrics[section],
    occurrence: 1,
  }));
}

/** Sections that have lyrics but aren't sung in the arrangement. */
export function unsungSections(lyrics: SongLyrics, arrangement: Section[]): Section[] {
  const sung = new Set(arrangement);
  return SECTIONS.filter((s) => !sung.has(s) && hasText(lyrics[s]));
}

function Block({
  block,
  idBase,
  index,
  chordText,
}: {
  block: LyricsBlock;
  idBase: string;
  index: number;
  /** The section with chords inline; shown instead of the plain text when it has chords. */
  chordText?: string | null;
}) {
  const headingId = `${idBase}-${index}`;
  const repeat = block.occurrence > 1;
  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-1"
      data-section={block.section}
    >
      <h3 id={headingId} className="flex items-baseline gap-2 text-sm font-semibold">
        {SECTION_LABEL[block.section]}
        {repeat ? (
          <span className="rounded-chip bg-muted px-1.5 py-0.5 text-xs font-medium text-foreground">
            <span className="sr-only">, </span>repeat
          </span>
        ) : null}
      </h3>
      {block.text === null ? (
        <p className="text-sm text-muted-foreground italic">No lyrics for this section</p>
      ) : hasChords(chordText) ? (
        <ChordLyrics text={chordText!} className="text-lg leading-snug" />
      ) : (
        <p className="text-lg leading-relaxed whitespace-pre-line">{block.text}</p>
      )}
    </section>
  );
}

/**
 * Readable lyrics (REQ-ROW-03): as sung, in arrangement order with repeats labelled, or by
 * section. Falls back to by-section when there's no arrangement. Props only.
 */
export function LyricsViewer({
  lyrics,
  arrangement,
  mode = 'arrangement',
  chords,
}: LyricsViewerProps) {
  const [view, setView] = useState<LyricsViewerMode>(mode);
  useEffect(() => setView(mode), [mode]);
  const idBase = useId();
  const [showChords, setShowChords] = useState(true);
  useEffect(() => setShowChords(readShowChords()), []);
  const chorded = !!chords && SECTIONS.some((s) => hasChords(chords.sections[s]));
  const chordText = (section: Section) =>
    chorded && showChords ? chords!.sections[section] : null;

  const bySection = sectionBlocks(lyrics);
  if (bySection.length === 0) {
    return <p className="text-sm text-muted-foreground">No lyrics yet</p>;
  }

  const hasArrangement = arrangement.length > 0;
  const effective: LyricsViewerMode = hasArrangement ? view : 'sections';
  const blocks = effective === 'arrangement' ? arrangementBlocks(lyrics, arrangement) : bySection;
  const unsung = effective === 'arrangement' ? unsungSections(lyrics, arrangement) : [];

  const chordsToggle = chorded ? (
    <div className="flex flex-wrap items-center gap-2">
      <Toggle
        variant="outline"
        size="sm"
        className="min-h-tap px-3"
        pressed={showChords}
        onPressedChange={(on) => {
          setShowChords(on);
          writeShowChords(on);
        }}
      >
        <GuitarIcon aria-hidden />
        Chords
      </Toggle>
      {chords!.key ? (
        <span className="text-xs text-muted-foreground">Chords in {chords!.key}</span>
      ) : null}
    </div>
  ) : null;

  return (
    <article className="flex flex-col gap-4" aria-label="Lyrics">
      {chordsToggle}
      {hasArrangement ? (
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={view}
          onValueChange={(v) => {
            if (v === 'arrangement' || v === 'sections') setView(v);
          }}
          aria-label="Lyrics order"
        >
          <ToggleGroupItem value="arrangement" className="min-h-tap px-3">
            As sung
          </ToggleGroupItem>
          <ToggleGroupItem value="sections" className="min-h-tap px-3">
            By section
          </ToggleGroupItem>
        </ToggleGroup>
      ) : (
        <p className="text-xs text-muted-foreground">No arrangement yet; showing by section.</p>
      )}

      {blocks.map((b, i) => (
        <Block
          key={`${effective}-${i}`}
          block={b}
          idBase={idBase}
          index={i}
          chordText={chordText(b.section)}
        />
      ))}

      {unsung.length > 0 ? (
        <section aria-labelledby={`${idBase}-unsung`} className="flex flex-col gap-3 border-t pt-3">
          <h3
            id={`${idBase}-unsung`}
            className="text-xs font-semibold text-muted-foreground uppercase"
          >
            Not in the arrangement
          </h3>
          {unsung.map((section, i) => (
            <Block
              key={section}
              block={{ section, text: lyrics[section], occurrence: 1 }}
              idBase={`${idBase}-unsung`}
              index={i}
              chordText={chordText(section)}
            />
          ))}
        </section>
      ) : null}
    </article>
  );
}

/**
 * Loading state while lyrics are fetched.
 * `announce={false}` drops the status role and label, for a page skeleton that announces
 * itself once (an `aria-label` needs a role: axe `aria-prohibited-attr`).
 */
export function LyricsViewerSkeleton({ announce = true }: { announce?: boolean } = {}) {
  return (
    <div
      className="flex flex-col gap-4"
      aria-busy="true"
      {...(announce ? { role: 'status', 'aria-label': 'Loading lyrics' } : {})}
    >
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex flex-col gap-2">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-5/6" />
        </div>
      ))}
    </div>
  );
}
