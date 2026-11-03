'use client';

import { useState } from 'react';

import { Toaster } from '@/components/ui/sonner';
import { sampleActivity } from '@/features/branches/ui/activityFixtures';
import { BranchesView, type BranchAddToListActions } from '@/features/branches/ui/BranchesView';
import { BRANCH_IDS, LIST_IDS, getList, getSong, lists, users } from '@/fixtures';
import type { ActionResult, List, ListItem, SongDetail, UUID } from '@/types/domain';

import BranchesLoading from '../../(app)/branches/loading';

type Scenario = 'loaded' | 'own-only' | 'error' | 'loading';

const SCENARIOS: Array<{ id: Scenario; label: string }> = [
  { id: 'loaded', label: 'Loaded (viewer in Servant)' },
  { id: 'own-only', label: 'No other branches' },
  { id: 'error', label: 'Activity failed' },
  { id: 'loading', label: 'Loading skeleton' },
];

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const ok = <T,>(data: T): ActionResult<T> => ({ ok: true, data });

const actions: BranchAddToListActions = {
  async addListItem(listId: UUID, songId: UUID) {
    await wait(300);
    const item: ListItem = {
      id: crypto.randomUUID(),
      listId,
      songId,
      position: 0,
      overrideKey: null,
      overrideBpm: null,
      overrideEnergy: null,
      resourceId: null,
      notes: null,
    };
    return ok(item);
  },
  async createList(input) {
    await wait(300);
    const owner = users[0]!;
    const now = new Date().toISOString();
    return ok<List>({
      ...getList(LIST_IDS.bg41926),
      id: crypto.randomUUID(),
      type: input.type,
      name: input.name,
      eventDate: input.eventDate,
      ownerId: owner.id,
      ownerName: owner.name,
      itemCount: 0,
      createdAt: now,
      updatedAt: now,
    });
  },
  async removeListItem() {
    await wait(300);
    return ok(undefined);
  },
};

async function loadSong(id: UUID): Promise<ActionResult<SongDetail>> {
  await wait(400);
  return ok(getSong(id));
}

async function getSignedResourceUrl(): Promise<ActionResult<{ url: string; expiresAt: string }>> {
  await wait(300);
  return { ok: false, error: { code: 'NOT_FOUND', message: 'No files in the dev gallery.' } };
}

export function BranchesGallery() {
  const [scenario, setScenario] = useState<Scenario>('loaded');
  const all = sampleActivity();
  const activity =
    scenario === 'error'
      ? null
      : scenario === 'own-only'
        ? all.filter((a) => a.branch.id === BRANCH_IDS.servant)
        : all;

  return (
    <main className="space-y-4 py-4">
      <header className="mx-auto max-w-5xl space-y-1 px-3 sm:px-4">
        <h1 className="text-2xl font-semibold">Other branches</h1>
        <p className="text-sm text-muted-foreground">
          BR-02 · fixtures only. Rows open their panels; ADD opens the Add-to-List menu.
        </p>
        <fieldset className="flex flex-wrap gap-x-4">
          <legend className="sr-only">Scenario</legend>
          {SCENARIOS.map((s) => (
            <label key={s.id} className="flex min-h-tap items-center gap-2 text-sm">
              <input
                type="radio"
                name="scenario"
                value={s.id}
                checked={scenario === s.id}
                onChange={() => setScenario(s.id)}
              />
              {s.label}
            </label>
          ))}
        </fieldset>
      </header>

      {scenario === 'loading' ? (
        <BranchesLoading />
      ) : (
        <BranchesView
          activity={activity}
          error={
            scenario === 'error' ? 'Branch activity couldn’t be loaded. Please try again.' : null
          }
          ownBranchId={BRANCH_IDS.servant}
          lists={lists}
          currentList={null}
          actions={actions}
          loadSong={loadSong}
          getSignedResourceUrl={getSignedResourceUrl}
        />
      )}
      <Toaster />
    </main>
  );
}
