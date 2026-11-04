'use client';

import {
  ArrowDownIcon,
  ArrowUpIcon,
  ClipboardPasteIcon,
  GripVerticalIcon,
  PlusIcon,
  TriangleAlertIcon,
  Undo2Icon,
  XIcon,
} from 'lucide-react';
import { useEffect, useId, useRef, useState, type DragEvent } from 'react';
import { toast } from 'sonner';
import { ChordLyrics } from '@/components/song/ChordLyrics';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/components/ui/utils';
import { displayKey, spokenKey } from '@/components/song/KeyBadge';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { hasChords, inlineChords, sectionsHaveChords, stripChords } from '@/lib/lyrics/chords';
import { keySpelling, type Spelling } from '@/lib/lyrics/transpose';
import { firstLine, isHeadingLine, parseLyrics, type ParsedLyrics } from '@/lib/lyrics/parse';
import { SECTION_LABEL, SECTIONS, type Section, type SongDetail } from '@/types/domain';
import { errorsFor, moveItem } from './BasicInfoSection';
import {
  anyChordsTyped,
  applyPaste,
  chordsOn,
  fillChordsFrom,
  hasChordSet,
  removeAllChords,
  removeChords,
  captureAnchors,
  setKeyChordText,
  startChords,
  type ChordAnchors,
  type KeyRow,
} from './chordKeys';
import type { SongFormSectionProps, SongFormValue } from './types';

export type LyricsValue = SongFormValue['lyrics'];

export interface LyricsSectionProps extends SongFormSectionProps {
  disabled?: boolean;
}

/** Limits from `songInputSchema` (lyrics ≤5000 chars per section, arrangement ≤30 entries). */
export const LYRICS_LIMITS = { sectionMax: 5000, arrangementMax: 30 } as const;

/** Limit on a section with its chords inline (`songKeyInputSchema` `chords`). */
export const CHORDS_LIMITS = { sectionMax: 8000 } as const;

/** Verses 1–2 always show; 3–5 stay collapsed until used. */
const ALWAYS_SHOWN_VERSES = 2;
const VERSES = ['verse_1', 'verse_2', 'verse_3', 'verse_4', 'verse_5'] as const;
/** Field order on screen. Storage order (`SECTIONS`) puts chorus first; people write verse 1 first. */
const FIELD_ORDER: readonly Section[] = [...VERSES, 'chorus', 'bridge'];

// ---------- Pure helpers (exported for tests) ----------

/** A blank lyrics slice (new song). */
export function emptyLyrics(): LyricsValue {
  return { lyrics: {}, arrangement: [] };
}

/** The lyrics slice of an existing song (edit form). Copies so edits don't alias. */
export function lyricsFromSong(song: Pick<SongDetail, 'lyrics' | 'arrangement'>): LyricsValue {
  return { lyrics: { ...song.lyrics }, arrangement: [...song.arrangement] };
}

/** Whether a section has lyrics (the same `trim()` rule `songInputSchema` uses). */
export function hasText(lyrics: LyricsValue['lyrics'], section: Section): boolean {
  return !!lyrics[section]?.trim();
}

/** True when anything has been entered, so a paste would overwrite something. */
export function hasAnyLyrics(value: LyricsValue): boolean {
  return value.arrangement.length > 0 || SECTIONS.some((s) => hasText(value.lyrics, s));
}

/**
 * Sets one section's text. When it becomes blank, every arrangement entry for it is removed
 * (an arrangement entry must have lyrics); `removed` says how many.
 */
export function setSectionText(
  value: LyricsValue,
  section: Section,
  text: string,
): { value: LyricsValue; removed: number } {
  const lyrics = { ...value.lyrics, [section]: text === '' ? null : text };
  if (text.trim()) return { value: { ...value, lyrics }, removed: 0 };
  const arrangement = value.arrangement.filter((s) => s !== section);
  return {
    value: { ...value, lyrics, arrangement },
    removed: value.arrangement.length - arrangement.length,
  };
}

/** Appends a section to the arrangement (repeats allowed) unless it is blank or the list is full. */
export function addToArrangement(value: LyricsValue, section: Section): Section[] | null {
  if (!hasText(value.lyrics, section)) return null;
  if (value.arrangement.length >= LYRICS_LIMITS.arrangementMax) return null;
  return [...value.arrangement, section];
}

/**
 * How many verses to show: at least 2, plus any verse that is filled, arranged, has chords in
 * some key, or has errors.
 */
