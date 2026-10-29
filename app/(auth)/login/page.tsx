import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { LoginForm } from '@/features/auth/ui/LoginForm';
import { SsoButtons } from '@/features/auth/ui/SsoButtons';
import { env } from '@/lib/env';

import { AuthShell } from './AuthShell';
import { safeNext } from './safeNext';

export const metadata: Metadata = { title: 'Sign in' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { next, error } = await searchParams;

  // SSO buttons slot (REQ-AUTH-01): OIDC providers from env.SSO_PROVIDERS (AUTH-02);
  // AUTH-03 adds SAML. Empty → the page shows the password form alone.
  const oidcProviders = (['google', 'microsoft'] as const).filter((p) =>
    env.SSO_PROVIDERS.includes(p),
  );
  const ssoSlot: ReactNode = oidcProviders.length ? (
    <SsoButtons
      providers={oidcProviders}
      next={safeNext(next)}
      error={typeof error === 'string' ? error : null}
    />
  ) : null;

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
