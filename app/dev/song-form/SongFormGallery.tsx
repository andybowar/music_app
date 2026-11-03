'use client';

// reason: the gallery swaps in a recording router so SongForm's `router.replace` after a create
// (to `/songs/<id>/edit`) stays on the gallery. Next exposes no public way to provide one.
import {
  AppRouterContext,
  type AppRouterInstance,
} from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { useMemo, useRef, useState, type ReactNode } from 'react';

import {
  SongForm,
  SongFormForbidden,
  SongFormSkeleton,
  type SongFormActions,
} from '@/features/songs/ui/SongForm';
import { branches, thousandHallelujahs, users } from '@/fixtures';
import type { AppUser } from '@/types/domain';

import { createFakeComposerApi } from '../form-basic/fakeComposerApi';
import { createFakeResourceApi, placeholderMediaUrl } from '../form-resources/fakeResourceApi';
import { createFakeThemeApi } from '../form-themes/fakeThemeApi';
import { createFakeSongApi, type SaveMode } from './fakeSongApi';

type View = 'new' | 'edit' | 'forbidden' | 'loading';

const VIEWS: ReadonlyArray<[View, string]> = [
  ['new', 'New song'],
  ['edit', 'Edit “1000 Hallelujahs”'],
  ['forbidden', 'Forbidden (member)'],
  ['loading', 'Loading'],
];

const MODES: ReadonlyArray<[SaveMode, string]> = [
  ['success', 'Saves succeed'],
  ['field-errors', 'Server field errors'],
  ['partial', 'Partial create (keys fail once)'],
];

const contributor = users.find((u) => u.role === 'contributor' && !u.disabledAt) as AppUser;

/** A router that records navigations instead of leaving the gallery. */
function RecordingRouter({
  onNavigate,
  children,
}: {
  onNavigate(entry: string): void;
  children: ReactNode;
}) {
  const router = useMemo<AppRouterInstance>(
    () => ({
      back: () => onNavigate('back()'),
      forward: () => onNavigate('forward()'),
      refresh: () => onNavigate('refresh()'),
      hmrRefresh: () => onNavigate('hmrRefresh()'),
      push: (href) => onNavigate(`push(${href})`),
      replace: (href) => onNavigate(`replace(${href})`),
      prefetch: () => {},
    }),
    [onNavigate],
  );
  return <AppRouterContext.Provider value={router}>{children}</AppRouterContext.Provider>;
}

/**
 * Body of `/dev/song-form`: SongForm (LIB-17) new and edit, with fake actions. Composer, theme and
 * resource fakes come from the form-* galleries. Navigations (after a create, or `refresh()` after
 * a save) are listed below the form instead of leaving the page. File uploads use the real
 * `PUT`, so they fail here; links work.
 */
export function SongFormGallery() {
  const [view, setView] = useState<View>('new');
  const [mode, setMode] = useState<SaveMode>('success');
  const [run, setRun] = useState(0);
  const [log, setLog] = useState<string[]>([]);
  const modeRef = useRef(mode);
  modeRef.current = mode;

  const key = `${view}-${run}`;
  const actions = useMemo<SongFormActions>(
    () => ({
      ...createFakeSongApi({ mode: () => modeRef.current }),
      ...createFakeComposerApi(),
      ...createFakeThemeApi(),
      ...createFakeResourceApi({
        seed: thousandHallelujahs.resources,
        mediaUrl: placeholderMediaUrl,
      }),
    }),
    // reason: `key` only forces a fresh store when the view changes or the gallery is reset.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );
  const onNavigate = useMemo(() => (entry: string) => setLog((l) => [...l, entry]), []);

  return (
    <div className="flex flex-col gap-4">
      <header className="mx-auto flex w-full max-w-4xl flex-col gap-3 px-4 pt-4">
        <h1 className="text-sm font-medium text-muted-foreground">
          LIB-17 · SongForm with fake actions
        </h1>
        <div className="flex flex-wrap items-end gap-4 text-sm">
          <label className="flex flex-col gap-1">
            State
            <select
              className="min-h-tap rounded-md border bg-background px-2"
              value={view}
              onChange={(e) => {
                setView(e.target.value as View);
                setLog([]);
              }}
            >
              {VIEWS.map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            Save behaviour
            <select
              className="min-h-tap rounded-md border bg-background px-2"
              value={mode}
              onChange={(e) => setMode(e.target.value as SaveMode)}
            >
              {MODES.map(([m, label]) => (
                <option key={m} value={m}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="min-h-tap rounded-md border px-3"
            onClick={() => {
              setRun((n) => n + 1);
              setLog([]);
            }}
          >
            Reset form
          </button>
        </div>
      </header>

      <RecordingRouter onNavigate={onNavigate}>
        {view === 'loading' ? (
          <SongFormSkeleton />
        ) : view === 'forbidden' ? (
          <SongFormForbidden />
        ) : (
          <SongForm
            key={key}
            song={view === 'edit' ? thousandHallelujahs : null}
            user={contributor}
            branches={branches}
            actions={actions}
          />
        )}
      </RecordingRouter>

      <section aria-labelledby="nav-log" className="mx-auto w-full max-w-4xl px-4 pb-6 text-sm">
        <h2 id="nav-log" className="font-medium">
          Navigation log
        </h2>
        {log.length === 0 ? (
          <p className="text-muted-foreground">No navigations yet.</p>
        ) : (
          <ol data-testid="nav-log" className="list-decimal pl-5 font-mono text-xs">
            {log.map((entry, i) => (
              <li key={i}>{entry}</li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