export function versesInUse(
  value: LyricsValue,
  errorKeys: readonly string[] = [],
  keys: readonly KeyRow[] = [],
): number {
  let shown = ALWAYS_SHOWN_VERSES;
  VERSES.forEach((v, i) => {
    const used =
      hasText(value.lyrics, v) ||
      keys.some((k) => !!k.chords?.[v]?.trim()) ||
      value.arrangement.includes(v) ||
      errorKeys.some((k) => k === `lyrics.${v}` || new RegExp(`^chords\\.\\d+\\.${v}$`).test(k));
    if (used) shown = Math.max(shown, i + 1);
  });
  return shown;
}

/** Turns a parse result into a full lyrics slice: every section set, missing ones `null`. */
export function lyricsFromParse(parsed: ParsedLyrics): LyricsValue {
  const lyrics = Object.fromEntries(
    SECTIONS.map((s) => {
      const text = parsed.lyrics[s];
      return [s, text == null ? null : stripChords(text) || null];
    }),
  );
  return { lyrics, arrangement: parsed.arrangement.filter((s) => !!lyrics[s]?.trim()) };
}

/** Parses pasted lyrics, first moving chords written above the words inline. */
export function parsePastedLyrics(text: string): ParsedLyrics {
  return parseLyrics(inlineChords(text, isHeadingLine));
}

/** Whether a parse result has any chords in it. */
export function parsedHasChords(parsed: ParsedLyrics): boolean {
  return SECTIONS.some((s) => hasChords(parsed.lyrics[s]));
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

const labelClass = 'text-sm font-medium';

function SectionField({
  section,
  text,
  serverErrors,
  onChange,
  onBlur,
  textareaRef,
  chords = false,
}: {
  section: Section;
  text: string;
  serverErrors: string[];
  onChange(text: string): void;
  onBlur?(): void;
  textareaRef?: (el: HTMLTextAreaElement | null) => void;
  /** The text has chords inline: higher limit, and a preview of the chords over the words. */
  chords?: boolean;
}) {
  const id = useId();
  const label = SECTION_LABEL[section];
  const max = chords ? CHORDS_LIMITS.sectionMax : LYRICS_LIMITS.sectionMax;
  const plainLength = chords ? stripChords(text).length : text.length;
  const tooLong = text.length > max;
  const plainTooLong = chords && !tooLong && plainLength > LYRICS_LIMITS.sectionMax;
  const messages = [
    ...(tooLong ? [`${label} is ${text.length} characters; the limit is ${max}`] : []),
    ...(plainTooLong
      ? [
          `${label} without chords is ${plainLength} characters; the limit is ${LYRICS_LIMITS.sectionMax}`,
        ]
      : []),
    ...serverErrors,
  ];
  const nearLimit = text.length >= max * 0.9;
  const preview = chords && hasChords(text);
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={`${id}-text`} className={labelClass}>
          {label}
        </label>
        <span
          id={`${id}-count`}
          className={cn(
            'text-xs tabular-nums',
            nearLimit ? 'text-destructive' : 'text-muted-foreground',
          )}
        >
          {text.length} / {max}
        </span>
      </div>
      <Textarea
        id={`${id}-text`}
        ref={textareaRef}
        className="min-h-24"
        value={text}
        maxLength={tooLong ? undefined : max}
        spellCheck
        aria-invalid={messages.length > 0 || undefined}
        aria-describedby={`${id}-count${messages.length ? ` ${id}-errors` : ''}`}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
      />
      <FieldErrors id={`${id}-errors`} messages={messages} />
      {preview && (
        <div className="space-y-1 rounded-md bg-muted/50 px-3 py-2">
          <p className="text-xs text-muted-foreground">Preview</p>
          <ChordLyrics text={text} />
        </div>
      )}
    </div>
  );
}

// ---------- Arrangement builder ----------

interface Removal {
  section: Section;
  count: number;
  previous: Section[];
}

