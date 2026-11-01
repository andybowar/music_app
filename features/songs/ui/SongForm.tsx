'use client';

import { AlertCircleIcon } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Toaster } from '@/components/ui/sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/components/ui/utils';
import { can } from '@/lib/permissions';
import type {
  ActionResult,
  AppUser,
  Branch,
  Composer,
  Resource,
  SongDetail,
  Theme,
  UUID,
} from '@/types/domain';

import { BasicInfoSection } from './form/BasicInfoSection';
import { LyricsSection } from './form/LyricsSection';
import { MusicalSection } from './form/MusicalSection';
import { ResourcesSection, type ResourcesSectionProps } from './form/ResourcesSection';
import { ThemesSection } from './form/ThemesSection';
import {
  emptySongFormValue,
  FORM_TABS,
  saveSong,
  songFormValueFromSong,
  tabsWithErrors,
  validateSongForm,
  withSavedKeyIds,
  type FormTab,
  type SongSaveActions,
} from './form/toInput';
import type { SongFormErrors, SongFormValue } from './form/types';
import { UsageSection } from './form/UsageSection';

/** Every server function the form needs (contracts/api.md), passed down from the page. */
export interface SongFormActions
  extends
    SongSaveActions,
    Pick<
      ResourcesSectionProps,
      | 'requestUpload'
      | 'finalizeUpload'
      | 'deleteResource'
      | 'getSignedResourceUrl'
      | 'addLink'
      | 'updateLink'
    > {
  searchComposers(prefix: string): Promise<Composer[]>;
  createComposer(name: string): Promise<ActionResult<Composer>>;
  searchThemes(prefix: string, limit?: number): Promise<Theme[]>;
  createTheme(name: string): Promise<ActionResult<Theme>>;
}

export interface SongFormProps {
  /** null on /songs/new. */
  song: SongDetail | null;
  user: AppUser;
  /** Every branch, in display order (branch usage rows). */
  branches: Branch[];
  actions: SongFormActions;
  /** Tab to open first (a `FormTab`, e.g. `files` right after a song is created); others are ignored. */
  initialTab?: string;
  /** A one-off note shown above the form (e.g. "Song added"). */
  notice?: string | null;
}

export const TAB_LABEL: Record<FormTab, string> = {
  basic: 'Basic info',
  musical: 'Keys & tempo',
  lyrics: 'Lyrics',
  themes: 'Themes',
  usage: 'Branch usage',
  files: 'Files & links',
};

export const LEAVE_MESSAGE = 'You have unsaved changes. Leave without saving?';

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Warns before leaving with unsaved changes: the browser prompt on reload/close, and a confirm
 * on in-app link clicks (App Router has no route-change event, so clicks are caught in the
 * capture phase before `next/link` sees them).
 */
export function useLeaveGuard(dirty: boolean, message = LEAVE_MESSAGE): void {
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // reason: legacy browsers only show the prompt when returnValue is set.
      e.returnValue = '';
    };
    const onClick = (e: MouseEvent) => {
      if (
        e.defaultPrevented ||
        e.button !== 0 ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.altKey
      ) {
        return;
      }
      const anchor = (e.target as Element | null)?.closest?.('a[href]');
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if ((anchor.target && anchor.target !== '_self') || anchor.hasAttribute('download')) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return; // full navigation → beforeunload
      if (url.pathname === window.location.pathname && url.search === window.location.search) {
        return; // same page (hash link)
      }
      if (!window.confirm(message)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('click', onClick, true);
    };
  }, [dirty, message]);
}

/**
 * Song create/edit form (LIB-17, REQ-LIB-01): the LIB-10…15 sections in tabs, saved through
 * `saveSong` (createSong/updateSong, then setSongKeys, setSongThemes, setBranchUsage). Files and
 * links save on their own as they are added, so they need a saved song: after creating, the page
 * moves to the edit form on the files tab.
 */
