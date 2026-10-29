'use client';

import { PlusIcon, XIcon } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { EnergyChip } from '@/components/song/EnergyChip';
import { spokenKey } from '@/components/song/KeyBadge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { ENERGY_RING, ENERGY_TOKEN } from '@/components/ui/tokens';
import { cn } from '@/components/ui/utils';
import {
  CHORD_RE,
  CHORD_SLOTS,
  ENERGY_LEVELS,
  ENERGY_META,
  MAJOR_KEYS,
  MUSICAL_KEY_RE,
  TIME_SIGNATURE_RE,
  type ChordSlot,
  type EnergyLevel,
  type SongDetail,
} from '@/types/domain';
import { errorsFor } from './BasicInfoSection';
import type { SongFormErrors, SongFormSectionProps, SongFormValue } from './types';

export type MusicalValue = SongFormValue['musical'];
export type MusicalKeyValue = MusicalValue['keys'][number];

export interface MusicalSectionProps extends SongFormSectionProps {
  disabled?: boolean;
}

/** Limits from `songInputSchema` / `songKeysInputSchema`. */
export const MUSICAL_LIMITS = {
  tempoMin: 20,
  tempoMax: 300,
  energyNotesMax: 500,
  chordMax: 12,
  keysMin: 1,
  keysMax: 12,
} as const;

const CHORD_SLOT_LABEL: Record<ChordSlot, string> = {
  intro: 'Intro',
  verse: 'Verse',
  chorus: 'Chorus',
  bridge: 'Bridge',
};

// ---------- Pure helpers (exported for tests and the form page) ----------

/** A blank musical slice (new song). Returns a fresh object each call. */
export function emptyMusicalInfo(): MusicalValue {
  return { keys: [], tempoBpm: null, timeSignature: null, energyLevel: null, energyNotes: null };
}

/** The musical slice of an existing song (edit form). Primary key first, as stored. */
export function musicalInfoFromSong(
  song: Pick<SongDetail, 'keys' | 'tempoBpm' | 'timeSignature' | 'energyLevel' | 'energyNotes'>,
): MusicalValue {
  return {
    keys: song.keys.map((k) => ({
      id: k.id,
      key: k.key,
      isPrimary: k.isPrimary,
      firstChords: { ...k.firstChords },
    })),
    tempoBpm: song.tempoBpm,
    timeSignature: song.timeSignature,
    energyLevel: song.energyLevel,
    energyNotes: song.energyNotes,
  };
}

/** A new key row with no key chosen yet. Primary when it is the first key. */
export function newKeyRow(isPrimary: boolean): MusicalKeyValue {
  return {
    key: '',
    isPrimary,
    firstChords: { intro: null, verse: null, chorus: null, bridge: null },
  };
}

/** Splits "F#m" into its root ("F#") and minor flag; an empty key gives `{ root: '' }`. */
export function splitKey(key: string): { root: string; minor: boolean } {
  if (key.length > 1 && key.endsWith('m')) return { root: key.slice(0, -1), minor: true };
  return { root: key, minor: false };
}

export function joinKey(root: string, minor: boolean): string {
  return root ? `${root}${minor ? 'm' : ''}` : '';
}

/** Parses the BPM input; anything that isn't a whole number is `null`. */
export function parseTempo(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^\d{1,3}$/.test(trimmed)) return null;
  return Number.parseInt(trimmed, 10);
}

export const tempoInRange = (bpm: number) =>
  Number.isInteger(bpm) && bpm >= MUSICAL_LIMITS.tempoMin && bpm <= MUSICAL_LIMITS.tempoMax;

export const isValidChord = (chord: string) =>
  chord.length <= MUSICAL_LIMITS.chordMax && CHORD_RE.test(chord);

export const isValidTimeSignature = (value: string) => TIME_SIGNATURE_RE.test(value);

/** Empty or whitespace-only text is `null`. */
const nullIfBlank = (v: string) => (v.trim() === '' ? null : v);

