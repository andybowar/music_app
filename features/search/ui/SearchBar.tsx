'use client';

import { CheckIcon, SearchIcon, XIcon } from 'lucide-react';
import { useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/components/ui/utils';
import { SEARCH_FIELDS, type SearchField } from '@/types/domain';

/** Sentence-case labels for the field toggles (REQ-SRCH-02). */
export const SEARCH_FIELD_LABELS: Record<SearchField, string> = {
  title: 'Titles',
  lyrics: 'Lyrics',
  themes: 'Themes',
  composer: 'Composer',
};

export interface SearchBarProps {
  /** Free text. */
  value: string;
  /** Fields the text is matched against. Empty is treated as all four (the default). */
  fields: SearchField[];
  /**
   * Called on every keystroke, clear and field toggle with the full current state.
   * Debouncing is the caller's job (`useSearchState` does it with `{ typing: true }`).
   */
  onChange(q: string, fields: SearchField[]): void;
  /** Enter in the box. */
  onSubmit(): void;
  className?: string;
}

interface TextState {
  draft: string;
  /** Last `value` prop seen. */
  prevValue: string;
  /** Emitted texts not yet echoed back through `value`, oldest first. */
  sent: string[];
}

/** Bound on remembered un-echoed texts, so a caller that never echoes can't grow it. */
const MAX_SENT = 50;

/** Keep `SEARCH_FIELDS` order and drop unknown or duplicate values. */
function normalizeFields(fields: readonly string[]): SearchField[] {
  const picked = SEARCH_FIELDS.filter((f) => fields.includes(f));
  return picked.length > 0 ? picked : [...SEARCH_FIELDS];
}

/**
 * Free-text search box with Titles / Lyrics / Themes / Composer toggles (REQ-SRCH-02).
 * Enter submits, Esc clears. At least one field always stays selected.
 */
export function SearchBar({ value, fields, onChange, onSubmit, className }: SearchBarProps) {
  const inputId = useId();
  const fieldsLabelId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  // Local draft so typing stays responsive while the caller debounces `value`. `sent`
  // holds texts we emitted that haven't come back through `value` yet. An incoming
  // `value` found there is an echo (possibly a stale one: the router commits
  // asynchronously) and must not overwrite newer keystrokes; anything else is an
  // external change (Home, back button) and replaces the draft. Kept in state rather
  // than a ref so render stays pure.
  const [text, setText] = useState<TextState>({ draft: value, prevValue: value, sent: [] });
  if (value !== text.prevValue) {
    const echo = text.sent.lastIndexOf(value);
    setText(
      echo >= 0
        ? { draft: text.draft, prevValue: value, sent: text.sent.slice(echo + 1) }
        : { draft: value, prevValue: value, sent: [] },
    );
  }
  const draft = text.draft;

  const selected = normalizeFields(fields);

  const changeText = (q: string) => {
    setText((t) => ({ ...t, draft: q, sent: [...t.sent, q].slice(-MAX_SENT) }));
    onChange(q, selected);
  };

  const clearText = () => {
    if (draft !== '') changeText('');
    inputRef.current?.focus();
  };

  const changeFields = (next: string[]) => {
    if (next.length === 0) return; // at least one field stays on
    onChange(draft, normalizeFields(next));
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    onSubmit();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape' && draft !== '') {
      e.preventDefault();
      clearText();
    }
  };

  return (
    <form
      role="search"
      aria-label="Song search"
      onSubmit={handleSubmit}
      className={cn('flex w-full min-w-0 flex-col gap-2', className)}
    >
      <div className="relative w-full min-w-0">
        <label htmlFor={inputId} className="sr-only">
          Search songs
        </label>
        <SearchIcon
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          ref={inputRef}
          id={inputId}
          type="text"
          inputMode="search"
          enterKeyHint="search"
          autoComplete="off"
          spellCheck={false}
          placeholder="Search songs"
          value={draft}
          onChange={(e) => changeText(e.target.value)}
          onKeyDown={handleKeyDown}
          className="h-10 pr-10 pl-9"
        />
        {draft !== '' && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Clear search"
            onClick={clearText}
            className="absolute top-1/2 right-1 -translate-y-1/2"
          >
            <XIcon aria-hidden="true" />
          </Button>
        )}
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <span id={fieldsLabelId} className="text-sm text-muted-foreground">
          Search in
        </span>
        <ToggleGroup
          type="multiple"
          variant="outline"
          size="sm"
          spacing={1}
          aria-labelledby={fieldsLabelId}
          value={selected}
          onValueChange={changeFields}
          className="flex-wrap"
        >
          {SEARCH_FIELDS.map((field) => {
            const only = selected.length === 1 && selected[0] === field;
            return (
              <ToggleGroupItem
                key={field}
                value={field}
                aria-disabled={only || undefined}
                title={only ? 'At least one field must stay selected' : undefined}
                className="group/field gap-1.5 px-2.5 aria-disabled:cursor-not-allowed data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:hover:bg-primary/90"
              >
                <CheckIcon
                  aria-hidden="true"
                  className="hidden group-data-[state=on]/field:block"
                />
                {SEARCH_FIELD_LABELS[field]}
              </ToggleGroupItem>
            );
          })}
        </ToggleGroup>
      </div>
    </form>
  );
}
