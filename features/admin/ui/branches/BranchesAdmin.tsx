'use client';

import { PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { AdminBranch, BranchInput, BranchReferences } from '@/features/admin/server';
import type { ActionResult, UUID } from '@/types/domain';

import { BranchFormDialog, DeleteBranchDialog } from './BranchDialogs';

export interface BranchesAdminProps {
  branches: AdminBranch[];
  onSave(input: BranchInput): Promise<ActionResult<AdminBranch>>;
  onDelete(id: UUID): Promise<ActionResult<void>>;
}

const REFERENCE_LABELS: ReadonlyArray<[keyof BranchReferences, string, string]> = [
  ['users', 'user', 'users'],
  ['songs', 'song', 'songs'],
  ['lists', 'list', 'lists'],
  ['usage', 'usage entry', 'usage entries'],
];

/** "3 users, 1 song", or null when nothing refers to the branch. */
export function describeReferences(refs: BranchReferences): string | null {
  const parts = REFERENCE_LABELS.filter(([key]) => refs[key] > 0).map(
    ([key, one, many]) => `${refs[key]} ${refs[key] === 1 ? one : many}`,
  );
  return parts.length ? parts.join(', ') : null;
}

const byName = (a: AdminBranch, b: AdminBranch) => a.name.localeCompare(b.name);

/** Admin › Branches (ADM-02): list, add, edit and delete branches. */
export function BranchesAdmin({ branches: initial, onSave, onDelete }: BranchesAdminProps) {
  const [branches, setBranches] = useState(initial);
  /** `null` = closed, `'new'` = adding, otherwise the branch being edited. */
  const [editing, setEditing] = useState<AdminBranch | 'new' | null>(null);
  const [deleting, setDeleting] = useState<AdminBranch | null>(null);

  async function save(input: BranchInput) {
    const result = await onSave(input);
    if (result.ok) {
      const saved = result.data;
      setBranches((list) => [...list.filter((b) => b.id !== saved.id), saved].sort(byName));
      toast.success(input.id ? `${saved.name} updated` : `${saved.name} added`);
    }
    return result;
  }

  async function remove(branch: AdminBranch) {
    const result = await onDelete(branch.id);
    if (!result.ok) {
      toast.error(result.error.message);
      return false;
    }
    setBranches((list) => list.filter((b) => b.id !== branch.id));
    toast.success(`${branch.name} deleted`);
    return true;
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 flex-1 basis-64 text-sm text-muted-foreground">
          A branch can only be deleted when no users, songs, lists or usage entries refer to it.
        </p>
        <Button onClick={() => setEditing('new')}>
          <PlusIcon aria-hidden />
          Add branch
        </Button>
      </div>

      {branches.length === 0 ? (
        <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          No branches yet. Add one to get started.
        </p>
      ) : (
        <ul className="divide-y rounded-md border">
          {branches.map((b) => (
            <BranchRow
              key={b.id}
              branch={b}
              onEdit={() => setEditing(b)}
              onDelete={() => setDeleting(b)}
            />
          ))}
        </ul>
      )}

      <BranchFormDialog
        key={editing === null ? 'closed' : editing === 'new' ? 'new' : editing.id}
        open={editing !== null}
        branch={editing === 'new' ? null : editing}
        onOpenChange={(open) => (open ? undefined : setEditing(null))}
        onSave={save}
      />
      <DeleteBranchDialog
        branch={deleting}
        onOpenChange={(open) => (open ? undefined : setDeleting(null))}
        onConfirm={remove}
      />
    </div>
  );
}

function BranchRow({
  branch,
  onEdit,
  onDelete,
}: {
  branch: AdminBranch;
  onEdit(): void;
  onDelete(): void;
}) {
  const usedBy = describeReferences(branch.references);
  const usageId = `branch-${branch.id}-usage`;
  return (
    <li className="grid gap-3 p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div className="grid min-w-0 gap-1">
        <div className="flex min-w-0 items-center gap-2">
          <Badge variant="outline" className="font-mono">
            {branch.code}
          </Badge>
          <p className="truncate font-medium">{branch.name}</p>
        </div>
        <dl className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <div className="flex min-w-0 gap-1">
            <dt className="shrink-0">SSO group:</dt>
            <dd className="truncate">{branch.ssoGroup ?? 'None'}</dd>
          </div>
          <div className="flex gap-1">
            <dt className="shrink-0">Used by:</dt>
            <dd id={usageId}>{usedBy ?? 'Nothing yet'}</dd>
          </div>
        </dl>
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={onEdit} aria-label={`Edit ${branch.name}`}>
          <PencilIcon aria-hidden />
          Edit
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={usedBy !== null}
          title={usedBy ? "In use, so it can't be deleted" : undefined}
          aria-describedby={usedBy ? usageId : undefined}
          onClick={onDelete}
          aria-label={`Delete ${branch.name}`}
        >
          <Trash2Icon aria-hidden />
          Delete
        </Button>
      </div>
    </li>
  );
}
