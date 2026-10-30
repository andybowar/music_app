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
import type { AdminUser, BranchOption } from '@/features/admin/server';
import type { ActionResult, Role } from '@/types/domain';

import { BranchSelect, RoleSelect } from './fields';

export interface InviteInput {
  email: string;
  name: string;
  role: Role;
  branchId: string | null;
}

type FieldErrors = Record<string, string[]>;

function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string[];
  children: ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {error?.length ? (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {error.join('. ')}
        </p>
      ) : null}
    </div>
  );
}

/** Shared shell: title, body, a form error and Cancel / submit buttons. */
function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  submitLabel,
  pending,
  formError,
  onSubmit,
  children,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  title: string;
  description: string;
  submitLabel: string;
  pending: boolean;
  formError: string | null;
  onSubmit(): void;
  children: ReactNode;
}) {
  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit();
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => (pending && !next ? undefined : onOpenChange(next))}
    >
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto p-4 sm:p-6">
        <DialogHeader className="pr-8 text-left">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form noValidate onSubmit={handleSubmit} className="grid gap-4">
          {children}
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
              {pending ? 'Saving…' : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function InviteUserDialog({
  open,
  onOpenChange,
  branches,
  onInvite,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  branches: BranchOption[];
  onInvite(input: InviteInput): Promise<ActionResult<AdminUser>>;
}) {
  const id = useId();
  const [form, setForm] = useState<InviteInput>({
    email: '',
    name: '',
    role: 'member',
    branchId: null,
  });
  const [pending, setPending] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  const reset = (next: boolean) => {
    if (!next) {
      setForm({ email: '', name: '', role: 'member', branchId: null });
      setFieldErrors({});
      setFormError(null);
    }
    onOpenChange(next);
  };

  const submit = async () => {
    setPending(true);
    setFormError(null);
    const result = await onInvite(form);
    setPending(false);
    if (result.ok) {
      reset(false);
      return;
    }
    setFieldErrors(result.error.fieldErrors ?? {});
    setFormError(result.error.message);
  };

  const errorProps = (field: string) =>
    fieldErrors[field]?.length
      ? { 'aria-invalid': true, 'aria-describedby': `${id}-${field}-error` }
      : {};

  return (
    <FormDialog
      open={open}
      onOpenChange={reset}
      title="Invite a user"
      description="They get an email with a sign-in link. Invited accounts are approved right away."
      submitLabel="Send invite"
      pending={pending}
      formError={formError}
      onSubmit={submit}
    >
      <Field id={`${id}-email`} label="Email" error={fieldErrors.email}>
        <Input
          id={`${id}-email`}
          type="email"
          autoComplete="off"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          {...errorProps('email')}
        />
      </Field>
      <Field id={`${id}-name`} label="Name" error={fieldErrors.name}>
        <Input
          id={`${id}-name`}
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          {...errorProps('name')}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id={`${id}-role`} label="Role" error={fieldErrors.role}>
          <RoleSelect
            id={`${id}-role`}
            value={form.role}
            onChange={(role) => setForm({ ...form, role })}
          />
        </Field>
        <Field id={`${id}-branch`} label="Branch" error={fieldErrors.branchId}>
          <BranchSelect
            id={`${id}-branch`}
            value={form.branchId}
            branches={branches}
            onChange={(branchId) => setForm({ ...form, branchId })}
            {...errorProps('branchId')}
          />
        </Field>
      </div>
    </FormDialog>
  );
}

/** Mounted with a `key` per user so the role/branch start from that user's suggestion. */
export function ApproveUserDialog({
  user,
  onOpenChange,
  branches,
  onApprove,
}: {
  user: AdminUser | null;
  onOpenChange(open: boolean): void;
  branches: BranchOption[];
  onApprove(user: AdminUser, input: { role: Role; branchId: string | null }): Promise<boolean>;
}) {
  const id = useId();
  const [role, setRole] = useState<Role>('member');
  const [branchId, setBranchId] = useState<string | null>(user?.branchId ?? null);
  const [pending, setPending] = useState(false);

  const submit = async () => {
    if (!user) return;
    setPending(true);
    const ok = await onApprove(user, { role, branchId });
    setPending(false);
    if (ok) onOpenChange(false);
  };

  return (
    <FormDialog
      open={user !== null}
      onOpenChange={onOpenChange}
      title={user ? `Approve ${user.name}` : 'Approve'}
      description={
        user?.branchId
          ? 'The branch is pre-filled from their sign-in provider. Check it before approving.'
          : 'Choose their role and branch.'
      }
      submitLabel="Approve"
      pending={pending}
      formError={null}
      onSubmit={submit}
    >
      <Field id={`${id}-role`} label="Role">
        <RoleSelect id={`${id}-role`} value={role} onChange={setRole} />
      </Field>
      <Field id={`${id}-branch`} label="Branch">
        <BranchSelect
          id={`${id}-branch`}
          value={branchId}
          branches={branches}
          onChange={setBranchId}
        />
      </Field>
    </FormDialog>
  );
}
