'use client';

import { ArrowDownIcon, ArrowUpIcon, GripVerticalIcon, PlusIcon, XIcon } from 'lucide-react';
import { useEffect, useId, useRef, useState, type DragEvent, type KeyboardEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { POP_TOKEN } from '@/components/ui/tokens';
import { cn } from '@/components/ui/utils';
import type { ActionResult, Composer, PopMember } from '@/types/domain';
import {
  BASIC_LIMITS,
  emptyBasicInfo,
  type BasicInfoValue,
  type SongFormErrors,
  type SongFormSectionProps,
} from './types';

export interface BasicInfoSectionProps extends SongFormSectionProps {
  /** Prefix search (api.md `searchComposers`). Called only for a non-empty, trimmed query. */
  searchComposers(prefix: string): Promise<Composer[]>;
  /** api.md `createComposer`. */
  createComposer(name: string): Promise<ActionResult<Composer>>;
  disabled?: boolean;
}

export const COMPOSER_SEARCH_DEBOUNCE_MS = 200;

// ---------- Pure helpers (exported for tests and sibling sections) ----------

/** Returns a copy of `items` with the element at `from` moved to index `to`. */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  const next = [...items];
  if (from < 0 || from >= next.length || to < 0 || to >= next.length || from === to) return next;
  const [moved] = next.splice(from, 1) as [T];
  next.splice(to, 0, moved);
  return next;
}

export type AddAltTitleResult =
  { ok: true; altTitles: string[] } | { ok: false; reason: 'empty' | 'duplicate' | 'full' };

/** Adds a trimmed alternate title unless it is empty, a duplicate (case-insensitive) or over the limit. */
export function addAltTitle(altTitles: readonly string[], raw: string): AddAltTitleResult {
  const title = raw.trim().replace(/\s+/g, ' ').slice(0, BASIC_LIMITS.altTitleMax);
  if (!title) return { ok: false, reason: 'empty' };
  const lower = title.toLowerCase();
  if (altTitles.some((t) => t.toLowerCase() === lower)) return { ok: false, reason: 'duplicate' };
  if (altTitles.length >= BASIC_LIMITS.altTitlesMax) return { ok: false, reason: 'full' };
  return { ok: true, altTitles: [...altTitles, title] };
}

/** Messages for `field` and any nested path under it (`altTitles` also matches `altTitles.2`). */
export function errorsFor(errors: SongFormErrors | undefined, ...fields: string[]): string[] {
  if (!errors) return [];
  return Object.entries(errors)
    .filter(([key]) => fields.some((f) => key === f || key.startsWith(`${f}.`)))
    .flatMap(([, messages]) => messages);
}

/** Parses the year input; anything that isn't a whole number is `null`. */
export function parseYear(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^\d{1,4}$/.test(trimmed)) return null;
  return Number.parseInt(trimmed, 10);
}

// ---------- Small pieces ----------

const POP_CLASS: Record<Exclude<PopMember, 'none'>, string> = {
  current: 'text-pop-current-on-light dark:text-pop-current',
  past: 'text-pop-past-on-light dark:text-pop-past',
};

function ComposerLabel({ composer }: { composer: Composer }) {
  if (composer.popMember === 'none') return <span>{composer.name}</span>;
  const pop = POP_TOKEN[composer.popMember];
  return (
    <span>
      <span className={cn('font-medium', POP_CLASS[composer.popMember])} title={pop.title}>
        {composer.name}
      </span>{' '}
      <span className="text-xs text-muted-foreground">(POP {composer.popMember})</span>
    </span>
  );
}

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

// ---------- Alternate titles ----------

const ALT_TITLE_REASON: Record<Extract<AddAltTitleResult, { ok: false }>['reason'], string> = {
  empty: '',
  duplicate: 'That alternate title is already listed',
  full: `Up to ${BASIC_LIMITS.altTitlesMax} alternate titles`,
};