function ArrangementField({
  value,
  onChange,
  errors,
  removal,
  onRestore,
  onDismissRemoval,
  disabled,
}: {
  value: LyricsValue;
  onChange(arrangement: Section[], announcement: string): void;
  errors: LyricsSectionProps['errors'];
  removal: Removal | null;
  onRestore(): void;
  onDismissRemoval(): void;
  disabled?: boolean;
}) {
  const id = useId();
  const listRef = useRef<HTMLOListElement>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const [focusAfterMove, setFocusAfterMove] = useState<{
    index: number;
    dir: 'up' | 'down';
  } | null>(null);
  const { arrangement, lyrics } = value;
  const full = arrangement.length >= LYRICS_LIMITS.arrangementMax;
  const available = SECTIONS.filter((s) => hasText(lyrics, s));

  // Keep keyboard focus on the moved row; fall back to the other arrow when one becomes disabled.
  useEffect(() => {
    if (!focusAfterMove || !listRef.current) return;
    const row = listRef.current.querySelector<HTMLElement>(
      `[data-index="${focusAfterMove.index}"]`,
    );
    const preferred = row?.querySelector<HTMLButtonElement>(`[data-move="${focusAfterMove.dir}"]`);
    const other = row?.querySelector<HTMLButtonElement>(
      `[data-move="${focusAfterMove.dir === 'up' ? 'down' : 'up'}"]`,
    );
    (preferred && !preferred.disabled ? preferred : other)?.focus();
    setFocusAfterMove(null);
  }, [focusAfterMove]);

  const move = (from: number, to: number, dir?: 'up' | 'down') => {
    const moved = arrangement[from];
    if (!moved || from === to || to < 0 || to >= arrangement.length) return;
    onChange(
      moveItem(arrangement, from, to),
      `Moved ${SECTION_LABEL[moved]} to position ${to + 1} of ${arrangement.length}`,
    );
    if (dir) setFocusAfterMove({ index: to, dir });
  };

  const endDrag = () => {
    setDragFrom(null);
    setDragOver(null);
  };

  const onDrop = (e: DragEvent, index: number) => {
    e.preventDefault();
    if (dragFrom !== null) move(dragFrom, index);
    endDrag();
  };

  const listErrors = [...new Set(errorsFor(errors, 'arrangement'))];
  const rowError = (i: number) => (errors?.[`arrangement.${i}`]?.length ?? 0) > 0;
  const headingId = `${id}-label`;

  return (
    <div className="space-y-2" role="group" aria-labelledby={headingId}>
      <div className="flex items-baseline justify-between gap-2">
        <p id={headingId} className={labelClass}>
          Order as sung <span className="font-normal text-muted-foreground">(repeats allowed)</span>
        </p>
        <span className="text-xs text-muted-foreground tabular-nums">
          {arrangement.length} / {LYRICS_LIMITS.arrangementMax}
        </span>
      </div>

      {removal && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-sm"
        >
          <TriangleAlertIcon aria-hidden className="size-4 shrink-0 text-amber-600" />
          <span className="min-w-0 flex-1">
            {SECTION_LABEL[removal.section]} is empty, so it was taken out of the order
            {removal.count > 1 ? ` (${removal.count} times)` : ''}.
          </span>
          {hasText(lyrics, removal.section) && (
            <Button type="button" size="sm" variant="outline" onClick={onRestore}>
              <Undo2Icon aria-hidden />
              Put it back
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon-lg"
            aria-label="Dismiss warning"
            onClick={onDismissRemoval}
          >
            <XIcon aria-hidden />
          </Button>
        </div>
      )}

      {arrangement.length > 0 ? (
        <ol ref={listRef} className="space-y-1" aria-label="Order as sung">
          {arrangement.map((s, i) => {
            const label = SECTION_LABEL[s];
            const missing = !hasText(lyrics, s);
            return (
              <li
                // Repeats make sections non-unique; position is the identity here.
                key={`${i}-${s}`}
                data-index={i}
                draggable={!disabled}
                onDragStart={(e) => {
                  setDragFrom(i);
                  e.dataTransfer.effectAllowed = 'move';
                  // Firefox only starts a drag when some data is set.
                  e.dataTransfer.setData('text/plain', s);
                }}
                onDragOver={(e) => {
                  if (dragFrom === null) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  if (dragOver !== i) setDragOver(i);
                }}
                onDrop={(e) => onDrop(e, i)}
                onDragEnd={endDrag}
                className={cn(
                  'flex items-center gap-1 rounded-md border bg-card pl-1 text-sm',
                  (missing || rowError(i)) && 'border-destructive',
                  dragFrom === i && 'opacity-50',
                  dragOver === i && dragFrom !== i && 'border-ring ring-2 ring-ring/50',
                )}
              >
                <GripVerticalIcon
                  aria-hidden
                  className={cn(
                    'size-4 shrink-0 text-muted-foreground',
                    !disabled && 'cursor-grab active:cursor-grabbing',
                  )}
                />
                <span className="w-6 shrink-0 text-right text-muted-foreground tabular-nums">
                  {i + 1}.
                </span>
                <span className="min-w-0 flex-1 py-2">
                  <span className="font-medium">{label}</span>
                  {missing ? (
                    <span className="block text-xs text-destructive">No lyrics</span>
                  ) : (
                    <span className="block truncate text-xs text-muted-foreground">
                      {firstLine(lyrics[s] ?? null)}
                    </span>
                  )}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-lg"
                  data-move="up"
                  aria-label={`Move ${label} (position ${i + 1}) up`}
                  disabled={disabled || i === 0}
                  onClick={() => move(i, i - 1, 'up')}
                >
                  <ArrowUpIcon aria-hidden />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-lg"
                  data-move="down"
                  aria-label={`Move ${label} (position ${i + 1}) down`}
                  disabled={disabled || i === arrangement.length - 1}
                  onClick={() => move(i, i + 1, 'down')}
                >
                  <ArrowDownIcon aria-hidden />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-lg"
                  aria-label={`Remove ${label} (position ${i + 1})`}
                  disabled={disabled}
                  onClick={() =>
                    onChange(
                      arrangement.filter((_, j) => j !== i),
                      `Removed ${label} from position ${i + 1}`,
                    )
                  }
                >
                  <XIcon aria-hidden />
                </Button>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="text-sm text-muted-foreground">No sections in the order yet.</p>
      )}

      {available.length > 0 ? (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">
            {full
              ? `The order is full (${LYRICS_LIMITS.arrangementMax} sections).`
              : 'Add a section to the end of the order:'}
          </p>
          <ul className="flex flex-wrap gap-2" aria-label="Sections to add">
            {available.map((s) => (
              <li key={s}>
                <Button
                  type="button"
                  variant="secondary"
                  className="h-tap rounded-chip"
                  aria-label={`Add ${SECTION_LABEL[s]} to the order`}
                  disabled={disabled || full}
                  onClick={() => {
                    const next = addToArrangement(value, s);
                    if (next)
                      onChange(next, `Added ${SECTION_LABEL[s]} at position ${next.length}`);
                  }}
                >
                  <PlusIcon aria-hidden />
                  {SECTION_LABEL[s]}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Type lyrics in a section to add it to the order.
        </p>
      )}
      {arrangement.length > 1 && (
        <p className="text-xs text-muted-foreground">
          Drag rows or use the arrows to change the order.
        </p>
      )}
      <FieldErrors id={`${id}-errors`} messages={listErrors} />
    </div>
  );
}

// ---------- Paste dialog ----------

type PasteStep = 'input' | 'preview' | 'confirm';

function PasteLyricsDialog({
  open,
  onOpenChange,
  overwrites,
  chordsOn,
  intoKey,
  onApply,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  overwrites: boolean;
  /** Chords are on for this song, so chords in the paste are always kept. */
  chordsOn: boolean;
  /** The key the paste's chords go into (chords on). */
  intoKey: string | null;
  onApply(parsed: ParsedLyrics, keepChords: boolean): void;
}) {
  const id = useId();
  const [text, setText] = useState('');
  const [step, setStep] = useState<PasteStep>('input');
  const [parsed, setParsed] = useState<ParsedLyrics | null>(null);
  const [keepChords, setKeepChords] = useState(true);

  const reset = () => {
    setText('');
    setStep('input');
    setParsed(null);
    setKeepChords(true);
  };
  const close = () => {
    onOpenChange(false);
    reset();
  };

  const split = () => {
    setParsed(parsePastedLyrics(text));
    setStep('preview');
  };

  const apply = () => {
    if (!parsed) return;
    if (overwrites && step !== 'confirm') {
      setStep('confirm');
      return;
    }
    onApply(parsed, chordsOn || keepChords);
    close();
  };

  const found = parsed ? SECTIONS.filter((s) => parsed.lyrics[s]?.trim()) : [];
  const pastedChords = !!parsed && parsedHasChords(parsed);

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Paste full lyrics</DialogTitle>
          <DialogDescription>
            Paste the whole song with headings like “Verse 1”, “Chorus” and “Bridge” on their own
            lines. It will be split into sections and an order. Chords can be in square brackets or
            on their own line above the words.
          </DialogDescription>
        </DialogHeader>

        {step === 'input' && (
          <div className="space-y-2">
            <label htmlFor={`${id}-paste`} className={labelClass}>
              Lyrics with headings
            </label>
            <Textarea
              id={`${id}-paste`}
              className="max-h-[50dvh] min-h-48"
              value={text}
              placeholder={'Verse 1\nFirst line…\n\nChorus\nFirst line…'}
              onChange={(e) => setText(e.target.value)}
            />
          </div>
        )}

        {step !== 'input' && parsed && (
          <div className="space-y-3 text-sm">
            {found.length > 0 ? (
              <div className="space-y-1">
                <p className="font-medium">Sections found</p>
                <ul aria-label="Sections found" className="space-y-1">
                  {found.map((s) => (
                    <li key={s} className="flex min-w-0 gap-2">
                      <span className="shrink-0 font-medium">{SECTION_LABEL[s]}:</span>
                      <span className="truncate text-muted-foreground">
                        {firstLine(stripChords(parsed.lyrics[s] ?? ''))}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p>No lyrics found.</p>
            )}
            {parsed.arrangement.length > 0 && (
              <p>
                <span className="font-medium">Order: </span>
                {parsed.arrangement.map((s) => SECTION_LABEL[s]).join(', ')}
              </p>
            )}
            {pastedChords && !chordsOn && (
              <div className="flex items-center gap-2">
                <Checkbox
                  id={`${id}-keep-chords`}
                  checked={keepChords}
                  onCheckedChange={(c) => setKeepChords(c === true)}
                />
                <label htmlFor={`${id}-keep-chords`}>Keep the chords (shown over the lyrics)</label>
              </div>
            )}
            {pastedChords && chordsOn && (
              <p>Chords found; they’ll go into {intoKey ? displayKey(intoKey) : 'this key'}.</p>
            )}
            {parsed.warnings.length > 0 && (
              <div
                role="status"
                className="space-y-1 rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2"
              >
                <p className="font-medium">Check these</p>
                <ul aria-label="Warnings" className="list-disc space-y-1 pl-5">
                  {parsed.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </div>
            )}
            {step === 'confirm' && (
              <p role="alert" className="font-medium text-destructive">
                This replaces the lyrics and order you’ve already entered. Replace them?
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" className="h-tap" onClick={close}>
            Cancel
          </Button>
          {step === 'input' ? (
            <Button type="button" className="h-tap" disabled={!text.trim()} onClick={split}>
              Split into sections
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                className="h-tap"
                onClick={() => setStep('input')}
              >
                Back
              </Button>
              <Button
                type="button"
                className="h-tap"
                variant={step === 'confirm' ? 'destructive' : 'default'}
                disabled={found.length === 0}
                onClick={apply}
              >
                {step === 'confirm' ? 'Replace lyrics' : 'Use these lyrics'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Section ----------

/**
 * Song form section for REQ-LIB-06/14: 7 lyric sections, the arrangement, and paste-and-split.
 * Optional chords over the lyrics, one set per song key (LIB-22/23): with chords on, the fields
 * edit the chosen key's chorded text; the words are shared, so every other key's chords follow
 * an edit. Chords are stored on `musical.keys[i].chords`, so this section also patches
 * `musical`.
 */
export function LyricsSection({ value, onChange, errors, disabled }: LyricsSectionProps) {
  const lyricsValue = value.lyrics ?? emptyLyrics();
  const keys: KeyRow[] = value.musical?.keys ?? [];
  const errorKeys = Object.keys(errors ?? {});
  const [revealed, setRevealed] = useState(ALWAYS_SHOWN_VERSES);
  const [removal, setRemoval] = useState<Removal | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const [focusSection, setFocusSection] = useState<Section | null>(null);
  /** What needs confirming before chords are removed: all keys, or one key's. */
  const [confirmRemove, setConfirmRemove] = useState<'all' | number | null>(null);
  const [pasteNote, setPasteNote] = useState<string | null>(null);
  const [chordKeyName, setChordKeyName] = useState<string | null>(null);
  const fieldRefs = useRef<Partial<Record<Section, HTMLTextAreaElement | null>>>({});
  /** The other keys' chords for the field being edited, as they were when editing started. */
  const anchors = useRef<{ id: string; texts: ChordAnchors } | null>(null);
  const chordsId = useId();

  const on = chordsOn(keys);
  const primaryIndex = Math.max(
    0,
    keys.findIndex((k) => k.isPrimary),
  );
  // The key being edited: the one picked, else the first with chords (primary first), else primary.
  const firstWithChords = [primaryIndex, ...keys.map((_, i) => i)].find((i) =>
    keys[i] ? hasChordSet(keys[i]!) : false,
  );
  const pickedIndex = chordKeyName === null ? -1 : keys.findIndex((k) => k.key === chordKeyName);
  const keyIndex = pickedIndex >= 0 ? pickedIndex : (firstWithChords ?? primaryIndex);
  const editKey = keys[keyIndex];
  const editing = on && editKey !== undefined && hasChordSet(editKey);

  const shownVerses = Math.max(revealed, versesInUse(lyricsValue, errorKeys, keys));
  const nextVerse = VERSES[shownVerses];

  useEffect(() => {
    if (!focusSection) return;
    fieldRefs.current[focusSection]?.focus();
    setFocusSection(null);
  }, [focusSection]);

  const emit = (next: LyricsValue) => onChange({ lyrics: next });
  const emitBoth = (next: LyricsValue, nextKeys: KeyRow[]) =>
    onChange({
      lyrics: next,
      ...(value.musical ? { musical: { ...value.musical, keys: nextKeys } } : {}),
    });
  const emitKeys = (nextKeys: KeyRow[]) => {
    if (value.musical) onChange({ musical: { ...value.musical, keys: nextKeys } });
  };

  const onText = (section: Section, text: string) => {
    if (editing) {
      const id = `${keyIndex}:${section}`;
      if (anchors.current?.id !== id) {
        anchors.current = { id, texts: captureAnchors(keys, keyIndex, section) };
      }
      const next = setKeyChordText(
        { lyrics: lyricsValue, keys },
        keyIndex,
        section,
        text,
        anchors.current.texts,
      );
      emitBoth(next.lyrics, next.keys);
      if (next.removed > 0)
        setRemoval({ section, count: next.removed, previous: lyricsValue.arrangement });
      return;
    }
    const { value: next, removed } = setSectionText(lyricsValue, section, text);
    emit(next);
    if (removed > 0) setRemoval({ section, count: removed, previous: lyricsValue.arrangement });
  };

  const restore = () => {
    if (!removal) return;
    emit({
      ...lyricsValue,
      arrangement: removal.previous.filter((s) => hasText(lyricsValue.lyrics, s)),
    });
    setAnnouncement(`Put ${SECTION_LABEL[removal.section]} back in the order`);
    setRemoval(null);
  };

  const onPaste = (parsed: ParsedLyrics, keepChords: boolean) => {
    const result = applyPaste(
      { lyrics: lyricsValue, keys },
      parsed,
      editing ? keyIndex : null,
      keepChords,
    );
    emitBoth(result.lyrics, result.keys);
    setRemoval(null);
    setRevealed(Math.max(ALWAYS_SHOWN_VERSES, versesInUse(result.lyrics, [], result.keys)));
    const others = result.moved.filter((k) => k !== editKey?.key);
    setPasteNote(
      others.length > 0
        ? `Chords in ${others.map(displayKey).join(', ')} were moved to follow the new words` +
            (result.dropped > 0
              ? `; ${result.dropped} ${result.dropped === 1 ? 'chord was' : 'chords were'} on lines that are gone`
              : '') +
            '. Check them.'
        : null,
    );
    const count = SECTIONS.filter((s) => hasText(result.lyrics.lyrics, s)).length;
    toast.success(`Split into ${count} ${count === 1 ? 'section' : 'sections'}`);
  };

  const turnOn = () => {
    emitKeys(startChords({ lyrics: lyricsValue, keys }, primaryIndex));
    setChordKeyName(keys[primaryIndex]?.key ?? null);
    setAnnouncement('Chords on. Type chords in square brackets in the lyrics.');
  };
  const removeAll = () => {
    emitKeys(removeAllChords(keys));
    setChordKeyName(null);
    setPasteNote(null);
    setAnnouncement('Chords removed');
  };
  const removeOne = (index: number) => {
    emitKeys(removeChords(keys, index));
    setAnnouncement(`Chords in ${displayKey(keys[index]!.key)} removed`);
  };

  const fields = FIELD_ORDER.filter((s) => {
    const verse = VERSES.indexOf(s as (typeof VERSES)[number]);
    return verse === -1 || verse < shownVerses;
  });

  return (
    <fieldset className="min-w-0 space-y-5" disabled={disabled}>
      <legend className="mb-3 text-lg font-semibold">Lyrics</legend>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          className="h-tap"
          onClick={() => setPasteOpen(true)}
        >
          <ClipboardPasteIcon aria-hidden />
          Paste full lyrics
        </Button>
        <p className="text-xs text-muted-foreground">Splits a whole song into the fields below.</p>
      </div>

      <div className="space-y-3 rounded-md border p-3">
        <div className="flex min-h-tap items-center gap-2">
          <Checkbox
            id={`${chordsId}-on`}
            checked={on}
            disabled={keys.length === 0}
            onCheckedChange={(c) => {
              if (c === true) turnOn();
              else if (anyChordsTyped(keys)) setConfirmRemove('all');
              else removeAll();
            }}
          />
          <label htmlFor={`${chordsId}-on`} className={labelClass}>
            Add chords over the lyrics{' '}
            <span className="font-normal text-muted-foreground">(optional)</span>
          </label>
        </div>
        {keys.length === 0 && (
          <p className="text-xs text-muted-foreground">
            Add a key under Keys &amp; tempo first; chords are written for a key.
          </p>
        )}
        {on && (
          <>
            <p className="text-xs text-muted-foreground">
              Type each chord in square brackets just before the syllable it’s played on, e.g.{' '}
              <code className="rounded bg-muted px-1 text-foreground">[G]Amazing [C]grace</code>.
              Each key has its own chords; the words are shared, so changing them in one key changes
              them in all. Search and the song’s first lines use the lyrics without chords.
            </p>
            <KeyChordsPicker
              keys={keys}
              index={keyIndex}
              onPick={(i) => setChordKeyName(keys[i]!.key)}
            />
            {editing ? (
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm">
                  Editing the chords in <strong>{displayKey(editKey.key)}</strong>.
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-tap"
                  onClick={() =>
                    sectionsHaveChords(editKey.chords)
                      ? setConfirmRemove(keyIndex)
                      : removeOne(keyIndex)
                  }
                >
                  Remove chords in {displayKey(editKey.key)}
                </Button>
              </div>
            ) : editKey ? (
              <NoChordsYet
                target={editKey}
                sources={keys.flatMap((k, i) =>
                  sectionsHaveChords(k.chords) ? [{ key: k.key, index: i }] : [],
                )}
                onStart={() => emitKeys(startChords({ lyrics: lyricsValue, keys }, keyIndex))}
                onFill={(from, spelling) => {
                  emitKeys(fillChordsFrom({ lyrics: lyricsValue, keys }, keyIndex, from, spelling));
                  setAnnouncement(
                    `Filled ${displayKey(editKey.key)} from ${displayKey(keys[from]!.key)}. Check the chords.`,
                  );
                }}
              />
            ) : null}
            <FieldErrors id={`${chordsId}-errors`} messages={[...new Set(errors?.chords ?? [])]} />
            {pasteNote && (
              <p
                role="status"
                className="rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-sm"
              >
                {pasteNote}
              </p>
            )}
          </>
        )}
      </div>

      {fields.map((s) => (
        <div key={s} className="space-y-2">
          <SectionField
            section={s}
            chords={editing}
            text={(editing ? editKey.chords[s] : lyricsValue.lyrics[s]) ?? ''}
            serverErrors={[
              ...errorsFor(errors, `lyrics.${s}`),
              ...(editing ? errorsFor(errors, `chords.${keyIndex}.${s}`) : []),
            ]}
            onChange={(text) => onText(s, text)}
            onBlur={() => (anchors.current = null)}
            textareaRef={(el) => {
              fieldRefs.current[s] = el;
            }}
          />
          {s === VERSES[shownVerses - 1] && nextVerse && (
            <Button
              type="button"
              variant="ghost"
              className="h-tap"
              onClick={() => {
                setRevealed(shownVerses + 1);
                setFocusSection(nextVerse);
              }}
            >
              <PlusIcon aria-hidden />
              Add {SECTION_LABEL[nextVerse].toLowerCase()}
            </Button>
          )}
        </div>
      ))}

      <ArrangementField
        value={lyricsValue}
        onChange={(arrangement, message) => {
          emit({ ...lyricsValue, arrangement });
          setAnnouncement(message);
        }}
        errors={errors}
        removal={removal}
        onRestore={restore}
        onDismissRemoval={() => setRemoval(null)}
        disabled={disabled}
      />

      <PasteLyricsDialog
        open={pasteOpen}
        onOpenChange={setPasteOpen}
        overwrites={hasAnyLyrics(lyricsValue)}
        chordsOn={editing}
        intoKey={editing ? editKey.key : null}
        onApply={onPaste}
      />
      <Dialog open={confirmRemove !== null} onOpenChange={(o) => !o && setConfirmRemove(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirmRemove === 'all' || confirmRemove === null
                ? 'Remove all the chords?'
                : `Remove the chords in ${displayKey(keys[confirmRemove]?.key ?? '')}?`}
            </DialogTitle>
            <DialogDescription>
              The lyrics stay as they are. Only the chords are taken out
              {confirmRemove === 'all' ? ', in every key' : ''}.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="h-tap"
              onClick={() => setConfirmRemove(null)}
            >
              Keep chords
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="h-tap"
              onClick={() => {
                if (confirmRemove === 'all') removeAll();
                else if (confirmRemove !== null) removeOne(confirmRemove);
                setConfirmRemove(null);
              }}
            >
              Remove chords
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
    </fieldset>
  );
}

/** One button per song key; keys with chords are marked. */
function KeyChordsPicker({
  keys,
  index,
  onPick,
}: {
  keys: KeyRow[];
  index: number;
  onPick(index: number): void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span aria-hidden className="text-sm">
        Chords for
      </span>
      <ToggleGroup
        type="single"
        variant="outline"
        value={String(index)}
        onValueChange={(v) => {
          if (v !== '') onPick(Number(v));
        }}
        aria-label="Chords for"
        className="flex-wrap"
      >
        {keys.map((k, i) => {
          const has = sectionsHaveChords(k.chords);
          return (
            <ToggleGroupItem
              key={`${k.key}-${i}`}
              value={String(i)}
              aria-label={`${spokenKey(k.key)}${has ? ', has chords' : ''}`}
              className="h-auto min-h-tap min-w-tap flex-col gap-0 py-1 leading-tight"
            >
              <span className="font-semibold">{displayKey(k.key) || '?'}</span>
              <span aria-hidden className="text-[10px] font-normal opacity-70">
                {has ? 'chords' : k.isPrimary ? 'usual' : ' '}
              </span>
            </ToggleGroupItem>
          );
        })}
      </ToggleGroup>
    </div>
  );
}

/** A key without chords yet: start from the words, or transpose another key's chords. */
function NoChordsYet({
  target,
  sources,
  onStart,
  onFill,
}: {
  target: KeyRow;
  sources: Array<{ key: string; index: number }>;
  onStart(): void;
  onFill(fromIndex: number, spelling: Spelling): void;
}) {
  const id = useId();
  const [spelling, setSpelling] = useState<Spelling>(() => keySpelling(target.key));
  useEffect(() => setSpelling(keySpelling(target.key)), [target.key]);
  return (
    <div className="space-y-2 rounded-md bg-muted/50 p-3">
      <p className="text-sm">No chords in {displayKey(target.key)} yet.</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" className="h-tap" onClick={onStart}>
          Start from the lyrics
        </Button>
        {sources.map((s) => (
          <Button
            key={s.key}
            type="button"
            variant="outline"
            className="h-tap"
            onClick={() => onFill(s.index, spelling)}
          >
            Fill from {displayKey(s.key)}
          </Button>
        ))}
      </div>
      {sources.length > 0 && (
        <div
          role="radiogroup"
          aria-labelledby={`${id}-spelling`}
          className="flex flex-wrap items-center gap-2 text-sm"
        >
          <span id={`${id}-spelling`}>Transposed chords use</span>
          {(['sharp', 'flat'] as const).map((sp) => (
            <label key={sp} className="flex min-h-tap items-center gap-1">
              <input
                type="radio"
                name={`${id}-spelling`}
                checked={spelling === sp}
                onChange={() => setSpelling(sp)}
              />
              {sp === 'sharp' ? 'sharps (♯)' : 'flats (♭)'}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

/** Loading placeholder while the song being edited is fetched. */
export function LyricsSectionSkeleton() {
  return (
    <div className="space-y-5" role="status" aria-label="Loading lyrics">
      <Skeleton className="h-6 w-20" />
      <Skeleton className="h-10 w-40" />
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-24 w-full" />
        </div>
      ))}
    </div>
  );
}