export const MESSAGES = {
  noKeys: 'Add at least one key',
  tooManyKeys: `Up to ${MUSICAL_LIMITS.keysMax} keys`,
  noPrimary: 'Choose a primary key',
  manyPrimaries: 'Only one key can be primary',
  chooseKey: 'Choose a key',
  invalidKey: 'Not a valid key',
  duplicateKey: (key: string) => `${key} is listed more than once`,
  chord: 'Use a chord like G, Bm7 or D/F#',
  tempo: `Tempo must be a whole number from ${MUSICAL_LIMITS.tempoMin} to ${MUSICAL_LIMITS.tempoMax}`,
  timeSignature: 'Use a time signature like 4/4 or 6/8',
  energyLevel: 'Choose an energy level from the list',
  energyNotes: `Energy notes can be up to ${MUSICAL_LIMITS.energyNotesMax} characters`,
} as const;

/**
 * Client-side check of the musical slice, mirroring `songInputSchema` (tempo, time signature,
 * energy) and `songKeysInputSchema` (1–12 keys, exactly one primary, unique keys, chord format).
 * Keys use the same dotted paths as the server's field errors: `keys`, `keys.1.key`,
 * `keys.0.firstChords.verse`. Empty object means valid. The form page calls this before submit.
 */
export function validateMusical(musical: MusicalValue): SongFormErrors {
  const errors: SongFormErrors = {};
  const add = (path: string, message: string) => {
    (errors[path] ??= []).push(message);
  };
  const { keys } = musical;

  if (keys.length < MUSICAL_LIMITS.keysMin) add('keys', MESSAGES.noKeys);
  if (keys.length > MUSICAL_LIMITS.keysMax) add('keys', MESSAGES.tooManyKeys);
  const primaries = keys.filter((k) => k.isPrimary).length;
  if (keys.length > 0 && primaries === 0) add('keys', MESSAGES.noPrimary);
  if (primaries > 1) add('keys', MESSAGES.manyPrimaries);

  const seen = new Set<string>();
  keys.forEach((k, i) => {
    if (k.key === '') add(`keys.${i}.key`, MESSAGES.chooseKey);
    else if (!MUSICAL_KEY_RE.test(k.key)) add(`keys.${i}.key`, MESSAGES.invalidKey);
    else if (seen.has(k.key)) add(`keys.${i}.key`, MESSAGES.duplicateKey(k.key));
    if (k.key) seen.add(k.key);
    for (const slot of CHORD_SLOTS) {
      const chord = k.firstChords[slot];
      if (chord !== null && !isValidChord(chord)) {
        add(`keys.${i}.firstChords.${slot}`, MESSAGES.chord);
      }
    }
  });

  if (musical.tempoBpm !== null && !tempoInRange(musical.tempoBpm)) {
    add('tempoBpm', MESSAGES.tempo);
  }
  if (musical.timeSignature !== null && !isValidTimeSignature(musical.timeSignature)) {
    add('timeSignature', MESSAGES.timeSignature);
  }
  if (musical.energyLevel !== null && !ENERGY_LEVELS.includes(musical.energyLevel)) {
    add('energyLevel', MESSAGES.energyLevel);
  }
  if (
    musical.energyNotes !== null &&
    musical.energyNotes.trim().length > MUSICAL_LIMITS.energyNotesMax
  ) {
    add('energyNotes', MESSAGES.energyNotes);
  }
  return errors;
}

/** Sets `index` as the only primary key. */
export function setPrimary(keys: readonly MusicalKeyValue[], index: number): MusicalKeyValue[] {
  return keys.map((k, i) => ({ ...k, isPrimary: i === index }));
}

/**
 * Removes the key at `index`. If it was the only primary, the first remaining key becomes primary
 * so removing a row never silently leaves the song without one.
 */
export function removeKey(keys: readonly MusicalKeyValue[], index: number): MusicalKeyValue[] {
  const removed = keys[index];
  const next = keys.filter((_, i) => i !== index);
  if (removed?.isPrimary && next.length > 0 && !next.some((k) => k.isPrimary)) {
    return setPrimary(next, 0);
  }
  return next;
}

// ---------- Small pieces ----------

function FieldErrors({ id, messages }: { id: string; messages: string[] }) {
  if (messages.length === 0) return null;
  return (
    <ul id={id} className="space-y-0.5 text-sm text-destructive">
      {messages.map((m) => (
        <li key={m}>{m}</li>
      ))}
    </ul>
  );
}

const labelClass = 'block text-sm font-medium';
const optional = <span className="font-normal text-muted-foreground">(optional)</span>;

/** Unique messages, preserving order. */
const uniq = (messages: string[]) => [...new Set(messages.filter(Boolean))];

