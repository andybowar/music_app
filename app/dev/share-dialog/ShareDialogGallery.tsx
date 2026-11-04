'use client';

import { useMemo, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Toaster } from '@/components/ui/sonner';
import {
  ShareActionsProvider,
  ShareDialog,
  type ShareActions,
} from '@/features/sharing/ui/ShareDialog';
import { LIST_IDS, getList } from '@/fixtures';
import type { ActionResult, Share } from '@/types/domain';

type Scenario = 'success' | 'empty' | 'slow' | 'loadError' | 'forbidden' | 'rateLimited';

const SCENARIOS: Array<{ id: Scenario; label: string }> = [
  { id: 'success', label: 'Has links (active, expiring, expired, revoked)' },
  { id: 'empty', label: 'No links yet' },
  { id: 'slow', label: 'Everything takes 2s (loading states)' },
  { id: 'loadError', label: 'Links fail to load (error state)' },
  { id: 'forbidden', label: 'Creating and revoking are forbidden' },
  { id: 'rateLimited', label: 'Email is rate limited' },
];

const setlist = getList(LIST_IDS.bg41926);
const DAY = 86_400_000;

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** A display-only token prefix; the gallery never makes real tokens. */
function prefix(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function seedShares(): Share[] {
  const now = Date.now();
  const at = (offset: number) => new Date(now + offset).toISOString();
  const base = { listId: setlist.id, revokedAt: null };
  return [
    { ...base, id: 's1', tokenPrefix: 'q7Kd2X', expiresAt: null, createdAt: at(-2 * DAY) },
    { ...base, id: 's2', tokenPrefix: 'Mn40aZ', expiresAt: at(5 * DAY), createdAt: at(-2 * DAY) },
    { ...base, id: 's3', tokenPrefix: 'p_9LwE', expiresAt: at(-DAY), createdAt: at(-8 * DAY) },
    {
      ...base,
      id: 's4',
      tokenPrefix: 'Rt-1bQ',
      expiresAt: null,
      revokedAt: at(-3 * DAY),
      createdAt: at(-10 * DAY),
    },
  ];
}

const FORBIDDEN = {
  ok: false as const,
  error: { code: 'FORBIDDEN' as const, message: 'Only the owner or a music leader can share.' },
};

/** Fake sharing actions over an in-memory list of shares; mirror the SHR-01/03/05 contract. */
function useFakeActions(scenario: Scenario, store: { current: Share[] }): ShareActions {
  return useMemo(() => {
    const delay = () => wait(scenario === 'slow' ? 2000 : 300);
    const actions = {
      listShares: async (): Promise<ActionResult<Share[]>> => {
        await delay();
        if (scenario === 'loadError') {
          return { ok: false, error: { code: 'INTERNAL', message: "Couldn't load the links." } };
        }
        return { ok: true, data: [...store.current] };
      },
      createShare: async (_listId: string, options?: { expiresAt?: string | null }) => {
        await delay();
        if (scenario === 'forbidden') return FORBIDDEN;
        const tokenPrefix = prefix();
        const share: Share = {
          id: crypto.randomUUID(),
          listId: setlist.id,
          tokenPrefix,
          expiresAt: options?.expiresAt ?? null,
          revokedAt: null,
          createdAt: new Date().toISOString(),
        };
        store.current = [share, ...store.current];
        const url = `${window.location.origin}/share/${tokenPrefix}${'x'.repeat(37)}`;
        return { ok: true as const, data: { ...share, url } };
      },
      revokeShare: async (id: string) => {
        await delay();
        if (scenario === 'forbidden') return FORBIDDEN;
        store.current = store.current.map((s) =>
          s.id === id ? { ...s, revokedAt: new Date().toISOString() } : s,
        );
        return { ok: true as const, data: undefined };
      },
      sendShareEmail: async () => {
        await delay();
        if (scenario === 'rateLimited') {
          return {
            ok: false as const,
            error: {
              code: 'RATE_LIMITED' as const,
              message: 'You have sent a lot of share emails in the last hour. Try again later.',
            },
          };
        }
        await actions.createShare(setlist.id, {});
        return { ok: true as const, data: undefined };
      },
    };
    // reason: the fakes match the real actions' results but not their exact generic types.
    return actions as unknown as ShareActions;
  }, [scenario, store]);
}

export function ShareDialogGallery() {
  const [scenario, setScenario] = useState<Scenario>('success');
  const [open, setOpen] = useState(false);
  const store = useRef<Share[]>(seedShares());
  const actions = useFakeActions(scenario, store);

  function pick(next: Scenario) {
    store.current = next === 'empty' ? [] : seedShares();
    setScenario(next);
  }

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">ShareDialog</h1>
        <p className="text-sm text-muted-foreground">
          SHR-04 · fixtures only. Pick how the fake actions respond, then open the dialog for “
          {setlist.name}”.
        </p>
      </header>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Action responses</legend>
        {SCENARIOS.map((s) => (
          <label key={s.id} className="flex min-h-tap items-center gap-2 text-sm">
            <input
              type="radio"
              name="scenario"
              value={s.id}
              checked={scenario === s.id}
              onChange={() => pick(s.id)}
            />
            {s.label}
          </label>
        ))}
      </fieldset>

      <Button className="h-tap" onClick={() => setOpen(true)}>
        Share “{setlist.name}”
      </Button>

      <ShareActionsProvider actions={actions}>
        <ShareDialog list={setlist} open={open} onOpenChange={setOpen} />
      </ShareActionsProvider>
      <Toaster />
    </main>
  );
}
