'use client';

import { FolderOpen } from 'lucide-react';
import type { ReactNode } from 'react';
import { BranchCode } from '@/components/song/BranchCode';
import { ComposerName } from '@/components/song/ComposerName';
import { EnergyChip } from '@/components/song/EnergyChip';
import { KeyBadge } from '@/components/song/KeyBadge';
import { TimeSigBadge } from '@/components/song/TimeSigBadge';
import { ROW_TOKEN } from '@/components/ui/tokens';
import { cn } from '@/components/ui/utils';
import type { ResolvedItem, SongSummary } from '@/types/domain';

export interface SongRowProps {
  song: SongSummary;
  /** Setlist item values; when given, key/BPM/energy/resources come from here (REQ-LIST-04). */
  resolved?: ResolvedItem;
  /** Key → all keys with first chords. */
  onKey(): void;
  /** Title → chorus first line + verse 1 first line. */
  onTitle(): void;
  /** Composer → all composers. */
  onComposer(): void;
  /** Resources → lyrics, sheet music, audio, projection files. */
  onResources(): void;
  /** Branch code → branch usage. */
  onUsage(): void;
  /** Rendered at the far right (the ADD / add-to-list menu). */
  addSlot?: ReactNode;
  /** Rendered at the far left (setlist reorder handle). */
  dragHandle?: ReactNode;
}

/** Shared look of every tap region: >= 40×40px, visible focus ring on the dark row. */
const regionClass =
  'inline-flex min-h-tap min-w-tap shrink-0 items-center justify-center rounded-md px-1 outline-none ' +
  'hover:bg-row-foreground/10 focus-visible:ring-2 focus-visible:ring-row-foreground ' +
  'focus-visible:ring-offset-2 focus-visible:ring-offset-row';

/** Screen-reader hint appended to a region's visible content, so the name says what opens. */
function Hint({ children }: { children: string }) {
  return <span className="sr-only">, {children}</span>;
}

/** What the row shows: the song's own values, or the setlist item's resolved ones. */
export function songRowValues(song: SongSummary, resolved?: ResolvedItem) {
  if (!resolved) {
    return {
      key: song.primaryKey,
      bpm: song.tempoBpm,
      energy: song.energyLevel,
      overridden: { key: false, bpm: false, energy: false },
      resourceCount: song.resourceCount,
      needsUpload: false,
    };
  }
  return {
    key: resolved.key,
    bpm: resolved.bpm,
    energy: resolved.energy,
    overridden: resolved.isOverridden,
    resourceCount: resolved.resources.length,
    needsUpload: resolved.needsUpload,
  };
}

export function resourcesLabel(count: number, needsUpload: boolean): string {
  const files = count === 1 ? '1 file' : `${count} files`;
  return needsUpload ? `${files}, upload needed for this key` : files;
}

/**
 * One song in a search result or setlist (REQ-ROW-01, Diagram III). Left→right: BPM on the
 * energy chip, time signature, key, title, composer, year, Resources, branch code, ADD. Every
 * detail region is its own button (REQ-ROW-02) so tab order follows the visual order. Below
 * 480px (of the row's own width) the time signature hides, the title may wrap to two lines and
 * composer/year wrap under it.
 */
export function SongRow({
  song,
  resolved,
  onKey,
  onTitle,
  onComposer,
  onResources,
  onUsage,
  addSlot,
  dragHandle,
}: SongRowProps) {
  const v = songRowValues(song, resolved);

  return (
    // The row responds to its own width (container query), not the viewport, so it lays out
    // the same in a full-width result list, a narrow side panel or a phone.
    <div className="@container w-full min-w-0">
      <div
        role="group"
        aria-label={song.title}
        data-song-id={song.id}
        className={cn(
          ROW_TOKEN.surface,
          'flex w-full min-w-0 items-center gap-0.5 rounded-md px-1 py-1 @min-[480px]:gap-2 @min-[480px]:px-2',
        )}
      >
        {dragHandle !== undefined && (
          <span className="flex shrink-0 items-center" data-slot="drag-handle">
            {dragHandle}
          </span>
        )}

        {/* Narrow rows stack the chip above the key to leave room for the title. */}
        <span
          className="flex shrink-0 flex-col items-center @min-[480px]:flex-row @min-[480px]:gap-2"
          data-region="musical"
        >
          <span className="flex shrink-0 items-center">
            <EnergyChip
              energy={v.energy}
              bpm={v.bpm}
              overridden={v.overridden.bpm || v.overridden.energy}
            />
          </span>

          <span className="hidden shrink-0 items-center @min-[480px]:flex">
            <TimeSigBadge value={song.timeSignature} />
          </span>

          <button type="button" className={regionClass} onClick={onKey}>
            <KeyBadge value={v.key} overridden={v.overridden.key} />
            <Hint>show all keys</Hint>
          </button>
        </span>

        <span className="flex min-w-0 flex-1 flex-col items-start @min-[480px]:flex-row @min-[480px]:items-center @min-[480px]:gap-2">
          <button
            type="button"
            className={cn(regionClass, 'max-w-full min-w-0 shrink justify-start text-left')}
            onClick={onTitle}
          >
            <span className={cn(ROW_TOKEN.title, 'line-clamp-2 break-words @min-[480px]:truncate')}>
              {song.title}
            </span>
            <Hint>show first lines</Hint>
          </button>
          <span className="flex max-w-full min-w-0 items-center gap-1.5 text-sm">
            <button
              type="button"
              className={cn(regionClass, 'min-w-0 shrink justify-start text-left')}
              onClick={onComposer}
            >
              <span className="truncate">
                <ComposerName composers={song.composers} />
              </span>
              <Hint>show all composers</Hint>
            </button>
            {song.year !== null && (
              <span className="shrink-0 text-row-foreground/80 tabular-nums">{song.year}</span>
            )}
          </span>
        </span>

        <button
          type="button"
          className={cn(regionClass, 'gap-0.5 text-sm font-medium @min-[480px]:gap-1')}
          onClick={onResources}
          title={resourcesLabel(v.resourceCount, v.needsUpload)}
          data-needs-upload={v.needsUpload || undefined}
        >
          <span aria-hidden="true" className="hidden @min-[480px]:inline">
            Resources
          </span>
          <FolderOpen aria-hidden="true" className="size-4 @min-[480px]:hidden" />
          <span className="sr-only">Resources</span>
          <span
            aria-hidden="true"
            className={cn(
              'inline-flex h-5 min-w-5 items-center justify-center rounded-chip px-1 text-xs tabular-nums',
              v.needsUpload
                ? 'bg-energy-high_worship text-energy-high_worship-foreground'
                : 'bg-row-foreground/15',
            )}
          >
            {v.needsUpload ? '!' : v.resourceCount}
          </span>
          <span className="sr-only">
            , {resourcesLabel(v.resourceCount, v.needsUpload)}, show resources
          </span>
        </button>

        <button type="button" className={regionClass} onClick={onUsage}>
          <BranchCode code={song.addedByBranchCode} />
          <Hint>show branch usage</Hint>
        </button>

        {addSlot !== undefined && (
          <span className="flex shrink-0 items-center" data-slot="add">
            {addSlot}
          </span>
        )}
      </div>
    </div>
  );
}