export function SongForm({ song, user, branches, actions, initialTab, notice }: SongFormProps) {
  const router = useRouter();
  const id = useId();
  const [value, setValue] = useState<SongFormValue>(() =>
    song ? songFormValueFromSong(song) : emptySongFormValue(),
  );
  /** Last saved value; null when the server state is unknown (re-send everything). */
  const [saved, setSaved] = useState<SongFormValue | null>(() => (song ? value : null));
  /** The new song's id once created here (a later step may have failed). */
  const [songId, setSongId] = useState<UUID | null>(song?.id ?? null);
  const [errors, setErrors] = useState<SongFormErrors>({});
  const [tab, setTab] = useState<FormTab>(() => FORM_TABS.find((t) => t === initialTab) ?? 'basic');
  const [saving, setSaving] = useState(false);
  const [resources, setResources] = useState<Resource[]>(song?.resources ?? []);

  const baseline = saved ?? emptySongFormValue();
  const dirty = (song === null && songId !== null && saved === null) || !same(value, baseline);
  useLeaveGuard(dirty && !saving);

  const errorTabs = tabsWithErrors(errors);
  const formErrors = errors.form ?? [];
  const canWriteUsage = can(user, 'usage:write');
  const isNew = song === null;
  const tabIndex = FORM_TABS.indexOf(tab);
  const nextTab = FORM_TABS[tabIndex + 1];

  const onChange = (patch: Partial<SongFormValue>) => setValue((v) => ({ ...v, ...patch }));

  const fail = (next: SongFormErrors, message: string) => {
    setErrors(next);
    const first = tabsWithErrors(next)[0];
    if (first) setTab(first);
    toast.error(message);
  };

  const save = async () => {
    if (saving) return;
    const invalid = validateSongForm(value);
    if (Object.keys(invalid).length > 0) {
      fail(invalid, 'Check the highlighted fields.');
      return;
    }
    setSaving(true);
    setErrors({});
    try {
      const result = await saveSong(value, actions, { songId, saved, canWriteUsage });
      const keys = result.keys
        ? withSavedKeyIds(value.musical.keys, result.keys)
        : value.musical.keys;
      const next: SongFormValue = { ...value, musical: { ...value.musical, keys } };
      setValue(next);
      if (result.songId) setSongId(result.songId);

      if (!result.ok) {
        // A created song exists now; resend everything next time.
        if (result.created) setSaved(null);
        fail(
          result.errors,
          result.songId && result.created
            ? 'The song was added, but some details didn’t save. Fix them and save again.'
            : 'Couldn’t save. Check the highlighted fields.',
        );
        return;
      }

      setSaved(next);
      if (isNew) {
        router.replace(`/songs/${result.songId}/edit?created=1`);
        return;
      }
      toast.success('Song saved');
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  const songTitle = song?.title ?? (value.basic.title.trim() || null);

  return (
    <div className="mx-auto grid w-full max-w-4xl gap-4 px-4 py-6">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold">{isNew ? 'Add a song' : 'Edit song'}</h1>
          {!isNew && songTitle && (
            <p className="truncate text-sm text-muted-foreground">{songTitle}</p>
          )}
        </div>
        {!isNew && (
          <Link
            href={`/songs/${song.id}`}
            className="rounded-md text-sm font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring"
          >
            View song
          </Link>
        )}
      </header>

      {notice && (
        <p role="status" className="rounded-md border bg-muted/50 px-3 py-2 text-sm">
          {notice}
        </p>
      )}

      {formErrors.length > 0 && (
        <div
          role="alert"
          className="flex gap-2 rounded-md border border-destructive/50 px-3 py-2 text-sm text-destructive"
        >
          <AlertCircleIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
          <ul className="grid gap-1">
            {formErrors.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </div>
      )}

      <Tabs value={tab} onValueChange={(t) => setTab(t as FormTab)} className="min-w-0 gap-4">
        <div className="-mx-4 overflow-x-auto px-4">
          <TabsList
            aria-label="Song form sections"
            className="h-auto w-max min-w-full justify-start"
          >
            {FORM_TABS.map((t) => {
              const hasError = errorTabs.includes(t);
              return (
                <TabsTrigger
                  key={t}
                  value={t}
                  className={cn('min-h-10 flex-none px-3', hasError && 'text-destructive')}
                >
                  {TAB_LABEL[t]}
                  {hasError && (
                    <>
                      <AlertCircleIcon className="text-destructive" aria-hidden />
                      <span className="sr-only">(has errors)</span>
                    </>
                  )}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </div>

        {/* forceMount keeps each section's local state (uploads, open pickers) across tabs. */}
        <TabsContent value="basic" forceMount className="data-[state=inactive]:hidden">
          <BasicInfoSection
            value={value}
            onChange={onChange}
            errors={errors}
            disabled={saving}
            searchComposers={actions.searchComposers}
            createComposer={actions.createComposer}
          />
        </TabsContent>
        <TabsContent value="musical" forceMount className="data-[state=inactive]:hidden">
          <MusicalSection value={value} onChange={onChange} errors={errors} disabled={saving} />
        </TabsContent>
        <TabsContent value="lyrics" forceMount className="data-[state=inactive]:hidden">
          <LyricsSection value={value} onChange={onChange} errors={errors} disabled={saving} />
        </TabsContent>
        <TabsContent value="themes" forceMount className="data-[state=inactive]:hidden">
          <ThemesSection
            value={value}
            onChange={onChange}
            errors={errors}
            disabled={saving}
            searchThemes={actions.searchThemes}
            createTheme={actions.createTheme}
          />
        </TabsContent>
        <TabsContent value="usage" forceMount className="data-[state=inactive]:hidden">
          <UsageSection
            value={value}
            onChange={onChange}
            errors={errors}
            disabled={saving}
            branches={branches}
            user={user}
            saved={song?.usage}
          />
        </TabsContent>
        <TabsContent value="files" forceMount className="data-[state=inactive]:hidden">
          <ResourcesSection
            value={value}
            onChange={onChange}
            errors={errors}
            disabled={saving}
            songId={isNew ? null : songId}
            initialResources={resources}
            onResourcesChange={setResources}
            requestUpload={actions.requestUpload}
            finalizeUpload={actions.finalizeUpload}
            deleteResource={actions.deleteResource}
            getSignedResourceUrl={actions.getSignedResourceUrl}
            addLink={actions.addLink}
            updateLink={actions.updateLink}
          />
        </TabsContent>
      </Tabs>

      <div
        className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-10 -mx-4 flex flex-wrap items-center gap-2 border-t bg-background px-4 py-3 xl:bottom-0"
        aria-describedby={`${id}-status`}
      >
        <Button type="button" onClick={save} disabled={saving} className="min-h-10">
          {saving ? 'Saving…' : isNew ? 'Add song' : 'Save changes'}
        </Button>
        {nextTab && (
          <Button
            type="button"
            variant="outline"
            className="min-h-10"
            onClick={() => setTab(nextTab)}
          >
            Next: {TAB_LABEL[nextTab]}
          </Button>
        )}
        <Button asChild variant="ghost" className="min-h-10">
          <Link href={isNew ? '/library' : `/songs/${song.id}`}>Cancel</Link>
        </Button>
        <p id={`${id}-status`} role="status" className="ml-auto text-sm text-muted-foreground">
          {saving ? 'Saving…' : dirty ? 'Unsaved changes' : isNew ? '' : 'All changes saved'}
        </p>
      </div>

      <Toaster />
    </div>
  );
}

/** Loading placeholder for the song form pages. */
export function SongFormSkeleton() {
  return (
    <div className="mx-auto grid w-full max-w-4xl gap-4 px-4 py-6" aria-busy="true">
      <span className="sr-only" role="status">
        Loading song form…
      </span>
      <Skeleton className="h-7 w-40" />
      <Skeleton className="h-9 w-full" />
      <Skeleton className="h-6 w-28" />
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-10 w-full" />
        </div>
      ))}
      <Skeleton className="h-10 w-32" />
    </div>
  );
}

/** Shown instead of the form to users without `song:write` (members). */
export function SongFormForbidden() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <p className="text-sm font-medium text-muted-foreground">403</p>
      <h1 className="mt-1 text-xl font-semibold">You don&apos;t have access to this page</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Only contributors, music leaders and admins can add or edit songs. Ask an admin if you need
        a different role.
      </p>
      <Link
        href="/library"
        className="mt-4 inline-block rounded-md text-sm font-medium underline underline-offset-4 outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
      >
        Back to the library
      </Link>
    </div>
  );
}
