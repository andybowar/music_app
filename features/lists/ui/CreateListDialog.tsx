'use client';

import { useId, useRef, useState, type FormEvent } from 'react';
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
import { Input } from '@/components/ui/input';
import type { ActionResult, ISODate, List, ListType } from '@/types/domain';
import { listInputSchema, type ListInput } from '@/types/validation';

export interface CreateListDialogProps {
  type: ListType;
  open: boolean;
  onOpenChange(open: boolean): void;
  /** Usually `createList` (LIST-01), wrapped by the caller to also set the current list. */
  onSubmit(input: ListInput): Promise<ActionResult<List>>;
}

type FieldErrors = Record<string, string[]>;

const NAME_MAX = 120;

const COPY: Record<ListType, { title: string; description: string; noun: string }> = {
  setlist: {
    title: 'Create event setlist',
    description: 'Pick the event date and give the setlist a name.',
    noun: 'Setlist',
  },
  playlist: {
    title: 'Create listening playlist',
    description: 'Give the playlist a name. A date is optional.',
    noun: 'Playlist',
  },
};

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function toISODate(d: Date): ISODate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Today if it is Sunday, otherwise the coming Sunday, in the user's local calendar. */
export function nextLordsDay(now: Date = new Date()): ISODate {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  d.setDate(d.getDate() + ((7 - d.getDay()) % 7));
  return toISODate(d);
}

function parseISODate(value: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const check = new Date(y, m - 1, d);
  if (check.getFullYear() !== y || check.getMonth() !== m - 1 || check.getDate() !== d) {
    return null;
  }
  return { y, m, d };
}

/**
 * Suggested list name for a date, e.g. "Lord's Day 4/19/26" for a Sunday setlist.
 * Event dates are plain dates, so this never goes through a time zone.
 */
export function suggestListName(type: ListType, eventDate: string): string {
  const parsed = parseISODate(eventDate);
  if (!parsed) return '';
  const short = `${parsed.m}/${parsed.d}/${pad(parsed.y % 100)}`;
  if (type === 'playlist') return `Playlist ${short}`;
  const isSunday = new Date(parsed.y, parsed.m - 1, parsed.d).getDay() === 0;
  return isSunday ? `Lord's Day ${short}` : `Setlist ${short}`;
}

/** Client-side check with friendly messages; the server re-validates with the same schema. */
export function validateListInput(raw: {
  type: ListType;
  name: string;
  eventDate: string;
}): { ok: true; data: ListInput } | { ok: false; fieldErrors: FieldErrors } {
  const parsed = listInputSchema.safeParse({
    type: raw.type,
    name: raw.name,
    eventDate: raw.eventDate === '' ? null : raw.eventDate,
  });
  if (parsed.success) return { ok: true, data: parsed.data };

  const fieldErrors: FieldErrors = {};
  for (const issue of parsed.error.issues) {
    const field = issue.path.map(String).join('.') || '(root)';
    let message = issue.message;
    if (field === 'name') {
      message =
        issue.code === 'too_big' ? `Name must be ${NAME_MAX} characters or fewer` : 'Enter a name';
    } else if (field === 'eventDate' && issue.code !== 'custom') {
      message = 'Enter a valid date';
    }
    const list = (fieldErrors[field] ??= []);
    if (!list.includes(message)) list.push(message);
  }
  return { ok: false, fieldErrors };
}

export function CreateListDialog({ type, open, onOpenChange, onSubmit }: CreateListDialogProps) {
  const [pending, setPending] = useState(false);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const copy = COPY[type];

  const handleOpenChange = (next: boolean) => {
    // Don't let Esc / outside click drop an in-flight create.
    if (!next && pending) return;
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto p-4 sm:p-6"
        onOpenAutoFocus={() => {
          // Radix only restores focus to a <DialogTrigger>; this dialog is opened from
          // anywhere (NavBar, add-to-list menu), so remember what had focus ourselves.
          const active = document.activeElement;
          returnFocusRef.current = active instanceof HTMLElement ? active : null;
        }}
        onCloseAutoFocus={(event) => {
          const target = returnFocusRef.current;
          if (target?.isConnected) {
            event.preventDefault();
            target.focus();
          }
        }}
      >
        <DialogHeader className="pr-8 text-left">
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>
        {/* Mounted only while open, so every open starts from a fresh suggestion. */}
        <CreateListForm
          type={type}
          pending={pending}
          setPending={setPending}
          onCancel={() => handleOpenChange(false)}
          onDone={() => onOpenChange(false)}
          onSubmit={onSubmit}
          noun={copy.noun}
        />
      </DialogContent>
    </Dialog>
  );
}

interface CreateListFormProps {
  type: ListType;
  noun: string;
  pending: boolean;
  setPending(pending: boolean): void;
  onCancel(): void;
  onDone(): void;
  onSubmit(input: ListInput): Promise<ActionResult<List>>;
}

