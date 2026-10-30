'use client';

import { useEffect, useId, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { SECTIONS, SECTION_LABEL, type Section, type SongLyrics } from '@/types/domain';

export type LyricsViewerMode = 'arrangement' | 'sections';

export interface LyricsViewerProps {
  lyrics: SongLyrics;
  arrangement: Section[];
  /** Initial view. Defaults to 'arrangement' (as sung); the reader can switch. */
  mode?: LyricsViewerMode;
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

function Block({ block, idBase, index }: { block: LyricsBlock; idBase: string; index: number }) {
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
          <span className="rounded-chip bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
            <span className="sr-only">, </span>repeat
          </span>
        ) : null}
      </h3>
      {block.text === null ? (
        <p className="text-sm text-muted-foreground italic">No lyrics for this section</p>
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
export function LyricsViewer({ lyrics, arrangement, mode = 'arrangement' }: LyricsViewerProps) {
  const [view, setView] = useState<LyricsViewerMode>(mode);
  useEffect(() => setView(mode), [mode]);
  const idBase = useId();

  const bySection = sectionBlocks(lyrics);
  if (bySection.length === 0) {
    return <p className="text-sm text-muted-foreground">No lyrics yet</p>;
  }

  const hasArrangement = arrangement.length > 0;
  const effective: LyricsViewerMode = hasArrangement ? view : 'sections';
  const blocks = effective === 'arrangement' ? arrangementBlocks(lyrics, arrangement) : bySection;
  const unsung = effective === 'arrangement' ? unsungSections(lyrics, arrangement) : [];

  return (
    <article className="flex flex-col gap-4" aria-label="Lyrics">
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
        <Block key={`${effective}-${i}`} block={b} idBase={idBase} index={i} />
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
            />
          ))}
        </section>
      ) : null}
    </article>
  );
}

/** Loading state while lyrics are fetched. */
export function LyricsViewerSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading lyrics">
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
