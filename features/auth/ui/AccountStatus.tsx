'use client';

import type { AccessStatus as AccessStatusValue } from '@/types/domain';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { signOut } from '@/features/auth/actions';

import { FormAlert } from './LoginForm';

const COPY: Record<AccessStatusValue, { heading: string; body: string }> = {
  pending: {
    heading: 'Awaiting approval',
    body:
      'Your request for an account is waiting for an administrator to review it. ' +
      "We'll email you when it's approved.",
  },
  rejected: {
    heading: 'Request declined',
    body:
      'Your request for an account was not approved. ' +
      'If you think this is a mistake, contact your branch administrator.',
  },
  approved: {
    heading: 'Account approved',
    body: 'Your account is ready to use.',
  },
};

export const ACCOUNT_STATUS_COPY = COPY;

export interface AccountStatusProps {
  status: AccessStatusValue;
  name: string;
  email: string;
}

/**
 * What a signed-in pending or rejected user sees (`/account-status`, REQ-AUTH-08):
 * where their request stands, and a way to sign out. Shows no app data.
 */
export function AccountStatus({ status, name, email }: AccountStatusProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const copy = COPY[status];

  function onSignOut() {
    if (pending) return;
    setError(null);
    startTransition(async () => {
      const result = await signOut();
      if (result.ok) {
        router.replace('/login');
        router.refresh();
        return;
      }
      setError(result.error.message);
    });
  }

  return (
    <section aria-labelledby="account-status-heading" className="space-y-4">
      <FormAlert message={error} />
      <div
        data-status={status}
        className="rounded-md border bg-muted/40 px-3 py-3 text-sm data-[status=rejected]:border-destructive/40"
      >
        <h2 id="account-status-heading" className="font-semibold">
          {copy.heading}
        </h2>
        <p className="mt-1 text-muted-foreground">{copy.body}</p>
      </div>
      <p className="text-sm break-words">
        Signed in as <span className="font-medium">{name}</span>{' '}
        <span className="text-muted-foreground">({email})</span>
      </p>
      {status === 'approved' ? (
        <Button asChild size="lg" className="w-full">
          <Link href="/library">Go to the library</Link>
        </Button>
      ) : null}
      {/* aria-disabled (not disabled) keeps focus on the button while pending. */}
      <Button
        type="button"
        variant={status === 'approved' ? 'outline' : 'default'}
        size="lg"
        className="w-full aria-disabled:opacity-50"
        aria-disabled={pending || undefined}
        onClick={onSignOut}
      >
        {pending ? 'Signing out…' : 'Sign out'}
      </Button>
    </section>
  );
}
