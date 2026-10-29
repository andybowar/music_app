import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { LoginForm } from '@/features/auth/ui/LoginForm';

import { AuthShell } from './AuthShell';
import { safeNext } from './safeNext';

export const metadata: Metadata = { title: 'Sign in' };

/**
 * SSO buttons slot (REQ-AUTH-01). AUTH-02 / AUTH-03 fill this in; until then it
 * renders nothing and the page shows the password form alone.
 */
const ssoSlot: ReactNode = null;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { next } = await searchParams;

  return (
    <AuthShell title="Sign in" description="Use your email and password.">
      {ssoSlot ? (
        <div data-slot="sso" className="mb-6 space-y-3">
          {ssoSlot}
          <p className="flex items-center gap-3 text-xs text-muted-foreground before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border">
            or
          </p>
        </div>
      ) : null}
      <LoginForm next={safeNext(next)} />
    </AuthShell>
  );
}
