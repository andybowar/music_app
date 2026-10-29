'use client';

import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { signInWithOidc } from '@/features/auth/actions';
import type { OidcProvider } from '@/features/auth/provision';

import { FormAlert } from './LoginForm';

/** Why `/auth/callback` sent the user back to `/login` (`?error=`). */
export type SsoErrorCode =
  'sso_failed' | 'sso_cancelled' | 'sso_disabled' | 'sso_no_account' | 'sso_email_conflict';

const ERROR_MESSAGES: Record<SsoErrorCode, string> = {
  sso_failed: 'We couldn’t sign you in with your organization account. Please try again.',
  sso_cancelled: 'Sign-in was cancelled.',
  sso_disabled: 'This account has been disabled. Contact an administrator.',
  sso_no_account:
    'Your organization account is not linked to a branch yet. Ask an administrator to invite you.',
  sso_email_conflict:
    'An account with this email already exists. Sign in with your password instead.',
};

/** Message for a `?error=` value; unknown values get the generic failure text. */
export function ssoErrorMessage(code: string | null | undefined): string | null {
  if (!code) return null;
  return ERROR_MESSAGES[code as SsoErrorCode] ?? ERROR_MESSAGES.sso_failed;
}

const LABELS: Record<OidcProvider, string> = {
  google: 'Continue with Google',
  microsoft: 'Continue with Microsoft',
};

/** Fixed display order, whatever order `SSO_PROVIDERS` lists them in. */
const ORDER: readonly OidcProvider[] = ['google', 'microsoft'];

function ProviderIcon({ provider }: { provider: OidcProvider }) {
  if (provider === 'google') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4">
        <path
          fill="#4285F4"
          d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.2-2.1 3.5-5.1 3.5-8.8Z"
        />
        <path
          fill="#34A853"
          d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.9-3c-1.1.7-2.4 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9h-4v3.1A12 12 0 0 0 12 24Z"
        />
        <path fill="#FBBC05" d="M5.4 14.4a7.2 7.2 0 0 1 0-4.7V6.6h-4a12 12 0 0 0 0 10.8l4-3Z" />
        <path
          fill="#EA4335"
          d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.4 6.6l4 3.1c.9-2.8 3.5-4.9 6.6-4.9Z"
        />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4">
      <path fill="#F25022" d="M1 1h10.5v10.5H1z" />
      <path fill="#7FBA00" d="M12.5 1H23v10.5H12.5z" />
      <path fill="#00A4EF" d="M1 12.5h10.5V23H1z" />
      <path fill="#FFB900" d="M12.5 12.5H23V23H12.5z" />
    </svg>
  );
}

/**
 * "Continue with Google / Microsoft" buttons (REQ-AUTH-01). Shows only the
 * providers enabled by `env.SSO_PROVIDERS` (the page passes them in) and renders
 * nothing when none are. Clicking asks the server for the provider's sign-in URL
 * and navigates there; the IdP returns to `/auth/callback`. `error` is the
 * callback's `?error=` code from a failed attempt.
 */
export function SsoButtons({
  providers,
  next,
  error = null,
  navigate = (url: string) => window.location.assign(url),
}: {
  providers: readonly OidcProvider[];
  next: string;
  error?: string | null;
  /** Test seam: how to leave for the IdP. */
  navigate?: (url: string) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [active, setActive] = useState<OidcProvider | null>(null);
  const [message, setMessage] = useState<string | null>(() => ssoErrorMessage(error));

  const enabled = ORDER.filter((p) => providers.includes(p));
  if (enabled.length === 0) return null;
  // Stays busy after a successful action while the browser leaves for the IdP.
  const busy = pending || active !== null;

  function start(provider: OidcProvider) {
    if (busy) return;
    setMessage(null);
    setActive(provider);
    startTransition(async () => {
      const result = await signInWithOidc(provider, next);
      if (result.ok) {
        navigate(result.data.url);
        return;
      }
      setActive(null);
      setMessage(result.error.message);
    });
  }

  return (
    <div className="space-y-3" aria-busy={busy}>
      <FormAlert message={message} />
      {enabled.map((provider) => (
        <Button
          key={provider}
          type="button"
          variant="outline"
          size="lg"
          className="w-full aria-disabled:opacity-50"
          aria-disabled={busy || undefined}
          onClick={() => start(provider)}
        >
          <ProviderIcon provider={provider} />
          {active === provider ? 'Redirecting…' : LABELS[provider]}
        </Button>
      ))}
    </div>
  );
}