function AltTitlesField({
  altTitles,
  onChange,
  serverErrors,
  disabled,
}: {
  altTitles: string[];
  onChange(next: string[]): void;
  serverErrors: string[];
  disabled?: boolean;
}) {
  const id = useId();
  const [draft, setDraft] = useState('');
  const [localError, setLocalError] = useState('');
  const full = altTitles.length >= BASIC_LIMITS.altTitlesMax;
  const messages = [localError, ...serverErrors].filter(Boolean);

  const commit = () => {
    const result = addAltTitle(altTitles, draft);
    if (result.ok) {
      onChange(result.altTitles);
      setDraft('');
      setLocalError('');
    } else {
      setLocalError(ALT_TITLE_REASON[result.reason]);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Backspace' && draft === '' && altTitles.length > 0) {
      onChange(altTitles.slice(0, -1));
    }
  };

  return (
    <div className="space-y-2">
      <label htmlFor={`${id}-input`} className={labelClass}>
        Alternate titles <span className="font-normal text-muted-foreground">(optional)</span>
      </label>
      {altTitles.length > 0 ? (
        <ul className="flex flex-wrap gap-2" aria-label="Alternate titles">
          {altTitles.map((t, i) => (
            <li
              key={`${t}-${i}`}
              className="inline-flex max-w-full items-center rounded-chip bg-secondary pl-2 text-sm text-secondary-foreground"
            >
              <span className="min-w-0 break-words">{t}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon-lg"
                className="size-tap shrink-0"
                aria-label={`Remove alternate title ${t}`}
                disabled={disabled}
                onClick={() => onChange(altTitles.filter((_, j) => j !== i))}
              >
                <XIcon aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No alternate titles.</p>
      )}
      <div className="flex gap-2">
        <Input
          id={`${id}-input`}
          className="h-tap"
          value={draft}
          maxLength={BASIC_LIMITS.altTitleMax}
          placeholder={full ? 'Limit reached' : 'e.g. 1000 Hallelujahs'}
          disabled={disabled || full}
          aria-invalid={messages.length > 0 || undefined}
          aria-describedby={`${id}-hint${messages.length ? ` ${id}-errors` : ''}`}
          onChange={(e) => {
            setDraft(e.target.value);
            if (localError) setLocalError('');
          }}
          onKeyDown={onKeyDown}
        />
        <Button
          type="button"
          variant="outline"
          className="h-tap"
          disabled={disabled || full || !draft.trim()}
          onClick={commit}
        >
          <PlusIcon aria-hidden />
          Add
        </Button>
      </div>
      <p id={`${id}-hint`} className="text-xs text-muted-foreground">
        Press Enter to add each one.
      </p>
      <FieldErrors id={`${id}-errors`} messages={messages} />
    </div>
  );
}

// ---------- Composer picker (command palette) ----------

type SearchState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; results: Composer[] };

function ComposerPicker({
  selected,
  onAdd,
  searchComposers,
  createComposer,
  disabled,
  invalid,
  describedBy,
}: {
  selected: Composer[];
  onAdd(c: Composer): void;
  searchComposers: BasicInfoSectionProps['searchComposers'];
  createComposer: BasicInfoSectionProps['createComposer'];
  disabled?: boolean;
  invalid: boolean;
  describedBy?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState<SearchState>({ status: 'idle' });
  const [retry, setRetry] = useState(0);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const trimmed = query.trim();
  const full = selected.length >= BASIC_LIMITS.composersMax;

  useEffect(() => {
    if (!open || !trimmed) {
      setSearch({ status: 'idle' });
      return;
    }
    let cancelled = false;
    setSearch({ status: 'loading' });
    const timer = setTimeout(() => {
      searchComposers(trimmed).then(
        (results) => {
          if (!cancelled) setSearch({ status: 'ready', results });
        },
        () => {
          if (!cancelled) setSearch({ status: 'error' });
        },
      );
    }, COMPOSER_SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, trimmed, searchComposers, retry]);

  const selectedIds = new Set(selected.map((c) => c.id));
  const results =
    search.status === 'ready' ? search.results.filter((c) => !selectedIds.has(c.id)) : [];
  const lower = trimmed.toLowerCase();
  const exists =
    search.status === 'ready' &&
    [...search.results, ...selected].some((c) => c.name.trim().toLowerCase() === lower);
  const canCreate = search.status === 'ready' && !!trimmed && !exists;

  const close = () => {
    setOpen(false);
    setQuery('');
    setCreateError('');
  };

  const pick = (c: Composer) => {
    onAdd(c);
    close();
  };

  const create = async () => {
    setCreating(true);
    setCreateError('');
    try {
      const result = await createComposer(trimmed);
      if (result.ok) {
        toast.success(`Created composer ${result.data.name}`);
        pick(result.data);
      } else {
        setCreateError(result.error.message);
        toast.error(`Couldn't create composer: ${result.error.message}`);
      }
    } catch {
      setCreateError('Something went wrong. Try again.');
      toast.error("Couldn't create composer");
    } finally {
      setCreating(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={(o) => (o ? setOpen(true) : close())}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="h-tap w-full justify-start sm:w-auto"
          disabled={disabled || full}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
        >
          <PlusIcon aria-hidden />
          {full ? `Up to ${BASIC_LIMITS.composersMax} composers` : 'Add composer'}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(20rem,calc(100vw-2rem))] p-0">
        <Command shouldFilter={false} label="Search composers">
          <CommandInput
            placeholder="Search composers…"
            value={query}
            onValueChange={(v) => {
              setQuery(v);
              setCreateError('');
            }}
          />
          <CommandList>
            {search.status === 'idle' && (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                Type a name to search.
              </p>
            )}
            {search.status === 'loading' && (
              <div className="space-y-2 p-3" role="status" aria-label="Searching composers">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-5 w-1/2" />
              </div>
            )}
            {search.status === 'error' && (
              <div className="space-y-2 px-3 py-4 text-center text-sm" role="alert">
                <p>Couldn&apos;t load composers.</p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setRetry(retry + 1)}
                >
                  Try again
                </Button>
              </div>
            )}
            {search.status === 'ready' && !canCreate && results.length === 0 && (
              // Only reachable when the exact name is already selected (otherwise "Create" shows).
              <CommandEmpty>Already added.</CommandEmpty>
            )}
            {results.length > 0 && (
              <CommandGroup heading="Composers">
                {results.map((c) => (
                  <CommandItem
                    key={c.id}
                    value={c.id}
                    className="min-h-tap"
                    onSelect={() => pick(c)}
                  >
                    <ComposerLabel composer={c} />
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {canCreate && (
              <CommandGroup heading="New">
                <CommandItem
                  value="__create__"
                  className="min-h-tap"
                  disabled={creating}
                  onSelect={() => void create()}
                >
                  <PlusIcon aria-hidden />
                  {creating ? `Creating “${trimmed}”…` : `Create “${trimmed}”`}
                </CommandItem>
              </CommandGroup>
            )}
            {createError && (
              <p className="px-3 pb-3 text-sm text-destructive" role="alert">
                {createError}
              </p>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// ---------- Composer list (ordered, drag to reorder) ----------

function ComposersField({
  composers,
  onChange,
  serverErrors,
  searchComposers,
  createComposer,
  disabled,
}: {
  composers: Composer[];
  onChange(next: Composer[]): void;
  serverErrors: string[];
  searchComposers: BasicInfoSectionProps['searchComposers'];
  createComposer: BasicInfoSectionProps['createComposer'];
  disabled?: boolean;
}) {
  const id = useId();
  const listRef = useRef<HTMLOListElement>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [focusAfterMove, setFocusAfterMove] = useState<{ id: string; dir: 'up' | 'down' } | null>(
    null,
  );

  // Keep keyboard focus on the moved row; fall back to the other arrow when one becomes disabled.
  useEffect(() => {
    if (!focusAfterMove || !listRef.current) return;
    const row = listRef.current.querySelector<HTMLElement>(
      `[data-composer-id="${CSS.escape(focusAfterMove.id)}"]`,
    );
    const preferred = row?.querySelector<HTMLButtonElement>(`[data-move="${focusAfterMove.dir}"]`);
    const other = row?.querySelector<HTMLButtonElement>(
      `[data-move="${focusAfterMove.dir === 'up' ? 'down' : 'up'}"]`,
    );
    (preferred && !preferred.disabled ? preferred : other)?.focus();
    setFocusAfterMove(null);
  }, [focusAfterMove]);

  const move = (from: number, to: number, dir?: 'up' | 'down') => {
    const moved = composers[from];
    if (!moved || from === to || to < 0 || to >= composers.length) return;
    onChange(moveItem(composers, from, to));
    setAnnouncement(`Moved ${moved.name} to position ${to + 1} of ${composers.length}`);
    if (dir) setFocusAfterMove({ id: moved.id, dir });
  };

  const remove = (index: number) => {
    const removed = composers[index];
    if (!removed) return;
    onChange(composers.filter((_, i) => i !== index));
    setAnnouncement(`Removed ${removed.name}`);
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

  const messages = serverErrors;
  const headingId = `${id}-label`;
  const errorsId = `${id}-errors`;

  return (
    <div className="space-y-2" role="group" aria-labelledby={headingId}>
      <p id={headingId} className={labelClass}>
        Composers{' '}
        <span className="font-normal text-muted-foreground">(at least one, in order)</span>
      </p>
      {composers.length > 0 ? (
        <ol ref={listRef} className="space-y-1" aria-label="Composers in order">
          {composers.map((c, i) => (
            <li
              key={c.id}
              data-composer-id={c.id}
              draggable={!disabled}
              onDragStart={(e) => {
                setDragFrom(i);
                e.dataTransfer.effectAllowed = 'move';
                // Firefox only starts a drag when some data is set.
                e.dataTransfer.setData('text/plain', c.id);
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
              <span className="w-5 shrink-0 text-right text-muted-foreground tabular-nums">
                {i + 1}.
              </span>
              <span className="min-w-0 flex-1 py-2 break-words">
                <ComposerLabel composer={c} />
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon-lg"
                data-move="up"
                aria-label={`Move ${c.name} up`}
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
                aria-label={`Move ${c.name} down`}
                disabled={disabled || i === composers.length - 1}
                onClick={() => move(i, i + 1, 'down')}
              >
                <ArrowDownIcon aria-hidden />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-lg"
                aria-label={`Remove ${c.name}`}
                disabled={disabled}
                onClick={() => remove(i)}
              >
                <XIcon aria-hidden />
              </Button>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-muted-foreground">No composers yet. Add at least one.</p>
      )}
      <ComposerPicker
        selected={composers}
        onAdd={(c) => {
          onChange([...composers, c]);
          setAnnouncement(`Added ${c.name}`);
        }}
        searchComposers={searchComposers}
        createComposer={createComposer}
        disabled={disabled}
        invalid={messages.length > 0}
        describedBy={messages.length > 0 ? errorsId : undefined}
      />
      {composers.length > 1 && (
        <p className="text-xs text-muted-foreground">
          Drag rows or use the arrows to change the order.
        </p>
      )}
      <FieldErrors id={errorsId} messages={messages} />
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}

// ---------- Section ----------

/** Song form section for REQ-LIB-02/03: title, alternate titles, composers, source group, year. */
export function BasicInfoSection({
  value,
  onChange,
  errors,
  searchComposers,
  createComposer,
  disabled,
}: BasicInfoSectionProps) {
  const id = useId();
  const basic = value.basic ?? emptyBasicInfo();
  // Range errors wait for blur so typing "2" on the way to "2021" isn't flagged.
  const [yearBlurred, setYearBlurred] = useState(false);
  const update = (patch: Partial<BasicInfoValue>) => onChange({ basic: { ...basic, ...patch } });

  const titleErrors = errorsFor(errors, 'title');
  const sourceErrors = errorsFor(errors, 'sourceGroup');
  const yearOutOfRange =
    yearBlurred &&
    basic.year !== null &&
    (basic.year < BASIC_LIMITS.yearMin || basic.year > BASIC_LIMITS.yearMax);
  const yearErrors = [
    ...(yearOutOfRange
      ? [`Year must be between ${BASIC_LIMITS.yearMin} and ${BASIC_LIMITS.yearMax}`]
      : []),
    ...errorsFor(errors, 'year'),
  ];

  const describe = (field: string, messages: string[]) =>
    messages.length > 0 ? `${id}-${field}-errors` : undefined;

  return (
    <fieldset className="min-w-0 space-y-5" disabled={disabled}>
      <legend className="mb-3 text-lg font-semibold">Basic info</legend>

      <div className="space-y-2">
        <label htmlFor={`${id}-title`} className={labelClass}>
          Title
        </label>
        <Input
          id={`${id}-title`}
          className="h-tap"
          value={basic.title}
          required
          maxLength={BASIC_LIMITS.titleMax}
          autoComplete="off"
          aria-invalid={titleErrors.length > 0 || undefined}
          aria-describedby={describe('title', titleErrors)}
          onChange={(e) => update({ title: e.target.value })}
        />
        <FieldErrors id={`${id}-title-errors`} messages={titleErrors} />
      </div>

      <AltTitlesField
        altTitles={basic.altTitles}
        onChange={(altTitles) => update({ altTitles })}
        serverErrors={errorsFor(errors, 'altTitles')}
        disabled={disabled}
      />

      <ComposersField
        composers={basic.composers}
        onChange={(composers) => update({ composers })}
        serverErrors={errorsFor(errors, 'composers', 'composerIds')}
        searchComposers={searchComposers}
        createComposer={createComposer}
        disabled={disabled}
      />

      <div className="grid gap-5 sm:grid-cols-[1fr_10rem]">
        <div className="space-y-2">
          <label htmlFor={`${id}-source`} className={labelClass}>
            Source group <span className="font-normal text-muted-foreground">(optional)</span>
          </label>
          <Input
            id={`${id}-source`}
            className="h-tap"
            value={basic.sourceGroup ?? ''}
            maxLength={BASIC_LIMITS.sourceGroupMax}
            placeholder="e.g. Hillsong"
            aria-invalid={sourceErrors.length > 0 || undefined}
            aria-describedby={describe('source', sourceErrors)}
            onChange={(e) => update({ sourceGroup: e.target.value === '' ? null : e.target.value })}
          />
          <FieldErrors id={`${id}-source-errors`} messages={sourceErrors} />
        </div>
        <div className="space-y-2">
          <label htmlFor={`${id}-year`} className={labelClass}>
            Year composed <span className="font-normal text-muted-foreground">(optional)</span>
          </label>
          <Input
            id={`${id}-year`}
            className="h-tap"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={4}
            placeholder="e.g. 2021"
            value={basic.year ?? ''}
            aria-invalid={yearErrors.length > 0 || undefined}
            aria-describedby={describe('year', yearErrors)}
            onBlur={() => setYearBlurred(true)}
            onChange={(e) => {
              setYearBlurred(false);
              update({ year: parseYear(e.target.value) });
            }}
          />
          <FieldErrors id={`${id}-year-errors`} messages={yearErrors} />
        </div>
      </div>
    </fieldset>
  );
}

/** Loading placeholder while the song being edited is fetched. */
export function BasicInfoSectionSkeleton() {
  return (
    <div className="space-y-5" role="status" aria-label="Loading basic info">
      <Skeleton className="h-6 w-28" />
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-10 w-full" />
        </div>
      ))}
    </div>
  );
}
