'use client';

import { useId, useState, type FormEvent, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import type { AdminBranch, BranchInput } from '@/features/admin/server';
import type { ActionResult } from '@/types/domain';

type FieldErrors = Record<string, string[]>;

function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string[];
  children: ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {hint ? (
        <p id={`${id}-hint`} className="text-sm text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error?.length ? (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {error.join('. ')}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Create (`branch` null) or edit a branch. Mount with a `key` per branch so the form starts from
 * that branch's values. Uniqueness errors from the server show under the matching field.
 */
export function BranchFormDialog({
  open,
  branch,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  branch: AdminBranch | null;
  onOpenChange(open: boolean): void;
  onSave(input: BranchInput): Promise<ActionResult<AdminBranch>>;
}) {
  const id = useId();
  const [form, setForm] = useState({
    name: branch?.name ?? '',
    code: branch?.code ?? '',
    ssoGroup: branch?.ssoGroup ?? '',
  });
  const [pending, setPending] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setPending(true);
    setFormError(null);
    const result = await onSave({
      ...(branch ? { id: branch.id } : {}),
      name: form.name,
      code: form.code,
      ssoGroup: form.ssoGroup.trim() ? form.ssoGroup : null,
    });
    setPending(false);
    if (result.ok) {
      onOpenChange(false);
      return;
    }
    setFieldErrors(result.error.fieldErrors ?? {});
    setFormError(result.error.message);
  };

  /** aria-invalid / aria-describedby for one input (its hint, then its error). */
  const describe = (field: string, hasHint = false) => {
    const invalid = Boolean(fieldErrors[field]?.length);
    const ids = [hasHint ? `${id}-${field}-hint` : null, invalid ? `${id}-${field}-error` : null]
      .filter(Boolean)
      .join(' ');
    return {
      ...(invalid ? { 'aria-invalid': true } : {}),
      ...(ids ? { 'aria-describedby': ids } : {}),
    };
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => (pending && !next ? undefined : onOpenChange(next))}
    >
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto p-4 sm:p-6">
        <DialogHeader className="pr-8 text-left">
          <DialogTitle>{branch ? `Edit ${branch.name}` : 'Add a branch'}</DialogTitle>
          <DialogDescription>
            The code shows on song rows. The SSO group maps people who sign in with SSO to this
            branch.
          </DialogDescription>
        </DialogHeader>
        <form noValidate onSubmit={submit} className="grid gap-4">
          <Field id={`${id}-name`} label="Name" error={fieldErrors.name}>
            <Input
              id={`${id}-name`}
              autoComplete="off"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              {...describe('name')}
            />
          </Field>
          <Field
            id={`${id}-code`}
            label="Code"
            hint="2 or 3 capital letters, like SV."
            error={fieldErrors.code}
          >
            <Input
              id={`${id}-code`}
              autoComplete="off"
              autoCapitalize="characters"
              maxLength={3}
              className="w-24 uppercase"
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
              {...describe('code', true)}
            />
          </Field>
          <Field
            id={`${id}-ssoGroup`}
            label="SSO group (optional)"
            hint="The group name your identity provider sends, like pop-branch-sv."
            error={fieldErrors.ssoGroup}
          >
            <Input
              id={`${id}-ssoGroup`}
              autoComplete="off"
              value={form.ssoGroup}
              onChange={(e) => setForm({ ...form, ssoGroup: e.target.value })}
              {...describe('ssoGroup', true)}
            />
          </Field>
          {formError ? (
            <p role="alert" className="text-sm text-destructive">
              {formError}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? 'Saving…' : branch ? 'Save changes' : 'Add branch'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Confirms deleting an unreferenced branch. */
export function DeleteBranchDialog({
  branch,
  onOpenChange,
  onConfirm,
}: {
  branch: AdminBranch | null;
  onOpenChange(open: boolean): void;
  onConfirm(branch: AdminBranch): Promise<boolean>;
}) {
  const [pending, setPending] = useState(false);

  const confirm = async () => {
    if (!branch) return;
    setPending(true);
    const ok = await onConfirm(branch);
    setPending(false);
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog
      open={branch !== null}
      onOpenChange={(next) => (pending && !next ? undefined : onOpenChange(next))}
    >
      <DialogContent className="p-4 sm:p-6">
        <DialogHeader className="pr-8 text-left">
          <DialogTitle>{branch ? `Delete ${branch.name}?` : 'Delete branch?'}</DialogTitle>
          <DialogDescription>This can&apos;t be undone.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="button" variant="destructive" disabled={pending} onClick={confirm}>
            {pending ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
