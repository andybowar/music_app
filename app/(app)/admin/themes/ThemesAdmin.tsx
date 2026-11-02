'use client';

import { DownloadIcon, MergeIcon, PencilIcon, SearchIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useId, useMemo, useState, type FormEvent } from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
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
import { Textarea } from '@/components/ui/textarea';
import type { AdminTheme, VocabularyImportResult } from '@/features/search/server/synonyms';
import type { ActionResult, UUID } from '@/types/domain';

export interface ThemesAdminProps {
  themes: AdminTheme[];
  /** Show the "Load starter vocabulary" button (needs `theme:create`). */
  canImport: boolean;
  onMerge(keepId: UUID, dropId: UUID): Promise<ActionResult<void>>;
  onSetSynonyms(themeId: UUID, synonyms: string[]): Promise<ActionResult<void>>;
  onImport(): Promise<ActionResult<VocabularyImportResult>>;
}

/** Splits the synonyms box (one per line or comma-separated) into trimmed, non-empty entries. */
export function parseSynonyms(text: string): string[] {
  return text
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Error messages for `synonyms.<i>` field errors, prefixed with the entry they belong to. */
export function synonymErrors(
  entries: string[],
  fieldErrors: Record<string, string[]> | undefined,
): string[] {
  if (!fieldErrors) return [];
  return Object.entries(fieldErrors).flatMap(([key, messages]) => {
    const match = /^synonyms\.(\d+)$/.exec(key);
    const entry = match ? entries[Number(match[1])] : undefined;
    return messages.map((m) => (entry !== undefined && !m.includes(`"`) ? `${entry}: ${m}` : m));
  });
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Admin › Themes (H-02): find themes, edit their search synonyms, merge duplicates. */
export function ThemesAdmin({
  themes,
  canImport,
  onMerge,
  onSetSynonyms,
  onImport,
}: ThemesAdminProps) {
  const router = useRouter();
  const filterId = useId();
  const [filter, setFilter] = useState('');
  const [editing, setEditing] = useState<AdminTheme | null>(null);
  const [merging, setMerging] = useState<AdminTheme | null>(null);
  const [importing, setImporting] = useState(false);

  const needle = filter.trim().replace(/\s+/g, ' ').toLowerCase();
  const visible = useMemo(
    () =>
      needle
        ? themes.filter(
            (t) => t.name.includes(needle) || t.synonyms.some((s) => s.includes(needle)),
          )
        : themes,
    [themes, needle],
  );

  async function runImport() {
    setImporting(true);
    const result = await onImport();
    setImporting(false);
    if (!result.ok) {
      toast.error(result.error.message);
      return;
    }
    const { themesCreated, synonymsAdded, skipped } = result.data;
    const added =
      themesCreated + synonymsAdded === 0
        ? 'Nothing new to add'
        : `Added ${plural(themesCreated, 'theme', 'themes')} and ${plural(synonymsAdded, 'synonym', 'synonyms')}`;
    toast.success(
      skipped.length > 0
        ? `${added}. Skipped ${plural(skipped.length, 'synonym', 'synonyms')} already in use.`
        : `${added}.`,
    );
    router.refresh();
  }

  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">
        Searching a synonym also finds songs tagged with its theme. Merging a theme moves its songs
        to the other theme and keeps its name as a synonym.
      </p>

      <div className="flex flex-wrap items-end gap-2">
        <div className="grid min-w-0 flex-1 basis-56 gap-1.5">
          <label htmlFor={filterId} className="text-sm font-medium">
            Find a theme
          </label>
          <div className="relative">
            <SearchIcon
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              id={filterId}
              type="search"
              autoComplete="off"
              className="pl-8"
              placeholder="Theme or synonym"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>
        </div>
        {canImport ? (
          <Button variant="outline" disabled={importing} onClick={runImport}>
            <DownloadIcon aria-hidden />
            {importing ? 'Loading…' : 'Load starter vocabulary'}
          </Button>
        ) : null}
      </div>

      {themes.length === 0 ? (
        <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          No themes yet.{' '}
          {canImport
            ? 'Load the starter vocabulary, or create themes while tagging songs.'
            : 'Themes are created while tagging songs.'}
        </p>
      ) : visible.length === 0 ? (
        <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          No themes match &ldquo;{filter.trim()}&rdquo;.
        </p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {needle
              ? `${visible.length} of ${plural(themes.length, 'theme', 'themes')}`
              : plural(themes.length, 'theme', 'themes')}
          </p>
          <ul className="divide-y rounded-md border">
            {visible.map((t) => (
              <ThemeRow
                key={t.id}
                theme={t}
                canMerge={themes.length > 1}
                onEdit={() => setEditing(t)}
                onMerge={() => setMerging(t)}
              />
            ))}
          </ul>
        </>
      )}

      <SynonymsDialog
        key={editing?.id ?? 'closed'}
        theme={editing}
        onOpenChange={(open) => (open ? undefined : setEditing(null))}
        onSave={async (themeId, synonyms) => {
          const result = await onSetSynonyms(themeId, synonyms);
          if (result.ok) {
            toast.success(`Synonyms for ${editing?.name ?? 'the theme'} saved`);
            router.refresh();
          }
          return result;
        }}
      />
      <MergeDialog
        key={merging ? `merge-${merging.id}` : 'merge-closed'}
        drop={merging}
        themes={themes}
        onOpenChange={(open) => (open ? undefined : setMerging(null))}
        onMerge={async (keep, drop) => {
          const result = await onMerge(keep.id, drop.id);
          if (result.ok) {
            toast.success(`Merged ${drop.name} into ${keep.name}`);
            router.refresh();
          }
          return result;
        }}
      />
    </div>
  );
}

function ThemeRow({
  theme,
  canMerge,
  onEdit,
  onMerge,
}: {
  theme: AdminTheme;
  canMerge: boolean;
  onEdit(): void;
  onMerge(): void;
}) {
  return (
    <li className="grid gap-3 p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div className="grid min-w-0 gap-1.5">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
          <p className="font-medium break-words">{theme.name}</p>
          <p className="text-sm text-muted-foreground">
            {plural(theme.songCount, 'song', 'songs')}
          </p>
        </div>
        {theme.synonyms.length > 0 ? (
          <ul className="flex flex-wrap gap-1" aria-label={`Synonyms of ${theme.name}`}>
            {theme.synonyms.map((s) => (
              <li key={s}>
                <Badge variant="secondary" className="max-w-full whitespace-normal">
                  {s}
                </Badge>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No synonyms</p>
        )}
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={onEdit}
          aria-label={`Edit synonyms of ${theme.name}`}
        >
          <PencilIcon aria-hidden />
          Synonyms
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={!canMerge}
          onClick={onMerge}
          aria-label={`Merge ${theme.name} into another theme`}
        >
          <MergeIcon aria-hidden />
          Merge
        </Button>
      </div>
    </li>
  );
}

/** Edit one theme's synonyms. Mount with a `key` per theme so the form starts from its values. */
function SynonymsDialog({
  theme,
  onOpenChange,
  onSave,
}: {
  theme: AdminTheme | null;
  onOpenChange(open: boolean): void;
  onSave(themeId: UUID, synonyms: string[]): Promise<ActionResult<void>>;
}) {
  const id = useId();
  const [text, setText] = useState(theme?.synonyms.join('\n') ?? '');
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!theme) return;
    const entries = parseSynonyms(text);
    setPending(true);
    const result = await onSave(theme.id, entries);
    setPending(false);
    if (result.ok) {
      onOpenChange(false);
      return;
    }
    const fieldMessages = synonymErrors(entries, result.error.fieldErrors);
    setErrors([result.error.message, ...fieldMessages]);
  };

  return (
    <Dialog
      open={theme !== null}
      onOpenChange={(next) => (pending && !next ? undefined : onOpenChange(next))}
    >
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto p-4 sm:p-6">
        <DialogHeader className="pr-8 text-left">
          <DialogTitle>Synonyms of {theme?.name}</DialogTitle>
          <DialogDescription>
            Searching any of these words in Themes also finds songs tagged {theme?.name}.
          </DialogDescription>
        </DialogHeader>
        <form noValidate onSubmit={submit} className="grid gap-4">
          <div className="grid gap-1.5">
            <label htmlFor={`${id}-synonyms`} className="text-sm font-medium">
              Synonyms
            </label>
            <Textarea
              id={`${id}-synonyms`}
              rows={6}
              value={text}
              onChange={(e) => setText(e.target.value)}
              aria-describedby={`${id}-hint${errors.length ? ` ${id}-errors` : ''}`}
              {...(errors.length ? { 'aria-invalid': true } : {})}
            />
            <p id={`${id}-hint`} className="text-sm text-muted-foreground">
              One per line, or separated by commas. Leave empty to remove them all.
            </p>
          </div>
          {errors.length ? (
            <div id={`${id}-errors`} role="alert" className="grid gap-1 text-sm text-destructive">
              {errors.map((m, i) => (
                <p key={i}>{m}</p>
              ))}
            </div>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? 'Saving…' : 'Save synonyms'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Merge `drop` into a theme the user picks. */
function MergeDialog({
  drop,
  themes,
  onOpenChange,
  onMerge,
}: {
  drop: AdminTheme | null;
  themes: AdminTheme[];
  onOpenChange(open: boolean): void;
  onMerge(keep: AdminTheme, drop: AdminTheme): Promise<ActionResult<void>>;
}) {
  const id = useId();
  const [keepId, setKeepId] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const others = themes.filter((t) => t.id !== drop?.id);
  const keep = others.find((t) => t.id === keepId) ?? null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!drop) return;
    if (!keep) {
      setError('Pick the theme to keep.');
      return;
    }
    setPending(true);
    setError(null);
    const result = await onMerge(keep, drop);
    setPending(false);
    if (result.ok) onOpenChange(false);
    else setError(result.error.message);
  };

  return (
    <Dialog
      open={drop !== null}
      onOpenChange={(next) => (pending && !next ? undefined : onOpenChange(next))}
    >
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto p-4 sm:p-6">
        <DialogHeader className="pr-8 text-left">
          <DialogTitle>Merge {drop?.name}</DialogTitle>
          <DialogDescription>
            Songs tagged {drop?.name} ({plural(drop?.songCount ?? 0, 'song', 'songs')}) get the
            theme you keep instead. {drop?.name} and its synonyms become synonyms of it, and{' '}
            {drop?.name} is deleted. This can&apos;t be undone.
          </DialogDescription>
        </DialogHeader>
        <form noValidate onSubmit={submit} className="grid gap-4">
          <div className="grid gap-1.5">
            <label htmlFor={`${id}-keep`} className="text-sm font-medium">
              Theme to keep
            </label>
            <select
              id={`${id}-keep`}
              value={keepId}
              onChange={(e) => {
                setKeepId(e.target.value);
                setError(null);
              }}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `${id}-error` : undefined}
              className="h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive dark:bg-input/30"
            >
              <option value="">Choose a theme…</option>
              {others.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          {error ? (
            <p id={`${id}-error`} role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="destructive" disabled={pending}>
              {pending ? 'Merging…' : keep ? `Merge into ${keep.name}` : 'Merge'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
