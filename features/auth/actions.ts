'use server';

/**
 * Email + password auth actions (contracts/api.md, REQ-AUTH-02).
 *
 * These run before a user is signed in, so unlike other actions they don't
 * start with `requireUser`/`assertCan`. They still Zod-validate, never throw to
 * the client (`withAction`), and never reveal whether an email has an account:
 * a wrong password and an unknown email return the same error, and a reset
 * request always reports success.
 */

import 'server-only';

import type { AuthError, SupabaseClient } from '@supabase/supabase-js';

import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { safeNext } from '@/app/(auth)/login/safeNext';
import { users } from '@/db/schema';
import { OIDC_PROVIDERS, type OidcProvider } from '@/features/auth/provision';
import { ActionError, withAction } from '@/lib/action';
import { getDb } from '@/lib/db';
import { env } from '@/lib/env';
import { createServerSupabase } from '@/lib/supabase/server';

const INVALID_CREDENTIALS = 'Incorrect email or password.';
const INVALID_RESET_LINK = 'This reset link is invalid or has expired. Request a new one.';
const RATE_LIMITED = 'Too many attempts. Please wait a few minutes and try again.';

/** Where the reset email sends the user (must be an allowed Supabase redirect URL). */
const RESET_CONFIRM_PATH = '/reset/confirm';

const emailField = z
  .string({ error: 'Enter your email address.' })
  .trim()
  .toLowerCase()
  .min(1, 'Enter your email address.')
  .max(320, 'Enter a valid email address.')
  .pipe(z.email({ error: 'Enter a valid email address.' }));

const signInSchema = z.object({
  email: emailField,
  password: z
    .string({ error: 'Enter your password.' })
    .min(1, 'Enter your password.')
    .max(1024, 'Password is too long.'),
});

const oidcSchema = z.object({
  provider: z.enum(['google', 'microsoft'], { error: 'Choose a sign-in provider.' }),
  next: z.string().max(2048).optional(),
});

const resetRequestSchema = z.object({ email: emailField });

const resetConfirmSchema = z.object({
  token: z.string({ error: INVALID_RESET_LINK }).trim().min(1, INVALID_RESET_LINK),
  // 72 bytes is bcrypt's limit; Supabase rejects longer passwords.
  password: z
    .string({ error: 'Enter a new password.' })
    .min(8, 'Use at least 8 characters.')
    .max(72, 'Use at most 72 characters.'),
});

function isRequestRateLimited(error: AuthError): boolean {
  return error.code === 'over_request_rate_limit' || error.status === 429;
}

/** 4xx from Supabase Auth means "bad credentials/link"; anything else is our problem. */
function isClientError(error: AuthError): boolean {
  return typeof error.status === 'number' && error.status >= 400 && error.status < 500;
}

/**
 * REQ-AUTH-06: a disabled user must not end up with a session. Signs the fresh
 * session out and reports `false` when `users.disabled_at` is set. Records the
 * login time for active users.
 */
async function admitUser(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const db = getDb();
  const [row] = await db
    .select({ disabledAt: users.disabledAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (row?.disabledAt) {
    await supabase.auth.signOut({ scope: 'local' });
    return false;
  }
  if (row) {
    await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, userId));
  }
  return true;
}

/** Sign in with email + password. The caller navigates to `/library` (or `next`) on success. */
export const signInWithPassword = withAction(
  async (email: string, password: string): Promise<void> => {
    const input = signInSchema.parse({ email, password });
    const supabase = await createServerSupabase();

    const { data, error } = await supabase.auth.signInWithPassword(input);
    if (error) {
      if (isRequestRateLimited(error)) throw new ActionError('RATE_LIMITED', RATE_LIMITED);
      // Wrong password, unknown email, unconfirmed email: all look the same.
      if (isClientError(error)) throw new ActionError('UNAUTHENTICATED', INVALID_CREDENTIALS);
      throw error;
    }

    if (!(await admitUser(supabase, data.user.id))) {
      throw new ActionError('UNAUTHENTICATED', INVALID_CREDENTIALS);
    }
  },
);

/** End the current session on this device. The caller navigates to `/login`. */
export const signOut = withAction(async (): Promise<void> => {
  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.signOut({ scope: 'local' });
  if (error) throw error;
});

