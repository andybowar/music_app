/**
 * OIDC callback (contracts/ui.md `/auth/callback`; REQ-AUTH-01, REQ-AUTH-03..06).
 *
 * The IdP sends the user back here through Supabase with `?code=` (PKCE) or, if
 * they declined or something failed, `?error=`. We exchange the code for a
 * session, provision the `users` row, and redirect to the sanitized `next`
 * (default `/library`). Any failure ends on `/login?error=<SsoErrorCode>` with no
 * session left behind: a user who is disabled or can't be provisioned is signed
 * out again before the redirect.
 */

import { type NextRequest, NextResponse } from 'next/server';

import { DEFAULT_AFTER_LOGIN, safeNext } from '@/app/(auth)/login/safeNext';
import { DISABLED_MESSAGE, idpGroupsFromUser, provisionUser } from '@/features/auth/provision';
import type { SsoErrorCode } from '@/features/auth/ui/SsoButtons';
import { ActionError } from '@/lib/action';
import { env } from '@/lib/env';
import { createServerSupabase } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

function redirectTo(path: string): NextResponse {
  const response = NextResponse.redirect(new URL(path, env.APP_URL), 303);
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

function toLogin(error: SsoErrorCode, next: string): NextResponse {
  const params = new URLSearchParams({ error });
  if (next !== DEFAULT_AFTER_LOGIN) params.set('next', next);
  return redirectTo(`/login?${params.toString()}`);
}

function errorCodeFor(error: unknown): SsoErrorCode {
  if (!(error instanceof ActionError)) return 'sso_failed';
  if (error.code === 'CONFLICT') return 'sso_email_conflict';
  if (error.code === 'FORBIDDEN' && error.message === DISABLED_MESSAGE) return 'sso_disabled';
  return 'sso_no_account';
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const params = request.nextUrl.searchParams;
  const next = safeNext(params.get('next'));

  // The IdP (or Supabase) reports failures as `?error=…&error_description=…`.
  const idpError = params.get('error');
  if (idpError) return toLogin(idpError === 'access_denied' ? 'sso_cancelled' : 'sso_failed', next);

  const code = params.get('code');
  if (!code) return toLogin('sso_failed', next);

  const supabase = await createServerSupabase();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) return toLogin('sso_failed', next);

  try {
    await provisionUser(data.user, idpGroupsFromUser(data.user));
  } catch (err) {
    if (!(err instanceof ActionError)) console.error('[auth/callback] provisioning failed', err);
    await supabase.auth.signOut({ scope: 'local' });
    return toLogin(errorCodeFor(err), next);
  }

  return redirectTo(next);
}