function EnergySwatch({ level }: { level: EnergyLevel }) {
  return (
    <span
      aria-hidden
      data-swatch={level}
      className={cn(
        'inline-block size-3.5 shrink-0 rounded-full',
        ENERGY_TOKEN[level].bg,
        ENERGY_RING,
      )}
    />
  );
}

// ---------- Key row ----------

function ChordInput({
  id,
  slot,
  keyLabel,
  value,
  onChange,
  serverErrors,
  disabled,
}: {
  id: string;
  slot: ChordSlot;
  keyLabel: string;
  value: string | null;
  onChange(next: string | null): void;
  serverErrors: string[];
  disabled?: boolean;
}) {
  const [blurred, setBlurred] = useState(false);
  const localError = blurred && value !== null && !isValidChord(value) ? MESSAGES.chord : '';
  const messages = uniq([localError, ...serverErrors]);
  return (
    <div className="min-w-0 space-y-1">
      <label htmlFor={id} className="text-xs font-medium">
        {CHORD_SLOT_LABEL[slot]}
        <span className="sr-only"> first chord in {keyLabel}</span>
      </label>
      <Input
        id={id}
        className="h-tap"
        value={value ?? ''}
        maxLength={MUSICAL_LIMITS.chordMax}
        placeholder="X"
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        disabled={disabled}
        aria-invalid={messages.length > 0 || undefined}
        aria-describedby={messages.length > 0 ? `${id}-errors` : undefined}
        onBlur={() => setBlurred(true)}
        onChange={(e) => {
          setBlurred(false);
          onChange(nullIfBlank(e.target.value.replace(/\s+/g, '')));
        }}
      />
      <FieldErrors id={`${id}-errors`} messages={messages} />
    </div>
  );
}