function CreateListForm({
  type,
  noun,
  pending,
  setPending,
  onCancel,
  onDone,
  onSubmit,
}: CreateListFormProps) {
  const id = useId();
  const dateId = `${id}-date`;
  const nameId = `${id}-name`;
  const dateErrorId = `${id}-date-error`;
  const nameErrorId = `${id}-name-error`;
  const formErrorId = `${id}-form-error`;
  const dateRequired = type === 'setlist';

  const [eventDate, setEventDate] = useState<string>(() =>
    type === 'setlist' ? nextLordsDay() : '',
  );
  const [name, setName] = useState<string>(() =>
    type === 'setlist' ? suggestListName(type, nextLordsDay()) : '',
  );
  // Keep following the date's suggestion until the user types their own name.
  const [nameEdited, setNameEdited] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  const dateInputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const suggestion = suggestListName(type, eventDate);
  const dateErrors = fieldErrors.eventDate ?? [];
  const nameErrors = fieldErrors.name ?? [];
  const otherErrors = Object.entries(fieldErrors)
    .filter(([field]) => field !== 'eventDate' && field !== 'name')
    .flatMap(([, messages]) => messages);

  const clearFieldError = (field: string) => {
    setFormError(null);
    setFieldErrors((prev) => {
      if (!(field in prev)) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const showErrors = (errors: FieldErrors, message: string | null) => {
    setFieldErrors(errors);
    setFormError(message);
    if (errors.eventDate) dateInputRef.current?.focus();
    else if (errors.name) nameInputRef.current?.focus();
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;

    const checked = validateListInput({ type, name, eventDate });
    if (!checked.ok) {
      showErrors(checked.fieldErrors, null);
      return;
    }

    setPending(true);
    setFieldErrors({});
    setFormError(null);
    let result: ActionResult<List>;
    try {
      result = await onSubmit(checked.data);
    } catch {
      result = {
        ok: false,
        error: { code: 'INTERNAL', message: 'Something went wrong. Please try again.' },
      };
    }
    setPending(false);

    if (result.ok) {
      toast.success(`${noun} “${result.data.name}” created`);
      onDone();
      return;
    }

    const errors = result.error.fieldErrors ?? {};
    const hasInline = Object.keys(errors).length > 0;
    showErrors(
      errors,
      hasInline && result.error.code === 'VALIDATION' ? null : result.error.message,
    );
    toast.error(result.error.message);
  };

  const formLevel = [...(formError ? [formError] : []), ...otherErrors];

  return (
    <form
      noValidate
      onSubmit={handleSubmit}
      aria-busy={pending}
      aria-describedby={formLevel.length > 0 ? formErrorId : undefined}
      className="grid gap-4"
    >
      <div className="grid gap-1.5">
        <label htmlFor={dateId} className="text-sm font-medium">
          Event date
          {dateRequired ? null : <span className="text-muted-foreground"> (optional)</span>}
        </label>
        <Input
          ref={dateInputRef}
          id={dateId}
          name="eventDate"
          type="date"
          value={eventDate}
          required={dateRequired}
          disabled={pending}
          aria-invalid={dateErrors.length > 0 || undefined}
          aria-describedby={dateErrors.length > 0 ? dateErrorId : undefined}
          onChange={(e) => {
            const next = e.target.value;
            setEventDate(next);
            clearFieldError('eventDate');
            if (!nameEdited) {
              setName(suggestListName(type, next));
              clearFieldError('name');
            }
          }}
          className="h-tap"
        />
        {dateErrors.length > 0 ? (
          <p id={dateErrorId} className="text-sm text-destructive">
            {dateErrors.join(' ')}
          </p>
        ) : null}
      </div>

      <div className="grid gap-1.5">
        <label htmlFor={nameId} className="text-sm font-medium">
          Name
        </label>
        <Input
          ref={nameInputRef}
          id={nameId}
          name="name"
          type="text"
          value={name}
          maxLength={NAME_MAX}
          required
          autoComplete="off"
          disabled={pending}
          placeholder={suggestion || (type === 'setlist' ? "Lord's Day 4/19/26" : 'Car rides')}
          aria-invalid={nameErrors.length > 0 || undefined}
          aria-describedby={nameErrors.length > 0 ? nameErrorId : undefined}
          onChange={(e) => {
            setName(e.target.value);
            setNameEdited(true);
            clearFieldError('name');
          }}
          className="h-tap"
        />
        {nameErrors.length > 0 ? (
          <p id={nameErrorId} className="text-sm text-destructive">
            {nameErrors.join(' ')}
          </p>
        ) : null}
        {suggestion && name !== suggestion ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              setName(suggestion);
              setNameEdited(false);
              clearFieldError('name');
            }}
            className="min-h-tap justify-self-start rounded-sm text-left text-sm text-muted-foreground underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            Use “{suggestion}”
          </button>
        ) : null}
      </div>

      {formLevel.length > 0 ? (
        <div
          id={formErrorId}
          role="alert"
          className="rounded-md border border-destructive/50 px-3 py-2 text-sm text-destructive"
        >
          {formLevel.map((message) => (
            <p key={message}>{message}</p>
          ))}
        </div>
      ) : null}

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={onCancel}
          className="h-tap"
        >
          Cancel
        </Button>
        {/* aria-disabled, not disabled, so focus stays on the button while saving. */}
        <Button type="submit" aria-disabled={pending || undefined} className="h-tap">
          {pending ? 'Creating…' : `Create ${noun.toLowerCase()}`}
        </Button>
      </DialogFooter>
    </form>
  );
}
