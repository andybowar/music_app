'use client';

import { useMemo, useState } from 'react';

import { Toaster } from '@/components/ui/sonner';
import type { AdminBranch, BranchInput, BranchReferences } from '@/features/admin/server';
import { BranchesAdmin } from '@/features/admin/ui/branches/BranchesAdmin';
import { branches as fixtureBranches } from '@/fixtures';
import type { ActionResult, UUID } from '@/types/domain';

type View = 'branches' | 'empty';

const NONE: BranchReferences = { users: 0, songs: 0, lists: 0, usage: 0 };

/** Fixture branches with reference counts: Servant and Portland are in use, the rest are not. */
const REFERENCES: Record<string, BranchReferences> = {
  SV: { users: 3, songs: 1, lists: 2, usage: 12 },
  OR: { users: 1, songs: 0, lists: 0, usage: 0 },
};

export const galleryBranches: AdminBranch[] = fixtureBranches
  .map((b) => ({ ...b, references: REFERENCES[b.code] ?? NONE }))
  .sort((a, b) => a.name.localeCompare(b.name));

const TAKEN = {
  name: 'Another branch already has this name',
  code: 'Another branch already uses this code',
  ssoGroup: 'Another branch is already mapped to this group',
} as const;

const delay = () => new Promise((r) => setTimeout(r, 300));

/**
 * Fake `upsertBranch` / `deleteBranch` over an in-memory list. They mirror the server's
 * rules: name, code and SSO group are unique (CONFLICT with a field error on each clash), the
 * code is upper-cased, and a branch anything refers to can't be deleted.
 */
export function createFakeBranchApi(initial: AdminBranch[]) {
  let rows = initial.map((b) => ({ ...b }));
  let nextId = 100;

  async function onSave(input: BranchInput): Promise<ActionResult<AdminBranch>> {
    await delay();
    const name = input.name.trim();
    const code = input.code.trim().toUpperCase();
    const ssoGroup = input.ssoGroup?.trim() || null;
    const others = rows.filter((b) => b.id !== input.id);
    const fieldErrors: Record<string, string[]> = {};
    if (others.some((b) => b.name.toLowerCase() === name.toLowerCase())) {
      fieldErrors.name = [TAKEN.name];
    }
    if (others.some((b) => b.code === code)) fieldErrors.code = [TAKEN.code];
    if (ssoGroup && others.some((b) => b.ssoGroup === ssoGroup)) {
      fieldErrors.ssoGroup = [TAKEN.ssoGroup];
    }
    if (Object.keys(fieldErrors).length > 0) {
      return {
        ok: false,
        error: {
          code: 'CONFLICT',
          message: 'Another branch already uses some of these values.',
          fieldErrors,
        },
      };
    }

    const existing = input.id ? rows.find((b) => b.id === input.id) : undefined;
    const saved: AdminBranch = {
      id: existing?.id ?? `10000000-0000-4000-8000-${String(nextId++).padStart(12, '0')}`,
      name,
      code,
      ssoGroup,
      references: existing?.references ?? NONE,
    };
    rows = [...others, saved];
    return { ok: true, data: saved };
  }

  async function onDelete(id: UUID): Promise<ActionResult<void>> {
    await delay();
    const row = rows.find((b) => b.id === id);
    if (!row)
      return { ok: false, error: { code: 'NOT_FOUND', message: 'That branch no longer exists.' } };
    const total =
      row.references.users + row.references.songs + row.references.lists + row.references.usage;
    if (total > 0) {
      return {
        ok: false,
        error: { code: 'CONFLICT', message: `${row.name} is in use, so it can't be deleted.` },
      };
    }
    rows = rows.filter((b) => b.id !== id);
    return { ok: true, data: undefined };
  }

  return { onSave, onDelete };
}

/**
 * Body of `/dev/admin-branches`: BranchesAdmin (ADM-02) with fixture branches and stubbed
 * actions. Try deleting Servant (in use) vs. Rockford (unused), or giving a branch the code
 * "SV" to see the uniqueness error.
 */
export function AdminBranchesGallery() {
  const [view, setView] = useState<View>('branches');
  const [run, setRun] = useState(0);
  const initial = view === 'empty' ? [] : galleryBranches;
  const key = `${view}-${run}`;
  // A fresh fake store per state and per reset, so the list and the fake never disagree.
  // reason: `run` only forces a new store; it isn't read inside.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const { onSave, onDelete } = useMemo(() => createFakeBranchApi(initial), [key]);

  return (
    <div className="mx-auto grid max-w-5xl gap-4 px-4 py-6">
      <header className="flex flex-col gap-3">
        <h1 className="text-sm font-medium text-muted-foreground">
          ADM-02 · BranchesAdmin with fixture branches
        </h1>
        <div className="flex flex-wrap items-end gap-4 text-sm">
          <label className="flex flex-col gap-1">
            State
            <select
              className="min-h-tap rounded-md border bg-background px-2"
              value={view}
              onChange={(e) => setView(e.target.value as View)}
            >
              <option value="branches">Branches (in use and unused)</option>
              <option value="empty">Empty</option>
            </select>
          </label>
          <button
            type="button"
            className="min-h-tap rounded-md border px-3"
            onClick={() => setRun((n) => n + 1)}
          >
            Reset data
          </button>
        </div>
        <p className="text-sm text-muted-foreground">
          Servant and Portland are in use, so deleting them fails. Saving a branch with the code
          &ldquo;SV&rdquo; (or another existing name or SSO group) shows the uniqueness error.
        </p>
      </header>
      <h2 className="text-xl font-semibold">Branches</h2>
      <BranchesAdmin key={key} branches={initial} onSave={onSave} onDelete={onDelete} />
      <Toaster />
    </div>
  );
}
