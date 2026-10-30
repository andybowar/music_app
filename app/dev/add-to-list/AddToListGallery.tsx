'use client';

import { useState } from 'react';

import { Toaster } from '@/components/ui/sonner';
import { AddToListMenu, listLabel } from '@/features/lists/ui/AddToListMenu';
import { LIST_IDS, getList, lists as fixtureLists, songSummaries, users } from '@/fixtures';
import type { ActionResult, List, UUID } from '@/types/domain';
import type { ListInput } from '@/types/validation';

type Scenario = 'success' | 'slow' | 'forbidden' | 'throws';

const SCENARIOS: Array<{ id: Scenario; label: string }> = [
  { id: 'success', label: 'Succeeds' },
  { id: 'slow', label: 'Succeeds after 2s (loading state)' },
  { id: 'forbidden', label: 'Server rejects: forbidden' },
  { id: 'throws', label: 'Action throws' },
];

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface FakeItem {
  id: UUID;
  listId: UUID;
  songId: UUID;
}

export function AddToListGallery() {
  const [scenario, setScenario] = useState<Scenario>('success');
  const [hasCurrent, setHasCurrent] = useState(true);
  const [noLists, setNoLists] = useState(false);
  const [current, setCurrent] = useState<List>(() => getList(LIST_IDS.bg41926));
  const [created, setCreated] = useState<List[]>([]);
  const [items, setItems] = useState<FakeItem[]>([]);

  const allLists = noLists ? created : [...created, ...fixtureLists];
  const rows = songSummaries.slice(0, 3);

  const fakeAdd = async (listId: UUID, songId: UUID): Promise<ActionResult<unknown>> => {
    await wait(scenario === 'slow' ? 2000 : 300);
    if (scenario === 'forbidden') {
      return {
        ok: false,
        error: { code: 'FORBIDDEN', message: 'You can’t edit this list.' },
      };
    }
    if (scenario === 'throws') throw new Error('network down');
    const item: FakeItem = { id: crypto.randomUUID(), listId, songId };
    setItems((prev) => [...prev, item]);
    return { ok: true, data: item };
  };

  const fakeUndo = async (_listId: UUID, added: unknown): Promise<ActionResult<unknown>> => {
    await wait(300);
    const id = (added as FakeItem).id;
    setItems((prev) => prev.filter((i) => i.id !== id));
    return { ok: true, data: undefined };
  };

  const fakeCreate = async (input: ListInput): Promise<ActionResult<List>> => {
    await wait(300);
    const owner = users[0];
    if (!owner) throw new Error('fixtures missing');
    const now = new Date().toISOString();
    const list: List = {
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
    };
    setCreated((prev) => [list, ...prev]);
    // Mirrors LIST-09's wrapper: a new list becomes the current list.
    setCurrent(list);
    setHasCurrent(true);
    return { ok: true, data: list };
  };

  const nameOf = (listId: UUID) => {
    const l = allLists.find((x) => x.id === listId);
    return l ? listLabel(l) : listId;
  };

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">AddToListMenu</h1>
        <p className="text-sm text-muted-foreground">
          LIST-06 · fixtures only. The ADD button on each row opens Current / Existing / New.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <fieldset className="space-y-1">
          <legend className="text-sm font-medium">Add response</legend>
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
        <fieldset className="space-y-1">
          <legend className="text-sm font-medium">State</legend>
          <label className="flex min-h-tap items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={hasCurrent}
              onChange={(e) => setHasCurrent(e.target.checked)}
            />
            Current list set ({listLabel(current)})
          </label>
          <label className="flex min-h-tap items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={noLists}
              onChange={(e) => setNoLists(e.target.checked)}
            />
            No existing lists (empty state)
          </label>
        </fieldset>
      </div>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Song rows</h2>
        <ul className="divide-y divide-white/10 overflow-hidden rounded-md bg-row text-row-foreground">
          {rows.map((song) => (
            <li key={song.id} className="flex items-center gap-2 px-3 py-2">
              <span className="min-w-0 flex-1 truncate text-base font-semibold">{song.title}</span>
              <AddToListMenu
                songId={song.id}
                songTitle={song.title}
                current={hasCurrent ? current : null}
                lists={allLists}
                onAdd={(listId) => fakeAdd(listId, song.id)}
                onCreate={fakeCreate}
                onUndo={fakeUndo}
              />
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Added this session</h2>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing yet.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {items.map((i) => (
              <li key={i.id}>
                {rows.find((s) => s.id === i.songId)?.title ?? i.songId} → {nameOf(i.listId)}
              </li>
            ))}
          </ul>
        )}
      </section>
      <Toaster />
    </main>
  );
}
