'use client';

import { AlertTriangleIcon, PlusIcon, XIcon } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import {
  SECTION_LABEL,
  SECTIONS,
  type ActionResult,
  type Section,
  type Theme,
} from '@/types/domain';
import { errorsFor } from './BasicInfoSection';
import type { SongFormErrors, SongFormSectionProps, SongFormValue } from './types';

export interface ThemesSectionProps extends SongFormSectionProps {
  /**
   * Prefix search (api.md `searchThemes(prefix, limit=20)`). Called only with a non-empty,
   * normalized query (see `normalizeThemeName`).
   */
  searchThemes(prefix: string, limit?: number): Promise<Theme[]>;
  /** api.md `createTheme`; idempotent on the normalized name. Always called with a normalized name. */
  createTheme(name: string): Promise<ActionResult<Theme>>;
  disabled?: boolean;
}

export type ThemeEntry = SongFormValue['themes'][number];

export const THEME_SEARCH_DEBOUNCE_MS = 200;
/** Max length of a normalized theme name (`themeNameSchema`). */
export const THEME_NAME_MAX = 60;

// ---------- Pure helpers (exported for tests) ----------

/**
 * Normalizes a theme name the way the server does (`themeNameSchema`, and the DB check
 * `name = lower(btrim(name))`): trim, collapse inner whitespace, lowercase.
 */
export function normalizeThemeName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Whether `theme` is already tagged on `section` (by id or by normalized name). */
export function hasSectionTheme(
  themes: readonly ThemeEntry[],
  section: Section,
  theme: Theme,
): boolean {
  const name = normalizeThemeName(theme.name);
  return themes.some(
    (e) =>
      e.section === section &&
      (e.theme.id === theme.id || normalizeThemeName(e.theme.name) === name),
  );
}

export type AddSectionThemeResult =
  { ok: true; themes: ThemeEntry[] } | { ok: false; reason: 'duplicate' };

/** Appends `theme` to `section` unless it is already there. The same theme may be on other sections. */
export function addSectionTheme(
  themes: readonly ThemeEntry[],
  section: Section,
  theme: Theme,
): AddSectionThemeResult {
  if (hasSectionTheme(themes, section, theme)) return { ok: false, reason: 'duplicate' };
  return { ok: true, themes: [...themes, { section, theme }] };
}

/** Removes `themeId` from `section` only. */
export function removeSectionTheme(
  themes: readonly ThemeEntry[],
  section: Section,
  themeId: string,
): ThemeEntry[] {
  return themes.filter((e) => !(e.section === section && e.theme.id === themeId));
}

/** Sections whose lyrics have text, in `SECTIONS` order. */
export function nonEmptySections(lyrics: Partial<Record<Section, string | null>> | undefined) {
  return SECTIONS.filter((s) => !!lyrics?.[s]?.trim());
}

/**
 * The section a server error key belongs to, or null if it isn't tied to one. Keys are
 * `themes.<section>` or `themes.<i>` / `entries.<i>` (optionally with a nested path), where entry
 * `i` indexes `value.themes`; LIB-17 is expected to send `setSongThemes` entries in that order.
 */
export function sectionForErrorKey(key: string, themes: readonly ThemeEntry[]): Section | null {
  const m = /^(themes|entries)\.([^.]+)(?:\.|$)/.exec(key);
  if (!m) return null;
  const [, root, ref = ''] = m;
  if (root === 'themes' && (SECTIONS as readonly string[]).includes(ref)) return ref as Section;
  if (!/^\d+$/.test(ref)) return null;
  return themes[Number(ref)]?.section ?? null;
}

/** Server errors for one section. */
export function sectionErrors(
  errors: SongFormErrors | undefined,
  themes: readonly ThemeEntry[],
  section: Section,
): string[] {
  if (!errors) return [];
  return Object.entries(errors)
    .filter(([key]) => sectionForErrorKey(key, themes) === section)
    .flatMap(([, messages]) => messages);
}

/** Server errors under `themes` / `entries` that aren't tied to one section. */
export function generalErrors(
  errors: SongFormErrors | undefined,
  themes: readonly ThemeEntry[],
): string[] {
  if (!errors) return [];
  const unplaced = Object.fromEntries(
    Object.entries(errors).filter(([key]) => sectionForErrorKey(key, themes) === null),
  );
  return errorsFor(unplaced, 'themes', 'entries');
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

// ---------- Theme picker (command palette) ----------

type SearchState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; results: Theme[] };

