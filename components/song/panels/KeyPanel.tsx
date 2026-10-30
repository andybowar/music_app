'use client';

import { useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { CHORD_SLOTS, MISSING_CHORD, type ChordSlot, type SongKey } from '@/types/domain';
import { displayKey, spokenKey } from '../KeyBadge';

export interface KeyPanelProps {
  keys: SongKey[];
  /** Key to select first, e.g. a setlist's override key. Defaults to the primary key. */
  highlightKey?: string;
}

export const CHORD_SLOT_LABEL: Record<ChordSlot, string> = {
  intro: 'Intro',
  verse: 'Verse',
  chorus: 'Chorus',
  bridge: 'Bridge',
};

type Chords = SongKey['firstChords'];

const NO_CHORDS: Chords = { intro: null, verse: null, chorus: null, bridge: null };

/** A first chord for display: "X" when unknown (REQ-LIST-04), with ♯/♭ otherwise. */
export function chordText(chord: string | null): string {
  return chord === null || chord.trim() === '' ? MISSING_CHORD : displayKey(chord.trim());
}

/** Which key the panel opens on: the highlight if given, else the primary, else the first. */
export function initialKey(keys: readonly SongKey[], highlightKey?: string): string | null {
  if (highlightKey) return highlightKey;
  return (keys.find((k) => k.isPrimary) ?? keys[0])?.key ?? null;
}

interface KeyOption {
  key: string;
  isPrimary: boolean;
  firstChords: Chords;
}

/**
 * Key panel (REQ-ROW-02): every key the song has, and the four first chords of the chosen one.
 * A `highlightKey` with no `song_keys` row (a setlist override) is still listed, with every
 * chord "X" and a prompt to upload files for it (REQ-LIST-04).
 */
export function KeyPanel({ keys, highlightKey }: KeyPanelProps) {
  const [selected, setSelected] = useState<string | null>(() => initialKey(keys, highlightKey));
  const missingHighlight =
    highlightKey !== undefined && highlightKey !== '' && !keys.some((k) => k.key === highlightKey);

  const options: KeyOption[] = keys.map((k) => ({
    key: k.key,
    isPrimary: k.isPrimary,
    firstChords: k.firstChords,
  }));
  if (missingHighlight)
    options.push({ key: highlightKey, isPrimary: false, firstChords: NO_CHORDS });

  const current = options.find((o) => o.key === selected) ?? options[0];
  if (current === undefined) {
    return <p className="text-sm text-muted-foreground">No keys recorded for this song yet.</p>;
  }
  const noFiles = missingHighlight && current.key === highlightKey;

  return (
    <div className="space-y-3">
      <ToggleGroup
        type="single"
        variant="outline"
        size="lg"
        spacing={1}
        value={current.key}
        // Radix sends '' when the pressed item is pressed again; keep one key always selected.
        onValueChange={(v) => {
          if (v) setSelected(v);
        }}
        aria-label="Keys"
        className="w-full flex-wrap"
      >
        {options.map((o) => {
          const tags = [
            o.isPrimary ? 'usual' : null,
            o.key === highlightKey ? 'this event' : null,
          ].filter((t): t is string => t !== null);
          return (
            <ToggleGroupItem
              key={o.key}
              value={o.key}
              aria-label={[`Key ${spokenKey(o.key)}`, ...tags].join(', ')}
              className="h-auto min-h-tap min-w-tap flex-col gap-0 py-1 leading-tight data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
            >
              <span className="text-base font-semibold">{displayKey(o.key)}</span>
              {tags.length > 0 && (
                <span aria-hidden="true" className="text-[10px] font-normal opacity-70">
                  {tags.join(' · ')}
                </span>
              )}
            </ToggleGroupItem>
          );
        })}
      </ToggleGroup>

      <section aria-label={`First chords in ${spokenKey(current.key)}`} aria-live="polite">
        <dl className="grid grid-cols-4 gap-2 text-center">
          {CHORD_SLOTS.map((slot) => {
            const text = chordText(current.firstChords[slot]);
            const missing = text === MISSING_CHORD;
            return (
              <div key={slot} className="rounded-md border px-1 py-2">
                <dt className="text-xs text-muted-foreground">{CHORD_SLOT_LABEL[slot]}</dt>
                <dd
                  data-slot-chord={slot}
                  data-missing={missing || undefined}
                  className={missing ? 'text-lg font-semibold opacity-60' : 'text-lg font-semibold'}
                >
                  {text}
                  {missing && <span className="sr-only"> (not recorded)</span>}
                </dd>
              </div>
            );
          })}
        </dl>
      </section>

      {noFiles && (
        <p role="note" className="text-sm text-muted-foreground">
          No files for {displayKey(current.key)} yet, so its chords show {MISSING_CHORD}. Upload
          charts in this key to fill them in.
        </p>
      )}
    </div>
  );
}

/** Placeholder while the song's keys load. */
export function KeyPanelSkeleton() {
  return (
    <div className="space-y-3" role="status" aria-busy="true" aria-label="Loading keys">
      <div className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="size-tap" />
        ))}
      </div>
      <div className="grid grid-cols-4 gap-2">
        {CHORD_SLOTS.map((slot) => (
          <Skeleton key={slot} className="h-14" />
        ))}
      </div>
    </div>
  );
}
