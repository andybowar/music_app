'use client';

import { useState } from 'react';

import AdminUsersError from '@/app/(app)/admin/users/error';
import AdminUsersLoading from '@/app/(app)/admin/users/loading';
import { Toaster } from '@/components/ui/sonner';
import type { AdminUser, BranchOption } from '@/features/admin/server';
import { UsersAdmin, type UsersAdminProps } from '@/features/admin/ui/users/UsersAdmin';
import { branches as fixtureBranches, users as fixtureUsers } from '@/fixtures';
import type { ActionResult } from '@/types/domain';

const FAKE_LATENCY_MS = 400;

const branches: BranchOption[] = fixtureBranches.map(({ id, name, code }) => ({ id, name, code }));
const branchName = new Map(branches.map((b) => [b.id, b.name]));

/**
 * Fixture users as `AdminUser` rows. The fixtures already cover approved, disabled (Riley
 * Brooks), pending (Casey Morgan) and rejected (Devon Reyes) accounts; one more pending SSO
 * request shows a branch suggested by the IdP.
 */
export const galleryUsers: AdminUser[] = [
  ...fixtureUsers.map((u, i) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    branchId: u.branchId,
    branchName: u.branchId ? (branchName.get(u.branchId) ?? null) : null,
    role: u.role,
    authProvider: u.authProvider,
    accessStatus: u.accessStatus,
    disabledAt: u.disabledAt,
    createdAt: `2026-10-${String(10 + i).padStart(2, '0')}T15:00:00.000Z`,
  })),
  {
    id: '20000000-0000-4000-8000-000000000099',
    email: 'alex.kim@example.com',
    name: 'Alex Kim',
    branchId: branches[1]?.id ?? null,
    branchName: branches[1]?.name ?? null,
    role: 'member',
    authProvider: 'google',
    accessStatus: 'pending',
    disabledAt: null,
    createdAt: '2026-10-31T15:00:00.000Z',
  },
];

const currentUser = galleryUsers.find((u) => u.role === 'admin') ?? galleryUsers[0]!;

type View = 'all' | 'pending-only' | 'empty' | 'loading' | 'error';

const VIEW_LABEL: Record<View, string> = {
  all: 'All states',
  'pending-only': 'Only access requests',
  empty: 'No users',
  loading: 'Loading (route skeleton)',
  error: 'Error (route boundary)',
};

function usersFor(view: View): AdminUser[] {
  if (view === 'empty') return [];
  if (view === 'pending-only') return galleryUsers.filter((u) => u.accessStatus === 'pending');
  return galleryUsers;
}

const wait = () => new Promise((resolve) => setTimeout(resolve, FAKE_LATENCY_MS));

/**
 * Body of `/dev/admin-users`: ADM-01's UsersAdmin on fixture users and branches, with stubbed
 * invite, update, approve and reject actions that log their calls (and can be made to fail).
 */
export function AdminUsersGallery() {
  const [view, setView] = useState<View>('all');
  const [fail, setFail] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const record = (entry: string) => setLog((l) => [entry, ...l].slice(0, 8));

  const result = async <T,>(entry: string, data: T): Promise<ActionResult<T>> => {
    await wait();
    record(entry);
    return fail
      ? { ok: false, error: { code: 'CONFLICT', message: 'Simulated failure.' } }
      : { ok: true, data };
  };

  const actions: Pick<UsersAdminProps, 'onInvite' | 'onUpdate' | 'onApprove' | 'onReject'> = {
    onInvite: (input) =>
      result(`onInvite(${input.email}, ${input.role})`, {
        id: crypto.randomUUID(),
        email: input.email,
        name: input.name,
        branchId: input.branchId,
        branchName: input.branchId ? (branchName.get(input.branchId) ?? null) : null,
        role: input.role,
        authProvider: 'password',
        accessStatus: 'approved',
        disabledAt: null,
        createdAt: new Date().toISOString(),
      }),
    onUpdate: (id, patch) =>
      result(`onUpdate(${id.slice(-4)}, ${JSON.stringify(patch)})`, undefined),
    onApprove: (id, input) =>
      result(`onApprove(${id.slice(-4)}, ${JSON.stringify(input)})`, undefined),
    onReject: (id) => result(`onReject(${id.slice(-4)})`, undefined),
  };

  return (
    <main className="flex flex-col gap-2">
      <header className="mx-auto flex w-full max-w-5xl flex-col gap-3 px-4 pt-4">
        <h1 className="text-lg font-semibold">Admin › Users</h1>
        <p className="text-sm text-muted-foreground">
          ADM-01 · fixture users with stubbed actions. Signed in as {currentUser.name}.
        </p>
        <div className="flex flex-wrap items-end gap-4 text-sm">
          <label className="flex max-w-full min-w-0 flex-col gap-1">
            State
            <select
              className="min-h-tap max-w-full rounded-md border bg-background px-2"
              value={view}
              onChange={(e) => setView(e.target.value as View)}
            >
              {Object.entries(VIEW_LABEL).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-h-tap items-center gap-2">
            <input type="checkbox" checked={fail} onChange={(e) => setFail(e.target.checked)} />
            Actions fail
          </label>
        </div>
      </header>

      {view === 'loading' && <AdminUsersLoading />}
      {view === 'error' && (
        <AdminUsersError error={new Error('Simulated')} reset={() => setView('all')} />
      )}
      {view !== 'loading' && view !== 'error' && (
        <div className="mx-auto grid w-full max-w-5xl gap-4 px-4 py-2">
          <UsersAdmin
            key={view}
            users={usersFor(view)}
            branches={branches}
            currentUserId={currentUser.id}
            {...actions}
          />
        </div>
      )}

      <section className="mx-auto grid w-full max-w-5xl gap-2 px-4 pb-6">
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
