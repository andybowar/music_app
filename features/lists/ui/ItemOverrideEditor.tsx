'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';

import { displayKey } from '@/components/song/KeyBadge';
import { CHORD_SLOT_LABEL, chordText } from '@/components/song/panels/KeyPanel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/components/ui/utils';
import {
  CHORD_SLOTS,
  ENERGY_LEVELS,
  ENERGY_META,
  MAJOR_KEYS,
  MISSING_CHORD,
  type ChordSlot,
  type EnergyLevel,
  type ResolvedItem,
  type SongKey,
} from '@/types/domain';
import type { ListItemPatch } from '@/types/validation';

export interface ItemOverrideEditorProps {
  resolved: ResolvedItem;
  /** The song's keys (with first chords). Empty when they aren't loaded; then `resolved` decides. */
  keys: SongKey[];
  /** Called with only the fields that changed; `null` clears an override. */
  onChange(patch: ListItemPatch): void;
}

const BPM_MIN = 20;
const BPM_MAX = 300;

/** Every key the override select offers, majors then minors (e.g. "C" … "B", "Cm" … "Bm"). */
export const ALL_KEYS: readonly string[] = [...MAJOR_KEYS, ...MAJOR_KEYS.map((k) => `${k}m`)];

/** Where to upload files for a key the song doesn't have yet. */
export const songEditHref = (songId: string) => `/songs/${encodeURIComponent(songId)}/edit`;

/** Parse the BPM field: '' → null (use the song's tempo), a whole number in range, or an error. */
export function parseBpm(raw: string): { ok: true; value: number | null } | { ok: false } {
  const text = raw.trim();
  if (text === '') return { ok: true, value: null };
  if (!/^\d+$/.test(text)) return { ok: false };
  const value = Number(text);
  return value >= BPM_MIN && value <= BPM_MAX ? { ok: true, value } : { ok: false };
}

/**
 * What a setlist row shows for a chosen key (REQ-LIST-04): first chords from that key's
 * `song_keys` row, or "X" in every slot plus an upload prompt when the song has no such row.
 * With no `keys` loaded, falls back to the server-resolved values.
 */
export function previewForKey(
  resolved: ResolvedItem,
  keys: readonly SongKey[],
  overrideKey: string | null,
): { key: string | null; chords: Record<ChordSlot, string>; needsUpload: boolean } {
  const primary = keys.find((k) => k.isPrimary)?.key ?? resolved.song.primaryKey;
  const key = overrideKey ?? primary ?? null;
  if (keys.length === 0) {
    if (key === resolved.key) {
      return { key, chords: resolved.firstChords, needsUpload: resolved.needsUpload };
    }
    // Keys not loaded and a different key chosen: we can't know its chords yet.
    return { key, chords: missingChords(), needsUpload: false };
  }
  const row = key === null ? undefined : keys.find((k) => k.key === key);
  const chords = Object.fromEntries(
    CHORD_SLOTS.map((slot) => [slot, row ? chordText(row.firstChords[slot]) : MISSING_CHORD]),
  ) as Record<ChordSlot, string>;
  return { key, chords, needsUpload: key !== null && row === undefined };
}

function missingChords(): Record<ChordSlot, string> {
  return Object.fromEntries(CHORD_SLOTS.map((s) => [s, MISSING_CHORD])) as Record<
    ChordSlot,
    string
  >;
}

const selectClass =
  'h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-base outline-none ' +
  'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 md:text-sm';

/**
 * First chords for one key, "X" where unknown (REQ-LIST-04). Led by a visible "First chords"
 * label so the slots don't read as a key per section (LIST-10).
 */
