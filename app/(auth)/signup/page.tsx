import type { Metadata } from 'next';

import { SignupForm } from '@/features/auth/ui/SignupForm';
import { SsoButtons } from '@/features/auth/ui/SsoButtons';
import { env } from '@/lib/env';

import { AuthShell } from '../login/AuthShell';

export const metadata: Metadata = { title: 'Request access' };

/**
 * `/signup` (REQ-AUTH-03): request an account. A first SSO sign-in creates a
 * request too, so the organization sign-in buttons are offered here as well.
 */
export default function SignupPage() {
  const oidcProviders = (['google', 'microsoft'] as const).filter((p) =>
    env.SSO_PROVIDERS.includes(p),
  );

  return (
    <AuthShell
      title="Request access"
      description="An administrator reviews every request before you can use the library."
    >
      {oidcProviders.length ? (
        <div data-slot="sso" className="mb-6 space-y-3">
          <SsoButtons providers={oidcProviders} next="/library" error={null} />
          <p className="flex items-center gap-3 text-xs text-muted-foreground before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border">
            or
          </p>
        </div>
      ) : null}
      <SignupForm />
    </AuthShell>
  );
}
