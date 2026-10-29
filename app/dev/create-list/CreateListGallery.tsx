'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Toaster } from '@/components/ui/sonner';
import { CreateListDialog } from '@/features/lists/ui/CreateListDialog';
import { lists, users } from '@/fixtures';
import type { ActionResult, List, ListType } from '@/types/domain';
import type { ListInput } from '@/types/validation';

type Scenario = 'success' | 'slow' | 'fieldErrors' | 'forbidden' | 'throws';

const SCENARIOS: Array<{ id: Scenario; label: string }> = [
  { id: 'success', label: 'Succeeds' },
  { id: 'slow', label: 'Succeeds after 2s (loading state)' },
  { id: 'fieldErrors', label: 'Server rejects with field errors' },
  { id: 'forbidden', label: 'Server rejects: forbidden' },
  { id: 'throws', label: 'Action throws' },
];

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Fake `createList` built from fixtures; mirrors the LIST-01 contract. */
async function fakeCreateList(scenario: Scenario, input: ListInput): Promise<ActionResult<List>> {
  await wait(scenario === 'slow' ? 2000 : 300);
  switch (scenario) {
    case 'fieldErrors':
      return {
        ok: false,
        error: {
          code: 'VALIDATION',
          message: 'Invalid input.',
          fieldErrors: {
            name: ['A list with this name already exists'],
            eventDate: ['Pick a date in the next year'],
          },
        },
      };
    case 'forbidden':
      return {
        ok: false,
        error: { code: 'FORBIDDEN', message: 'You do not have permission to create lists.' },
      };
    case 'throws':
      throw new Error('network down');
    default: {
      const template = lists[0];
      const owner = users[0];
      if (!template || !owner) throw new Error('fixtures missing');
      const now = new Date().toISOString();
      return {
        ok: true,
        data: {
          ...template,
          id: crypto.randomUUID(),
          type: input.type,
          name: input.name,
          eventDate: input.eventDate,
          ownerId: owner.id,
          ownerName: owner.name,
          itemCount: 0,
          createdAt: now,
          updatedAt: now,
        },
      };
    }
  }
}

export function CreateListGallery() {
  const [scenario, setScenario] = useState<Scenario>('success');
  const [openType, setOpenType] = useState<ListType | null>(null);
  const [created, setCreated] = useState<List[]>([]);

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">CreateListDialog</h1>
        <p className="text-sm text-muted-foreground">
          LIST-05 · fixtures only. Pick how the fake action responds, then open a dialog.
        </p>
      </header>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Action response</legend>
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

      <div className="flex flex-wrap gap-2">
        <Button className="h-tap" onClick={() => setOpenType('setlist')}>
          Create event setlist
        </Button>
        <Button className="h-tap" variant="outline" onClick={() => setOpenType('playlist')}>
          Create listening playlist
        </Button>
      </div>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Created this session</h2>
        {created.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing yet.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {created.map((l) => (
              <li key={l.id}>
                {l.type} · {l.name} · {l.eventDate ?? 'no date'}
              </li>
            ))}
          </ul>
        )}
      </section>

      {(['setlist', 'playlist'] as const).map((type) => (
        <CreateListDialog
          key={type}
          type={type}
          open={openType === type}
          onOpenChange={(open) => setOpenType(open ? type : null)}
          onSubmit={async (input) => {
            const result = await fakeCreateList(scenario, input);
            if (result.ok) setCreated((prev) => [result.data, ...prev]);
            return result;
          }}
        />
      ))}
      <Toaster />
    </main>
  );
}