/**
 * Email a password-reset link. Always succeeds for a well-formed email, whether
 * or not it has an account, so the response can't be used to probe for users.
 */
export const requestPasswordReset = withAction(async (email: string): Promise<void> => {
  const input = resetRequestSchema.parse({ email });
  const supabase = await createServerSupabase();

  const { error } = await supabase.auth.resetPasswordForEmail(input.email, {
    redirectTo: new URL(RESET_CONFIRM_PATH, env.APP_URL).toString(),
  });
  if (!error) return;

  // The per-address email limit only fires for real accounts, so reporting it
  // would leak that the email exists. Pretend it was sent; one recently was.
  if (error.code === 'over_email_send_rate_limit') return;
  if (isRequestRateLimited(error)) throw new ActionError('RATE_LIMITED', RATE_LIMITED);
  throw error;
});

/**
 * Set a new password from a reset link. `token` is the `code` query parameter
 * Supabase appends to the reset link's redirect (PKCE flow). On success the user
 * is signed in; the caller navigates to `/library`.
 */
export const confirmPasswordReset = withAction(
  async (token: string, password: string): Promise<void> => {
    const input = resetConfirmSchema.parse({ token, password });
    const supabase = await createServerSupabase();

    const { data: exchanged, error: exchangeError } = await supabase.auth.exchangeCodeForSession(
      input.token,
    );
    let userId = exchanged.user?.id;
    if (exchangeError) {
      // A code is single-use. If an earlier attempt exchanged it but then failed
      // (e.g. the new password was rejected), the recovery session is already in
      // the cookies, so let the user retry with it.
      const { data } = await supabase.auth.getUser();
      userId = data.user?.id;
    }
    if (!userId) throw new ActionError('UNAUTHENTICATED', INVALID_RESET_LINK);
    if (!(await admitUser(supabase, userId))) {
      throw new ActionError('UNAUTHENTICATED', INVALID_RESET_LINK);
    }

    const { error } = await supabase.auth.updateUser({ password: input.password });
    if (!error) return;
    if (error.code === 'weak_password') {
      throw new ActionError('VALIDATION', 'Choose a stronger password.', {
        password: ['Choose a stronger password.'],
      });
    }
    if (error.code === 'same_password') {
      throw new ActionError('VALIDATION', 'Choose a password you have not used before.', {
        password: ['Choose a password you have not used before.'],
      });
    }
    if (isRequestRateLimited(error)) throw new ActionError('RATE_LIMITED', RATE_LIMITED);
    throw error;
  },
);

/**
 * Start Google / Microsoft sign-in (REQ-AUTH-01, AUTH-02). Returns the IdP URL
 * for the browser to visit; the IdP comes back to `/auth/callback?next=…`, which
 * exchanges the code and provisions the user. Only providers listed in
 * `env.SSO_PROVIDERS` are allowed. `next` is optional and re-sanitized here and
 * in the callback.
 */
export const signInWithOidc = withAction(
  async (provider: OidcProvider, next?: string): Promise<{ url: string }> => {
    const input = oidcSchema.parse({ provider, next });
    if (!env.SSO_PROVIDERS.includes(input.provider)) {
      throw new ActionError('FORBIDDEN', 'This sign-in option is not available.');
    }

    const redirectTo = new URL('/auth/callback', env.APP_URL);
    redirectTo.searchParams.set('next', safeNext(input.next));

    const supabase = await createServerSupabase();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: OIDC_PROVIDERS[input.provider],
      options: {
        redirectTo: redirectTo.toString(),
        skipBrowserRedirect: true,
        // Entra ID only returns an email when asked for it.
        ...(input.provider === 'microsoft' ? { scopes: 'openid email profile' } : {}),
        ...(input.provider === 'google' ? { queryParams: { prompt: 'select_account' } } : {}),
      },
    });
    if (error) {
      if (isRequestRateLimited(error)) throw new ActionError('RATE_LIMITED', RATE_LIMITED);
      throw error;
    }
    if (!data.url) throw new Error('signInWithOAuth returned no URL');
    return { url: data.url };
  },
);
