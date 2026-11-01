'use client';

import type { ComponentProps } from 'react';

import { cn } from '@/components/ui/utils';
import type { BranchOption } from '@/features/admin/server';
import { ROLES, type AuthProvider, type Role } from '@/types/domain';

export const ROLE_LABEL: Record<Role, string> = {
  member: 'Member',
  contributor: 'Contributor',
  music_leader: 'Music leader',
  admin: 'Admin',
};

export const PROVIDER_LABEL: Record<AuthProvider, string> = {
  google: 'Google',
  microsoft: 'Microsoft',
  saml: 'SAML',
  password: 'Email',
};

/** `<select>` has no empty option value in our model; this stands for "no branch". */
export const NO_BRANCH = '';

const selectClass =
  'h-9 w-full min-w-0 rounded-md border border-input bg-background px-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50';

type SelectProps = Omit<ComponentProps<'select'>, 'value' | 'onChange'>;

/** Native select: keyboard and screen-reader friendly, and the OS picker on phones. */
export function RoleSelect({
  value,
  onChange,
  className,
  ...props
}: SelectProps & { value: Role; onChange(role: Role): void }) {
  return (
    <select
      {...props}
      className={cn(selectClass, className)}
      value={value}
      onChange={(e) => onChange(e.target.value as Role)}
    >
      {ROLES.map((r) => (
        <option key={r} value={r}>
          {ROLE_LABEL[r]}
        </option>
      ))}
    </select>
  );
}

export function BranchSelect({
  value,
  branches,
  onChange,
  className,
  ...props
}: SelectProps & {
  value: string | null;
  branches: BranchOption[];
  onChange(branchId: string | null): void;
}) {
  return (
    <select
      {...props}
      className={cn(selectClass, className)}
      value={value ?? NO_BRANCH}
      onChange={(e) => onChange(e.target.value === NO_BRANCH ? null : e.target.value)}
    >
      <option value={NO_BRANCH}>No branch</option>
      {branches.map((b) => (
        <option key={b.id} value={b.id}>
          {b.name}
        </option>
      ))}
    </select>
  );
}

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

/** A UTC timestamp shown as a date in the viewer's locale. */
export function LocalDate({ iso }: { iso: string }) {
  return (
    <time dateTime={iso} suppressHydrationWarning>
      {dateFormat.format(new Date(iso))}
    </time>
  );
}