function ThemePicker({
  sectionLabel,
  selected,
  onAdd,
  searchThemes,
  createTheme,
  disabled,
  invalid,
  describedBy,
}: {
  sectionLabel: string;
  selected: Theme[];
  onAdd(t: Theme): void;
  searchThemes: ThemesSectionProps['searchThemes'];
  createTheme: ThemesSectionProps['createTheme'];
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
  const normalized = normalizeThemeName(query);
  const tooLong = normalized.length > THEME_NAME_MAX;

  useEffect(() => {
    if (!open || !normalized || tooLong) {
      setSearch({ status: 'idle' });
      return;
    }
    let cancelled = false;
    setSearch({ status: 'loading' });
    const timer = setTimeout(() => {
      searchThemes(normalized).then(
        (results) => {
          if (!cancelled) setSearch({ status: 'ready', results });
        },
        () => {
          if (!cancelled) setSearch({ status: 'error' });
        },
      );
    }, THEME_SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, normalized, tooLong, searchThemes, retry]);

  const selectedIds = new Set(selected.map((t) => t.id));
  const selectedNames = new Set(selected.map((t) => normalizeThemeName(t.name)));
  const results =
    search.status === 'ready'
      ? search.results.filter(
          (t) => !selectedIds.has(t.id) && !selectedNames.has(normalizeThemeName(t.name)),
        )
      : [];
  const exists =
    search.status === 'ready' &&
    [...search.results, ...selected].some((t) => normalizeThemeName(t.name) === normalized);
  const canCreate = search.status === 'ready' && !!normalized && !exists;

  const close = () => {
    setOpen(false);
    setQuery('');
    setCreateError('');
  };

  const pick = (t: Theme) => {
    onAdd(t);
    close();
  };

  const create = async () => {
    setCreating(true);
    setCreateError('');
    try {
      const result = await createTheme(normalized);
      if (result.ok) {
        toast.success(`Created theme “${result.data.name}”`);
        pick(result.data);
      } else {
        setCreateError(result.error.message);
        toast.error(`Couldn't create theme: ${result.error.message}`);
      }
    } catch {
      setCreateError('Something went wrong. Try again.');
      toast.error("Couldn't create theme");
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
          size="sm"
          className="h-tap"
          disabled={disabled}
          aria-label={`Add theme to ${sectionLabel}`}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
        >
          <PlusIcon aria-hidden />
          Add theme
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(20rem,calc(100vw-2rem))] p-0">
        <Command shouldFilter={false} label={`Search themes for ${sectionLabel}`}>
          <CommandInput
            placeholder="Search themes…"
            value={query}
            onValueChange={(v) => {
              setQuery(v);
              setCreateError('');
            }}
          />
          <CommandList>
            {search.status === 'idle' && (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                {tooLong
                  ? `Theme names are up to ${THEME_NAME_MAX} characters.`
                  : 'Type a theme to search.'}
              </p>
            )}
            {search.status === 'loading' && (
              <div className="space-y-2 p-3" role="status" aria-label="Searching themes">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-5 w-1/2" />
              </div>
            )}
            {search.status === 'error' && (
              <div className="space-y-2 px-3 py-4 text-center text-sm" role="alert">
                <p>Couldn&apos;t load themes.</p>
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
              // Only reachable when the exact name is already on this section.
              <CommandEmpty>Already on {sectionLabel}.</CommandEmpty>
            )}
            {results.length > 0 && (
              <CommandGroup heading="Themes">
                {results.map((t) => (
                  <CommandItem
                    key={t.id}
                    value={t.id}
                    className="min-h-tap"
                    onSelect={() => pick(t)}
                  >
                    {t.name}
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
                  {creating ? `Creating “${normalized}”…` : `Create “${normalized}”`}
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

// ---------- One lyric section ----------

function SectionThemes({
  section,
  themes,
  orphaned,
  serverErrors,
  onAdd,
  onRemove,
  searchThemes,
  createTheme,
  disabled,
}: {
  section: Section;
  themes: Theme[];
  /** Tagged themes on a section that no longer has lyrics. */
  orphaned: boolean;
  serverErrors: string[];
  onAdd(t: Theme): void;
  onRemove(t: Theme): void;
  searchThemes: ThemesSectionProps['searchThemes'];
  createTheme: ThemesSectionProps['createTheme'];
  disabled?: boolean;
}) {
  const id = useId();
  const label = SECTION_LABEL[section];
  const headingId = `${id}-label`;
  const errorsId = `${id}-errors`;
  return (
    <li
      className="min-w-0 space-y-2 rounded-md border p-3"
      aria-labelledby={headingId}
      data-section={section}
    >
      <p id={headingId} className="text-sm font-medium">
        {label}
      </p>
      {orphaned && (
        <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
          <AlertTriangleIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
          This section has no lyrics. Add lyrics or remove these themes.
        </p>
      )}
      {themes.length > 0 ? (
        <ul className="flex flex-wrap gap-2" aria-label={`${label} themes`}>
          {themes.map((t) => (
            <li
              key={t.id}
              className="inline-flex max-w-full items-center rounded-chip bg-secondary pl-2 text-sm text-secondary-foreground"
            >
              <span className="min-w-0 break-words">{t.name}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon-lg"
                className="size-tap shrink-0"
                aria-label={`Remove ${t.name} from ${label}`}
                disabled={disabled}
                onClick={() => onRemove(t)}
              >
                <XIcon aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No themes yet.</p>
      )}
      {!orphaned && (
        <ThemePicker
          sectionLabel={label}
          selected={themes}
          onAdd={onAdd}
          searchThemes={searchThemes}
          createTheme={createTheme}
          disabled={disabled}
          invalid={serverErrors.length > 0}
          describedBy={serverErrors.length > 0 ? errorsId : undefined}
        />
      )}
      <FieldErrors id={errorsId} messages={serverErrors} />
    </li>
  );
}

// ---------- Section ----------

/**
 * Song form section for REQ-LIB-07: tag themes on each lyric section that has text. The same
 * theme may be on several sections, but only once per section. Emits `{ themes }`.
 */
export function ThemesSection({
  value,
  onChange,
  errors,
  searchThemes,
  createTheme,
  disabled,
}: ThemesSectionProps) {
  const id = useId();
  const themes = value.themes ?? [];
  const [announcement, setAnnouncement] = useState('');

  const withLyrics = new Set(nonEmptySections(value.lyrics?.lyrics));
  const tagged = new Set(themes.map((e) => e.section));
  const shown = SECTIONS.filter((s) => withLyrics.has(s) || tagged.has(s));
  const general = generalErrors(errors, themes);

  const add = (section: Section, theme: Theme) => {
    const result = addSectionTheme(themes, section, theme);
    if (result.ok) {
      onChange({ themes: result.themes });
      setAnnouncement(`Added ${theme.name} to ${SECTION_LABEL[section]}`);
    } else {
      // createTheme is idempotent, so it can hand back a theme this section already has.
      toast.info(`${theme.name} is already on ${SECTION_LABEL[section]}`);
    }
  };

  const remove = (section: Section, theme: Theme) => {
    onChange({ themes: removeSectionTheme(themes, section, theme.id) });
    setAnnouncement(`Removed ${theme.name} from ${SECTION_LABEL[section]}`);
  };

  return (
    <fieldset className="min-w-0 space-y-3" disabled={disabled} aria-describedby={`${id}-hint`}>
      <legend className="mb-3 text-lg font-semibold">Themes</legend>
      <p id={`${id}-hint`} className="text-sm text-muted-foreground">
        Tag the themes each lyric section is about. A theme can be on several sections.
      </p>
      {shown.length > 0 ? (
        <ul className="space-y-3">
          {shown.map((s) => (
            <SectionThemes
              key={s}
              section={s}
              themes={themes.filter((e) => e.section === s).map((e) => e.theme)}
              orphaned={!withLyrics.has(s)}
              serverErrors={sectionErrors(errors, themes, s)}
              onAdd={(t) => add(s, t)}
              onRemove={(t) => remove(s, t)}
              searchThemes={searchThemes}
              createTheme={createTheme}
              disabled={disabled}
            />
          ))}
        </ul>
      ) : (
        <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
          Add lyrics first. Each section with lyrics gets its own themes.
        </p>
      )}
      <FieldErrors id={`${id}-errors`} messages={general} />
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
    </fieldset>
  );
}

/** Loading placeholder while the song being edited is fetched. */
export function ThemesSectionSkeleton() {
  return (
    <div className="space-y-3" role="status" aria-label="Loading themes">
      <Skeleton className="h-6 w-24" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="space-y-2 rounded-md border p-3">
          <Skeleton className="h-4 w-20" />
          <div className="flex gap-2">
            <Skeleton className="h-8 w-16" />
            <Skeleton className="h-8 w-20" />
          </div>
        </div>
      ))}
    </div>
  );
}