function KeyRow({
  index,
  row,
  radioName,
  duplicate,
  onChange,
  onPrimary,
  onRemove,
  errors,
  disabled,
}: {
  index: number;
  row: MusicalKeyValue;
  radioName: string;
  duplicate: boolean;
  onChange(next: MusicalKeyValue): void;
  onPrimary(): void;
  onRemove(): void;
  errors?: SongFormErrors;
  disabled?: boolean;
}) {
  const id = useId();
  const { root, minor } = splitKey(row.key);
  // Keep a loaded key whose root isn't in MAJOR_KEYS (e.g. "A#") selectable rather than lost.
  const roots: readonly string[] =
    root && !(MAJOR_KEYS as readonly string[]).includes(root) ? [...MAJOR_KEYS, root] : MAJOR_KEYS;
  const keyLabel = row.key ? spokenKey(row.key) : `key ${index + 1}`;
  const keyErrors = uniq([
    duplicate ? MESSAGES.duplicateKey(row.key) : '',
    ...errorsFor(errors, `keys.${index}.key`),
  ]);
  // Row-level server errors that aren't about the key itself or a chord (e.g. `keys.2`).
  const rowErrors = uniq(
    Object.entries(errors ?? {})
      .filter(
        ([path]) =>
          (path === `keys.${index}` || path.startsWith(`keys.${index}.`)) &&
          !path.startsWith(`keys.${index}.key`) &&
          !path.startsWith(`keys.${index}.firstChords`),
      )
      .flatMap(([, messages]) => messages),
  );
  const chordErrors = (slot: ChordSlot) => errorsFor(errors, `keys.${index}.firstChords.${slot}`);

  return (
    <li
      className={cn(
        'space-y-3 rounded-md border bg-card p-3',
        row.isPrimary && 'border-primary/60',
      )}
      aria-label={row.key ? `Key ${keyLabel}` : `Key ${index + 1}, not chosen`}
    >
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={`${id}-key`} className="text-xs font-medium">
          Key
        </label>
        <Button
          type="button"
          variant="ghost"
          size="icon-lg"
          className="-mt-1 -mr-1"
          aria-label={`Remove ${row.key ? `key ${keyLabel}` : `key ${index + 1}`}`}
          disabled={disabled}
          onClick={onRemove}
        >
          <XIcon aria-hidden />
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Select
          value={root}
          disabled={disabled}
          onValueChange={(r) => onChange({ ...row, key: joinKey(r, minor) })}
        >
          <SelectTrigger
            id={`${id}-key`}
            className="h-tap! w-24 shrink-0"
            aria-invalid={keyErrors.length > 0 || undefined}
            aria-describedby={keyErrors.length > 0 ? `${id}-key-errors` : undefined}
          >
            <SelectValue placeholder="Choose" />
          </SelectTrigger>
          <SelectContent>
            {roots.map((r) => (
              <SelectItem key={r} value={r} className="min-h-tap">
                {r}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label className="flex min-h-tap items-center gap-2 text-sm">
          <Checkbox
            checked={minor}
            disabled={disabled || !root}
            aria-label={`Minor${row.key ? ` (${keyLabel})` : ''}`}
            onCheckedChange={(c) => onChange({ ...row, key: joinKey(root, c === true) })}
          />
          <span aria-hidden>Minor</span>
        </label>
        <label className="flex min-h-tap items-center gap-2 text-sm">
          <input
            type="radio"
            name={radioName}
            className="size-4 accent-primary"
            checked={row.isPrimary}
            disabled={disabled}
            aria-label={`Primary key${row.key ? ` (${keyLabel})` : ` (key ${index + 1})`}`}
            onChange={onPrimary}
          />
          <span aria-hidden>Primary</span>
        </label>
      </div>
      <FieldErrors id={`${id}-key-errors`} messages={keyErrors} />
      <div role="group" aria-label={`First chords in ${keyLabel}`} className="space-y-1">
        <p className="text-xs text-muted-foreground" aria-hidden>
          First chords
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {CHORD_SLOTS.map((slot) => (
            <ChordInput
              key={slot}
              id={`${id}-chord-${slot}`}
              slot={slot}
              keyLabel={keyLabel}
              value={row.firstChords[slot]}
              serverErrors={chordErrors(slot)}
              disabled={disabled}
              onChange={(chord) =>
                onChange({ ...row, firstChords: { ...row.firstChords, [slot]: chord } })
              }
            />
          ))}
        </div>
      </div>
      <FieldErrors id={`${id}-row-errors`} messages={rowErrors} />
    </li>
  );
}

// ---------- Keys repeater ----------

function KeysField({
  keys,
  onChange,
  errors,
  disabled,
}: {
  keys: MusicalKeyValue[];
  onChange(next: MusicalKeyValue[]): void;
  errors?: SongFormErrors;
  disabled?: boolean;
}) {
  const id = useId();
  const listRef = useRef<HTMLOListElement>(null);
  const [announcement, setAnnouncement] = useState('');
  const [focusRow, setFocusRow] = useState<number | null>(null);
  // Stable React keys for rows (new rows have no id yet); kept in step with add/remove below and
  // rebuilt if the parent replaces the list.
  const rowKeys = useRef<string[]>([]);
  const nextKey = useRef(0);
  const makeKey = (row: MusicalKeyValue) => row.id ?? `new-${nextKey.current++}`;
  if (rowKeys.current.length !== keys.length) rowKeys.current = keys.map(makeKey);
  const full = keys.length >= MUSICAL_LIMITS.keysMax;

  // After adding a row, move focus to its key select so keyboard users can pick straight away.
  useEffect(() => {
    if (focusRow === null || !listRef.current) return;
    listRef.current
      .querySelectorAll<HTMLElement>('li')
      [focusRow]?.querySelector<HTMLElement>('[data-slot="select-trigger"]')
      ?.focus();
    setFocusRow(null);
  }, [focusRow]);

  const primaries = keys.filter((k) => k.isPrimary).length;
  const counts = new Map<string, number>();
  for (const k of keys) if (k.key) counts.set(k.key, (counts.get(k.key) ?? 0) + 1);
  const firstIndex = (key: string) => keys.findIndex((k) => k.key === key);

  const messages = uniq([
    keys.length > 0 && primaries === 0 ? MESSAGES.noPrimary : '',
    primaries > 1 ? MESSAGES.manyPrimaries : '',
    ...(errors?.keys ?? []),
  ]);
  const headingId = `${id}-label`;
  const errorsId = `${id}-errors`;

  const add = () => {
    if (full) return;
    const row = newKeyRow(keys.length === 0);
    rowKeys.current = [...rowKeys.current, makeKey(row)];
    onChange([...keys, row]);
    setFocusRow(keys.length);
    setAnnouncement(`Added key ${keys.length + 1}`);
  };

  const remove = (index: number) => {
    const removed = keys[index];
    if (!removed) return;
    const next = removeKey(keys, index);
    rowKeys.current = rowKeys.current.filter((_, i) => i !== index);
    onChange(next);
    const promoted = removed.isPrimary && next[0]?.isPrimary;
    setAnnouncement(
      `Removed ${removed.key ? `key ${spokenKey(removed.key)}` : `key ${index + 1}`}` +
        (promoted && next[0]?.key ? `. ${spokenKey(next[0].key)} is now primary` : ''),
    );
  };

  return (
    <div
      className="space-y-2"
      role="group"
      aria-labelledby={headingId}
      aria-describedby={messages.length > 0 ? errorsId : undefined}
    >
      <p id={headingId} className={labelClass}>
        Keys{' '}
        <span className="font-normal text-muted-foreground">(one primary, plus alternates)</span>
      </p>
      {keys.length > 0 ? (
        <ol ref={listRef} className="space-y-2" aria-label="Keys">
          {keys.map((row, i) => (
            <KeyRow
              key={rowKeys.current[i]}
              index={i}
              row={row}
              radioName={`${id}-primary`}
              duplicate={!!row.key && (counts.get(row.key) ?? 0) > 1 && firstIndex(row.key) !== i}
              errors={errors}
              disabled={disabled}
              onChange={(next) => onChange(keys.map((k, j) => (j === i ? next : k)))}
              onPrimary={() => onChange(setPrimary(keys, i))}
              onRemove={() => remove(i)}
            />
          ))}
        </ol>
      ) : (
        <p className="text-sm text-muted-foreground">No keys yet. Add at least one.</p>
      )}
      <FieldErrors id={errorsId} messages={messages} />
      <Button
        type="button"
        variant="outline"
        className="h-tap w-full justify-start sm:w-auto"
        disabled={disabled || full}
        onClick={add}
      >
        <PlusIcon aria-hidden />
        {full ? MESSAGES.tooManyKeys : keys.length === 0 ? 'Add key' : 'Add alternate key'}
      </Button>
      <p className="text-xs text-muted-foreground">
        Leave a first chord blank if you don&apos;t know it; it shows as X.
      </p>
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}

// ---------- Section ----------

const NO_ENERGY = '__none__';

/** Song form section for REQ-LIB-08: keys with first chords, tempo, time signature, energy. */
export function MusicalSection({ value, onChange, errors, disabled }: MusicalSectionProps) {
  const id = useId();
  const musical = value.musical ?? emptyMusicalInfo();
  // Range/format errors wait for blur so typing "1" on the way to "120" isn't flagged.
  const [tempoBlurred, setTempoBlurred] = useState(false);
  const [timeSigBlurred, setTimeSigBlurred] = useState(false);
  const update = (patch: Partial<MusicalValue>) => onChange({ musical: { ...musical, ...patch } });

  const tempoErrors = uniq([
    tempoBlurred && musical.tempoBpm !== null && !tempoInRange(musical.tempoBpm)
      ? MESSAGES.tempo
      : '',
    ...errorsFor(errors, 'tempoBpm'),
  ]);
  const timeSigErrors = uniq([
    timeSigBlurred && musical.timeSignature !== null && !isValidTimeSignature(musical.timeSignature)
      ? MESSAGES.timeSignature
      : '',
    ...errorsFor(errors, 'timeSignature'),
  ]);
  const energyErrors = errorsFor(errors, 'energyLevel');
  const notesErrors = errorsFor(errors, 'energyNotes');
  const notesLength = musical.energyNotes?.length ?? 0;

  const describe = (field: string, messages: string[], extra?: string) =>
    [extra, messages.length > 0 ? `${id}-${field}-errors` : undefined].filter(Boolean).join(' ') ||
    undefined;

  return (
    <fieldset className="min-w-0 space-y-5" disabled={disabled}>
      <legend className="mb-3 text-lg font-semibold">Musical tags</legend>

      <KeysField
        keys={musical.keys}
        onChange={(keys) => update({ keys })}
        errors={errors}
        disabled={disabled}
      />

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <label htmlFor={`${id}-tempo`} className={labelClass}>
            Tempo (BPM) {optional}
          </label>
          <div className="flex items-center gap-3">
            <Input
              id={`${id}-tempo`}
              className="h-tap w-28"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={3}
              placeholder="e.g. 72"
              value={musical.tempoBpm ?? ''}
              aria-invalid={tempoErrors.length > 0 || undefined}
              aria-describedby={describe('tempo', tempoErrors, `${id}-tempo-hint`)}
              onBlur={() => setTempoBlurred(true)}
              onChange={(e) => {
                setTempoBlurred(false);
                update({ tempoBpm: parseTempo(e.target.value) });
              }}
            />
            <EnergyChip energy={musical.energyLevel} bpm={musical.tempoBpm} />
          </div>
          <p id={`${id}-tempo-hint`} className="text-xs text-muted-foreground">
            {MUSICAL_LIMITS.tempoMin}–{MUSICAL_LIMITS.tempoMax}. The chip previews the song row.
          </p>
          <FieldErrors id={`${id}-tempo-errors`} messages={tempoErrors} />
        </div>

        <div className="space-y-2">
          <label htmlFor={`${id}-timesig`} className={labelClass}>
            Time signature {optional}
          </label>
          <Input
            id={`${id}-timesig`}
            className="h-tap w-28"
            type="text"
            inputMode="numeric"
            maxLength={5}
            placeholder="e.g. 4/4"
            autoComplete="off"
            list={`${id}-timesig-options`}
            value={musical.timeSignature ?? ''}
            aria-invalid={timeSigErrors.length > 0 || undefined}
            aria-describedby={describe('timesig', timeSigErrors)}
            onBlur={() => setTimeSigBlurred(true)}
            onChange={(e) => {
              setTimeSigBlurred(false);
              update({ timeSignature: nullIfBlank(e.target.value.replace(/\s+/g, '')) });
            }}
          />
          <datalist id={`${id}-timesig-options`}>
            {['4/4', '3/4', '6/8', '2/4', '12/8'].map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
          <FieldErrors id={`${id}-timesig-errors`} messages={timeSigErrors} />
        </div>
      </div>

      <div className="space-y-2">
        <label htmlFor={`${id}-energy`} className={labelClass}>
          Energy level {optional}
        </label>
        <Select
          value={musical.energyLevel ?? NO_ENERGY}
          disabled={disabled}
          onValueChange={(v) =>
            update({ energyLevel: v === NO_ENERGY ? null : (v as EnergyLevel) })
          }
        >
          <SelectTrigger
            id={`${id}-energy`}
            className="h-tap! w-full sm:w-80"
            aria-invalid={energyErrors.length > 0 || undefined}
            aria-describedby={describe('energy', energyErrors)}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_ENERGY} className="min-h-tap">
              <span aria-hidden className="inline-block size-3.5 shrink-0 rounded-full border" />
              Not set
            </SelectItem>
            {ENERGY_LEVELS.map((level) => (
              <SelectItem key={level} value={level} className="min-h-tap">
                <EnergySwatch level={level} />
                {ENERGY_META[level].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <FieldErrors id={`${id}-energy-errors`} messages={energyErrors} />
      </div>

      <div className="space-y-2">
        <label htmlFor={`${id}-notes`} className={labelClass}>
          Energy notes {optional}
        </label>
        <Textarea
          id={`${id}-notes`}
          value={musical.energyNotes ?? ''}
          maxLength={MUSICAL_LIMITS.energyNotesMax}
          rows={3}
          placeholder="e.g. Starts light, slow build, big bridge build"
          aria-invalid={notesErrors.length > 0 || undefined}
          aria-describedby={describe('notes', notesErrors, `${id}-notes-count`)}
          onChange={(e) => update({ energyNotes: nullIfBlank(e.target.value) })}
        />
        <p id={`${id}-notes-count`} className="text-xs text-muted-foreground tabular-nums">
          {notesLength}/{MUSICAL_LIMITS.energyNotesMax} characters
        </p>
        <FieldErrors id={`${id}-notes-errors`} messages={notesErrors} />
      </div>
    </fieldset>
  );
}

/** Loading placeholder while the song being edited is fetched. */
export function MusicalSectionSkeleton() {
  return (
    <div className="space-y-5" role="status" aria-label="Loading musical tags">
      <Skeleton className="h-6 w-32" />
      <div className="space-y-2">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-32 w-full" />
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        {[0, 1].map((i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-10 w-28" />
          </div>
        ))}
      </div>
      {[0, 1].map((i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-10 w-full" />
        </div>
      ))}
    </div>
  );
}
