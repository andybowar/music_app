'use client';

import { useState } from 'react';

import { Toaster } from '@/components/ui/sonner';
import type { ListScope } from '@/features/lists/server/lists';
import { ListIndex, type ListIndexProps } from '@/features/lists/ui/ListIndex';
import { getList, LIST_IDS, users } from '@/fixtures';
import type { ActionResult, List } from '@/types/domain';
import type { ListInput } from '@/types/validation';

/** The gallery's "today": AG 4/25/26 is upcoming, BG 4/19/26 is past. */
export const GALLERY_TODAY = '2026-04-20';

const bg = getList(LIST_IDS.bg41926);
const ag = getList(LIST_IDS.ag42526);
const playlist = getList(LIST_IDS.background1);
const leader = users.find((u) => u.role === 'music_leader')!;
const contributor = users.find((u) => u.role === 'contributor')!;

/** A setlist with no event date yet. */
const undated: List = {
  ...bg,
  id: '80000000-0000-4000-8000-0000000000a1',
  name: 'Ideas for Pentecost',
  eventDate: null,
  itemCount: 1,
};

/** Another branch's setlist (only under "All branches"). */
const otherBranch: List = {
  ...ag,
  id: '80000000-0000-4000-8000-0000000000a2',
  name: 'CS 5/3/26',
  eventDate: '2026-05-03',
  ownerId: contributor.id,
  ownerName: contributor.name,
  branchId: contributor.branchId,
  branchCode: 'CS',
  itemCount: 5,
};

/** In `listLists` order: upcoming soonest first, then past latest first, then undated. */
const SETLISTS: Record<ListScope, List[]> = {
  mine: [ag, bg, undated],
  branch: [ag, bg, undated],
  all: [ag, otherBranch, bg, undated],
};

type View =
  | 'setlist-mine'
  | 'setlist-branch'
  | 'setlist-all'
  | 'playlist'
  | 'loading'
  | 'error'
  | 'empty-mine'
  | 'empty-branch'
  | 'empty-all'
  | 'empty-playlist';

type Base = Pick<ListIndexProps, 'type' | 'scope' | 'lists' | 'loading' | 'error'>;

export const VIEWS: Record<View, { label: string; props: Base }> = {
  'setlist-mine': {
    label: 'Setlists · Mine',
    props: { type: 'setlist', scope: 'mine', lists: SETLISTS.mine },
  },
  'setlist-branch': {
    label: 'Setlists · My branch',
    props: { type: 'setlist', scope: 'branch', lists: SETLISTS.branch },
  },
  'setlist-all': {
    label: 'Setlists · All branches',
    props: { type: 'setlist', scope: 'all', lists: SETLISTS.all },
  },
  playlist: {
    label: 'Playlists (no tabs)',
    props: { type: 'playlist', scope: 'mine', lists: [playlist] },
  },
  loading: {
    label: 'Loading skeleton',
    props: { type: 'setlist', scope: 'branch', lists: [], loading: true },
  },
  error: {
    label: 'Error with retry',
    props: { type: 'setlist', scope: 'branch', lists: [], error: 'Please try again.' },
  },
  'empty-mine': {
    label: 'Empty · Mine',
    props: { type: 'setlist', scope: 'mine', lists: [] },
  },
  'empty-branch': {
    label: 'Empty · My branch',
    props: { type: 'setlist', scope: 'branch', lists: [] },
  },
  'empty-all': {
    label: 'Empty · All branches',
    props: { type: 'setlist', scope: 'all', lists: [] },
  },
  'empty-playlist': {
    label: 'Empty · Playlists',
    props: { type: 'playlist', scope: 'mine', lists: [] },
  },
};

type Outcome = 'ok' | 'fails';

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Body of `/dev/list-index`: Open setlist / Open playlist (LIST-08) with fixture lists and fake
 * `onSetCurrent` / `onCreate`. Scope tabs and list names are real links into the app; pick the
 * scope here instead. A created list "opens" by navigating to `/lists/<id>`, which 404s for a
 * fake id.
 */
export function ListIndexGallery() {
  const [view, setView] = useState<View>('setlist-branch');
  const [setCurrentOutcome, setSetCurrentOutcome] = useState<Outcome>('ok');
  const [currentListId, setCurrentListId] = useState<string | null>(ag.id);
  const [log, setLog] = useState<string[]>([]);
  const record = (entry: string) => setLog((l) => [entry, ...l].slice(0, 8));

  const handlers = {
    async onSetCurrent(list: List): Promise<ActionResult<null>> {
      await wait(400);
      record(`onSetCurrent(${list.name}) → ${setCurrentOutcome}`);
      if (setCurrentOutcome === 'fails') {
        return { ok: false, error: { code: 'INTERNAL', message: 'Simulated failure.' } };
      }
      return { ok: true, data: null };
    },
    async onCreate(input: ListInput): Promise<ActionResult<List>> {
      await wait(400);
      record(`onCreate(${input.type} · ${input.name})`);
      const now = new Date().toISOString();
      return {
        ok: true,
        data: {
          ...bg,
          id: crypto.randomUUID(),
          type: input.type,
          name: input.name,
          eventDate: input.eventDate,
          ownerId: leader.id,
          ownerName: leader.name,
          itemCount: 0,
          createdAt: now,
          updatedAt: now,
        },
      };
    },
  };

  return (
    <main className="mx-auto grid max-w-3xl gap-6 p-4">
      <header className="grid gap-3">
        <p className="text-sm font-medium text-muted-foreground">
          LIST-08 · Open setlist / Open playlist with fixture lists. Today is {GALLERY_TODAY}.
        </p>
        <div className="flex flex-wrap gap-4">
          <label className="flex flex-col gap-1 text-sm">
            State
            <select
              className="min-h-tap rounded-md border bg-background px-2"
              value={view}
              onChange={(e) => setView(e.target.value as View)}
            >
              {Object.entries(VIEWS).map(([id, v]) => (
                <option key={id} value={id}>
                  {v.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            “Set as current”
            <select
              className="min-h-tap rounded-md border bg-background px-2"
              value={setCurrentOutcome}
              onChange={(e) => setSetCurrentOutcome(e.target.value as Outcome)}
            >
              <option value="ok">Succeeds</option>
              <option value="fails">Fails (rolls back)</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Current list
            <select
              className="min-h-tap rounded-md border bg-background px-2"
              value={currentListId ?? ''}
              onChange={(e) => setCurrentListId(e.target.value || null)}
            >
              <option value="">None</option>
              {[ag, bg, undated, otherBranch, playlist].map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      <ListIndex
        key={`${view}:${currentListId ?? ''}`}
        {...VIEWS[view].props}
        today={GALLERY_TODAY}
        currentListId={currentListId}
        onSetCurrent={handlers.onSetCurrent}
        onCreate={handlers.onCreate}
      />

      <section className="grid gap-2" aria-label="Action log">
        <h2 className="text-sm font-medium text-muted-foreground">Action log</h2>
        {log.length === 0 ? (
          <p className="text-sm text-muted-foreground">No actions yet.</p>
        ) : (
          <ul className="grid gap-1 text-sm" data-testid="action-log">
            {log.map((entry, i) => (
              <li key={i}>{entry}</li>
            ))}
          </ul>
        )}
      </section>
      <Toaster />
    </main>
  );
}