export function FirstChords({
  chords,
  className,
}: {
  chords: Record<ChordSlot, string>;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm', className)}>
      <span aria-hidden="true" className="font-medium">
        First chords
      </span>
      <dl aria-label="First chords" className="contents">
        {CHORD_SLOTS.map((slot) => (
          <div key={slot} className="flex gap-1">
            <dt className="text-muted-foreground">{CHORD_SLOT_LABEL[slot]}</dt>
            <dd
              className={cn('font-semibold', chords[slot] === MISSING_CHORD && 'text-destructive')}
              aria-label={chords[slot] === MISSING_CHORD ? 'X, not known' : undefined}
            >
              {chords[slot] === MISSING_CHORD ? MISSING_CHORD : displayKey(chords[slot])}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/**
 * Prompt shown when the chosen key has no chords or files (REQ-LIST-04). `linked` adds the
 * "Upload files for {key}" link to the song's edit page; pass false for read-only viewers.
 */
export function UploadPrompt({
  songId,
  songKey,
  linked = true,
}: {
  songId: string;
  songKey: string;
  linked?: boolean;
}) {
  return (
    <p className="text-sm">
      No chords or files for {displayKey(songKey)} yet.
      {linked && (
        <>
          {' '}
          <Link
            href={songEditHref(songId)}
            className="inline-flex min-h-tap items-center font-medium underline underline-offset-4 outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
          >
            Upload files for {displayKey(songKey)}
          </Link>
        </>
      )}
    </p>
  );
}

/**
 * Per-song overrides for one setlist item (REQ-LIST-04): key, BPM and energy for this event
 * only; the song in the library is unchanged. Key and energy apply as soon as they're picked;
 * BPM applies on Enter or when the field loses focus.
 */
export function ItemOverrideEditor({ resolved, keys, onChange }: ItemOverrideEditorProps) {
  const { item, song } = resolved;
  const id = useId();
  const [overrideKey, setOverrideKey] = useState<string | null>(item.overrideKey);
  const [bpmText, setBpmText] = useState(item.overrideBpm === null ? '' : String(item.overrideBpm));
  const [bpmError, setBpmError] = useState(false);
  // Last BPM sent, so Enter followed by blur saves once.
  const sentBpm = useRef(item.overrideBpm);
  const [energy, setEnergy] = useState<EnergyLevel | null>(item.overrideEnergy);

  // Follow the saved values when the item changes underneath us (e.g. after a refresh).
  useEffect(() => setOverrideKey(item.overrideKey), [item.overrideKey]);
  useEffect(() => setEnergy(item.overrideEnergy), [item.overrideEnergy]);
  useEffect(() => {
    setBpmText(item.overrideBpm === null ? '' : String(item.overrideBpm));
    setBpmError(false);
    sentBpm.current = item.overrideBpm;
  }, [item.overrideBpm]);

  const usualKey = keys.find((k) => k.isPrimary)?.key ?? song.primaryKey;
  const withCharts = keys.map((k) => k.key);
  const otherKeys = ALL_KEYS.filter((k) => !withCharts.includes(k));
  // An override outside both lists (e.g. an unusual spelling) must still be selectable.
  if (overrideKey && !withCharts.includes(overrideKey) && !otherKeys.includes(overrideKey)) {
    otherKeys.unshift(overrideKey);
  }
  const preview = previewForKey(resolved, keys, overrideKey);
  const hasOverride =
    item.overrideKey !== null || item.overrideBpm !== null || item.overrideEnergy !== null;

  function changeKey(value: string) {
    const next = value === '' ? null : value;
    setOverrideKey(next);
    if (next !== item.overrideKey) onChange({ overrideKey: next });
  }

  function commitBpm() {
    const parsed = parseBpm(bpmText);
    if (!parsed.ok) {
      setBpmError(true);
      return;
    }
    setBpmError(false);
    if (parsed.value === sentBpm.current) return;
    sentBpm.current = parsed.value;
    onChange({ overrideBpm: parsed.value });
  }

  function onBpmSubmit(e: FormEvent) {
    e.preventDefault();
    commitBpm();
  }

  function changeEnergy(value: string) {
    const next = value === '' ? null : (value as EnergyLevel);
    setEnergy(next);
    if (next !== item.overrideEnergy) onChange({ overrideEnergy: next });
  }

  function reset() {
    setOverrideKey(null);
    setBpmText('');
    setBpmError(false);
    setEnergy(null);
    sentBpm.current = null;
    onChange({ overrideKey: null, overrideBpm: null, overrideEnergy: null });
  }

  return (
    <div className="flex flex-col gap-4" data-testid="item-override-editor">
      <p className="text-sm text-muted-foreground">
        Changes apply to this setlist only. The song in the library stays the same.
      </p>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-key`} className="text-sm font-medium">
          Key
        </label>
        <select
          id={`${id}-key`}
          className={selectClass}
          value={overrideKey ?? ''}
          onChange={(e) => changeKey(e.target.value)}
        >
          <option value="">{usualKey ? `Usual key (${displayKey(usualKey)})` : 'Usual key'}</option>
          {withCharts.length > 0 && (
            <optgroup label="Keys with chords">
              {withCharts.map((k) => (
                <option key={k} value={k}>
                  {displayKey(k)}
                </option>
              ))}
            </optgroup>
          )}
          <optgroup label={withCharts.length > 0 ? 'Other keys' : 'Keys'}>
            {otherKeys.map((k) => (
              <option key={k} value={k}>
                {displayKey(k)}
              </option>
            ))}
          </optgroup>
        </select>
      </div>

      <section aria-label="First chords" className="flex flex-col gap-2 rounded-md border p-3">
        <h3 className="text-sm font-medium">
          First chords{preview.key ? ` in ${displayKey(preview.key)}` : ''}
        </h3>
        <FirstChords chords={preview.chords} />
        {preview.needsUpload && preview.key && (
          <UploadPrompt songId={song.id} songKey={preview.key} />
        )}
      </section>

      <form className="flex flex-col gap-1.5" onSubmit={onBpmSubmit} noValidate>
        <label htmlFor={`${id}-bpm`} className="text-sm font-medium">
          BPM
        </label>
        <Input
          id={`${id}-bpm`}
          inputMode="numeric"
          className="h-10"
          placeholder={song.tempoBpm === null ? 'Not set' : `Usual: ${song.tempoBpm}`}
          value={bpmText}
          aria-invalid={bpmError || undefined}
          aria-describedby={bpmError ? `${id}-bpm-error` : undefined}
          onChange={(e) => setBpmText(e.target.value)}
          onBlur={commitBpm}
        />
        {bpmError && (
          <p id={`${id}-bpm-error`} className="text-sm text-destructive">
            Enter a whole number from {BPM_MIN} to {BPM_MAX}, or leave it empty.
          </p>
        )}
      </form>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-energy`} className="text-sm font-medium">
          Energy
        </label>
        <select
          id={`${id}-energy`}
          className={selectClass}
          value={energy ?? ''}
          onChange={(e) => changeEnergy(e.target.value)}
        >
          <option value="">
            {song.energyLevel
              ? `Usual energy (${ENERGY_META[song.energyLevel].label})`
              : 'Usual energy'}
          </option>
          {ENERGY_LEVELS.map((level) => (
            <option key={level} value={level}>
              {ENERGY_META[level].label}
            </option>
          ))}
        </select>
      </div>

      {hasOverride && (
        <Button type="button" variant="outline" className="min-h-tap self-start" onClick={reset}>
          Use the song&apos;s usual values
        </Button>
      )}
    </div>
  );
}
