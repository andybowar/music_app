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
import { Button } from '@/components/ui/button';
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
import { firstLine, parseLyrics, type ParsedLyrics } from '@/lib/lyrics/parse';
import { SECTION_LABEL, SECTIONS, type Section, type SongDetail } from '@/types/domain';
import { errorsFor, moveItem } from './BasicInfoSection';
import type { SongFormSectionProps, SongFormValue } from './types';

export type LyricsValue = SongFormValue['lyrics'];

export interface LyricsSectionProps extends SongFormSectionProps {
  disabled?: boolean;
}

/** Limits from `songInputSchema` (lyrics ≤5000 chars per section, arrangement ≤30 entries). */
export const LYRICS_LIMITS = { sectionMax: 5000, arrangementMax: 30 } as const;

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
  if (text.trim()) return { value: { lyrics, arrangement: value.arrangement }, removed: 0 };
  const arrangement = value.arrangement.filter((s) => s !== section);
  return { value: { lyrics, arrangement }, removed: value.arrangement.length - arrangement.length };
}

/** Appends a section to the arrangement (repeats allowed) unless it is blank or the list is full. */
export function addToArrangement(value: LyricsValue, section: Section): Section[] | null {
  if (!hasText(value.lyrics, section)) return null;
  if (value.arrangement.length >= LYRICS_LIMITS.arrangementMax) return null;
  return [...value.arrangement, section];
}

/** How many verses to show: at least 2, plus any verse that is filled, arranged or has errors. */
export function versesInUse(value: LyricsValue, errorKeys: readonly string[] = []): number {
  let shown = ALWAYS_SHOWN_VERSES;
  VERSES.forEach((v, i) => {
    const used =
      hasText(value.lyrics, v) ||
      value.arrangement.includes(v) ||
      errorKeys.some((k) => k === `lyrics.${v}`);
    if (used) shown = Math.max(shown, i + 1);
  });
  return shown;
}

/** Turns a parse result into a full lyrics slice: every section set, missing ones `null`. */
export function lyricsFromParse(parsed: ParsedLyrics): LyricsValue {
  const lyrics = Object.fromEntries(SECTIONS.map((s) => [s, parsed.lyrics[s] ?? null]));
  return { lyrics, arrangement: [...parsed.arrangement] };
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
  textareaRef,
}: {
  section: Section;
  text: string;
  serverErrors: string[];
  onChange(text: string): void;
  textareaRef?: (el: HTMLTextAreaElement | null) => void;
}) {
  const id = useId();
  const label = SECTION_LABEL[section];
  const tooLong = text.length > LYRICS_LIMITS.sectionMax;
  const messages = [
    ...(tooLong
      ? [`${label} is ${text.length} characters; the limit is ${LYRICS_LIMITS.sectionMax}`]
      : []),
    ...serverErrors,
  ];
  const nearLimit = text.length >= LYRICS_LIMITS.sectionMax * 0.9;
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
          {text.length} / {LYRICS_LIMITS.sectionMax}
        </span>
      </div>
      <Textarea
        id={`${id}-text`}
        ref={textareaRef}
        className="min-h-24"
        value={text}
        maxLength={tooLong ? undefined : LYRICS_LIMITS.sectionMax}
        spellCheck
        aria-invalid={messages.length > 0 || undefined}
        aria-describedby={`${id}-count${messages.length ? ` ${id}-errors` : ''}`}
        onChange={(e) => onChange(e.target.value)}
      />
      <FieldErrors id={`${id}-errors`} messages={messages} />
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
  onApply,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  overwrites: boolean;
  onApply(parsed: ParsedLyrics): void;
}) {
  const id = useId();
  const [text, setText] = useState('');
  const [step, setStep] = useState<PasteStep>('input');
  const [parsed, setParsed] = useState<ParsedLyrics | null>(null);

  const reset = () => {
    setText('');
    setStep('input');
    setParsed(null);
  };
  const close = () => {
    onOpenChange(false);
    reset();
  };

  const split = () => {
    setParsed(parseLyrics(text));
    setStep('preview');
  };

  const apply = () => {
    if (!parsed) return;
    if (overwrites && step !== 'confirm') {
      setStep('confirm');
      return;
    }
    onApply(parsed);
    close();
  };

  const found = parsed ? SECTIONS.filter((s) => parsed.lyrics[s]?.trim()) : [];

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Paste full lyrics</DialogTitle>
          <DialogDescription>
            Paste the whole song with headings like “Verse 1”, “Chorus” and “Bridge” on their own
            lines. It will be split into sections and an order.
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
                        {firstLine(parsed.lyrics[s] ?? null)}
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

/** Song form section for REQ-LIB-06/14: 7 lyric sections, the arrangement, and paste-and-split. */
export function LyricsSection({ value, onChange, errors, disabled }: LyricsSectionProps) {
  const lyricsValue = value.lyrics ?? emptyLyrics();
  const errorKeys = Object.keys(errors ?? {});
  const [revealed, setRevealed] = useState(ALWAYS_SHOWN_VERSES);
  const [removal, setRemoval] = useState<Removal | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const [focusSection, setFocusSection] = useState<Section | null>(null);
  const fieldRefs = useRef<Partial<Record<Section, HTMLTextAreaElement | null>>>({});

  const shownVerses = Math.max(revealed, versesInUse(lyricsValue, errorKeys));
  const nextVerse = VERSES[shownVerses];

  useEffect(() => {
    if (!focusSection) return;
    fieldRefs.current[focusSection]?.focus();
    setFocusSection(null);
  }, [focusSection]);

  const emit = (next: LyricsValue) => onChange({ lyrics: next });

  const onText = (section: Section, text: string) => {
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

  const applyPaste = (parsed: ParsedLyrics) => {
    const next = lyricsFromParse(parsed);
    emit(next);
    setRemoval(null);
    setRevealed(Math.max(ALWAYS_SHOWN_VERSES, versesInUse(next)));
    const count = SECTIONS.filter((s) => hasText(next.lyrics, s)).length;
    toast.success(`Split into ${count} ${count === 1 ? 'section' : 'sections'}`);
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

      {fields.map((s) => (
        <div key={s} className="space-y-2">
          <SectionField
            section={s}
            text={lyricsValue.lyrics[s] ?? ''}
            serverErrors={errorsFor(errors, `lyrics.${s}`)}
            onChange={(text) => onText(s, text)}
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
        onApply={applyPaste}
      />
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
    </fieldset>
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
