/**
 * SAML 2.0 single sign-on for the organization's identity provider
 * (REQ-AUTH-01, REQ-AUTH-03; AUTH-03). Setup guide: `docs/ops/saml.md`.
 *
 * Everything here sits behind `FEATURE_SAML` (SPEC §6: SAML may need a paid
 * Supabase plan, so it ships off). With the flag off, `startSamlSignIn` refuses
 * before touching Supabase and the login page renders no SAML UI.
 *
 * Flow: the user enters their work email → `signInWithSaml` (features/auth/actions.ts)
 * → `startSamlSignIn` asks Supabase for the IdP URL of the email's domain
 * (`signInWithSSO({ domain })`) → the browser goes to the IdP → the IdP posts the
 * assertion to Supabase → Supabase redirects to `/auth/callback?code=…&next=…`,
 * the same callback OIDC uses, which exchanges the code and calls `provisionUser`.
 * New accounts are created `pending` there, like OIDC ones (AUTH-07).
 */

import 'server-only';

import type { AuthError, User } from '@supabase/supabase-js';

import { z } from 'zod';

import { safeNext } from '@/app/(auth)/login/safeNext';
import { ActionError } from '@/lib/action';
import { env } from '@/lib/env';
import { createServerSupabase } from '@/lib/supabase/server';

export const SAML_UNAVAILABLE_MESSAGE = 'Sign-in with your organization is not available.';
export const SAML_NO_PROVIDER_MESSAGE =
  'We couldn’t find organization sign-in for that email address. Check it, or use another way to sign in.';
export const SAML_INVALID_MESSAGE = 'Enter your work email address.';
const RATE_LIMITED = 'Too many attempts. Please wait a few minutes and try again.';

/** Supabase names a SAML identity's provider `sso:<provider-uuid>`. */
const SSO_PROVIDER_PREFIX = 'sso:';

// One DNS label: letters, digits, inner hyphens; 1–63 chars.
const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/** Whether SAML sign-in is switched on for this deployment (`FEATURE_SAML`). */
export function isSamlEnabled(): boolean {
  return env.FEATURE_SAML;
}

/**
 * The email domain to look up the IdP by, from a work email (`ann@example.org`)
 * or a bare domain (`example.org`). Lower-cased; `null` when it isn't a plausible
 * domain (no dot, bad characters, empty local part, too long).
 */
export function samlDomainFrom(emailOrDomain: string): string | null {
  const value = emailOrDomain.trim().toLowerCase();
  if (!value || value.length > 320 || /\s/.test(value)) return null;

  const at = value.lastIndexOf('@');
  if (at === 0) return null;
  const domain = at === -1 ? value : value.slice(at + 1);
  if (domain.length > 253) return null;

  const labels = domain.split('.');
  if (labels.length < 2) return null;
  if (!labels.every((label) => LABEL.test(label))) return null;
  // The top-level domain is never all digits (rules out IP addresses).
  if (/^\d+$/.test(labels[labels.length - 1]!)) return null;
  return domain;
}

const samlSchema = z.object({
  emailOrDomain: z
    .string({ error: SAML_INVALID_MESSAGE })
    .max(320, SAML_INVALID_MESSAGE)
    .transform((value, ctx) => {
      const domain = samlDomainFrom(value);
      if (!domain) {
        ctx.addIssue({ code: 'custom', message: SAML_INVALID_MESSAGE });
        return z.NEVER;
      }
      return domain;
    }),
  next: z.string().max(2048).optional(),
});

function isRequestRateLimited(error: AuthError): boolean {
  return error.code === 'over_request_rate_limit' || error.status === 429;
}

/** Supabase's answer when no SAML provider is registered for the domain (or SAML is off there). */
function isNoProvider(error: AuthError): boolean {
  return (
    error.code === 'sso_provider_not_found' ||
    error.code === 'saml_idp_not_found' ||
    error.code === 'saml_provider_disabled' ||
    error.status === 404
  );
}

/**
 * Start SAML sign-in for the organization that owns `emailOrDomain`'s domain.
 * Returns the IdP URL for the browser to visit. Throws `ActionError`:
 * `FORBIDDEN` when `FEATURE_SAML` is off, `VALIDATION` for a malformed email,
 * `NOT_FOUND` (friendly text) when no IdP is registered for the domain,
 * `RATE_LIMITED`. `next` is sanitized here and again in the callback.
 */
export async function startSamlSignIn(
  emailOrDomain: string,
  next?: string,
): Promise<{ url: string }> {
  if (!isSamlEnabled()) throw new ActionError('FORBIDDEN', SAML_UNAVAILABLE_MESSAGE);
  const input = samlSchema.parse({ emailOrDomain, next });

  const redirectTo = new URL('/auth/callback', env.APP_URL);
  redirectTo.searchParams.set('next', safeNext(input.next));

  const supabase = await createServerSupabase();
  const { data, error } = await supabase.auth.signInWithSSO({
    domain: input.emailOrDomain,
    options: { redirectTo: redirectTo.toString(), skipBrowserRedirect: true },
  });
  if (error) {
    if (isRequestRateLimited(error)) throw new ActionError('RATE_LIMITED', RATE_LIMITED);
    if (isNoProvider(error)) throw new ActionError('NOT_FOUND', SAML_NO_PROVIDER_MESSAGE);
    throw error;
  }
  if (!data?.url) throw new Error('signInWithSSO returned no URL');
  return { url: data.url };
}

export interface SamlIdentity {
  /** Supabase's id for the SAML provider (the part after `sso:`). */
  providerId: string;
  /** The IdP's stable subject (SAML NameID, as Supabase stores it in `sub`). */
  subject: string;
}

/**
 * The SAML identity used for this sign-in: of the user's `sso:<id>` identities,
 * the one signed in most recently. `null` for OIDC/password-only users. Meant for
 * `provisionUser`, which today only recognises OIDC identities (see
 * `agent-spec/change-requests/AUTH-03-saml-provisioning.md`).
 */
export function currentSamlIdentity(user: Pick<User, 'identities'>): SamlIdentity | null {
  let best: { identity: SamlIdentity; at: number } | null = null;
  for (const identity of user.identities ?? []) {
    if (!identity.provider.startsWith(SSO_PROVIDER_PREFIX)) continue;
    const providerId = identity.provider.slice(SSO_PROVIDER_PREFIX.length);
    const sub = identity.identity_data?.sub;
    const subject = typeof sub === 'string' && sub ? sub : identity.id;
    if (!providerId || !subject) continue;
    const at = Date.parse(identity.last_sign_in_at ?? identity.updated_at ?? '') || 0;
    if (!best || at > best.at) best = { identity: { providerId, subject }, at };
  }
  return best?.identity ?? null;
}
