/**
 * Edge middleware (REQ-AUTH-06, REQ-AUTH-08; contracts/ui.md `app/(app)` shell guard).
 *
 * On every non-asset request this middleware **refreshes the Supabase session**: `@supabase/ssr`
 * rotates an expired access token, and the new cookies are written to both the forwarded request
 * (so server components in this request see the fresh session instead of refreshing again with
 * a spent refresh token) and the response (so the browser stores them). The headers `@supabase/ssr`
 * supplies alongside (`Cache-Control`, `Expires`, `Pragma`) keep CDNs from caching a response that
 * carries session cookies, and are copied onto every response we build ourselves.
 *
 * Gating **fails closed**. The path is decoded and normalised, a short list of public routes
 * (`PUBLIC_PREFIXES`) only gets the session refresh, and every other route is gated:
 *
 * - signed out → `/login?next=<path+search>` (our own path, never a client value, so no
 *   `safeNext` is needed);
 * - Supabase Auth or the `users` lookup failing → `503` with `Retry-After`. A transient outage is
 *   not evidence of anything: nobody is signed out, and nobody gets through;
 * - signed in with no readable `users` row → signed out, then `/login`. RLS (`users_select`)
 *   hides a disabled user's own row, so this is how a disabled user's session ends on their next
 *   request (REQ-AUTH-06); it also covers a session with no app profile;
 * - pending / rejected → `/account-status` (REQ-AUTH-08);
 * - approved → through. Pages still call `requirePageUser` and actions `requireUser`.
 *
 * Everything runs on the user's own anon-key session. This file must not import `lib/db` or
 * other server-only modules: they would be bundled into the edge runtime.
 */

import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

import type { AccessStatus } from '@/types/domain';

const LOGIN_PATH = '/login';
const ACCOUNT_STATUS_PATH = '/account-status';
const RETRY_AFTER_SECONDS = '5';

/**
 * Routes reachable without an approved session. Each entry matches itself and everything below
 * it, except `/`, which matches only the home page. Everything else is gated, so a new route
 * family is protected by default.
 */
const PUBLIC_PREFIXES = [
  '/login',
  '/signup',
  '/reset',
  '/auth',
  '/account-status',
  '/share',
  '/api',
  '/dev',
  // Framework internals the matcher doesn't already skip (dev HMR, etc.).
  '/_next',
] as const;

/**
 * Decode and normalise a pathname so `/%6Cibrary`, `/library/`, `//library` and
 * `/login/%2E%2E/library` are all judged as `/library`. Returns `null` when the path can't be
 * decoded; callers treat that as a protected route.
 */
export function normalisePath(pathname: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  const segments: string[] = [];
  for (const segment of decoded.split(/[/\\]+/)) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') segments.pop();
    else segments.push(segment);
  }
  return `/${segments.join('/')}`;
}

/** True when `pathname` (raw, as received) is a public route. Undecodable paths are not. */
export function isPublicRoute(pathname: string): boolean {
  const path = normalisePath(pathname);
  if (path === null) return false;
  if (path === '/') return true;
  return PUBLIC_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

/**
 * Whether a `getUser()` error means "Auth is unreachable" rather than "this session is not
 * valid". The normal missing-session case and other definitive 4xx answers (revoked refresh
 * token, invalid JWT) are absence; network failures, 5xx, refresh races (409) and errors with
 * no status are transient.
 */
export function isTransientAuthError(error: { name?: string; status?: number }): boolean {
  if (error.name === 'AuthRetryableFetchError') return true;
  const { status } = error;
  if (typeof status !== 'number' || status === 0) return true;
  if (status === 409) return true;
  return status >= 500;
}

export async function middleware(req: NextRequest): Promise<NextResponse> {
  const protectedRoute = !isPublicRoute(req.nextUrl.pathname);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // NEXT_PUBLIC_* values are inlined at build time. Without them there is no session to refresh,
  // so public routes (the `/dev` gallery on unprovisioned previews, `/login`) pass straight
  // through; protected routes fail loudly rather than serve the app unguarded.
  if (!url || !anonKey) {
    if (!protectedRoute) return NextResponse.next();
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are not set. Set them before building (see .env.example).',
    );
  }

  let response = NextResponse.next({ request: req });
  // Every header @supabase/ssr asks us to set, so redirects and 503s carry them too.
  const sessionHeaders: Record<string, string> = {};

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) req.cookies.set(name, value);
        response = NextResponse.next({ request: req });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
        Object.assign(sessionHeaders, headers ?? {});
        for (const [key, value] of Object.entries(sessionHeaders)) {
          response.headers.set(key, value);
        }
      },
    },
  });

  // Always call getUser (it performs the refresh), even on public routes.
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (!protectedRoute) return response;

  if (authError && isTransientAuthError(authError)) {
    return unavailable(response, sessionHeaders);
  }

  if (!user) {
    const { pathname, search } = req.nextUrl;
    const login = new URL(LOGIN_PATH, req.nextUrl.origin);
    login.searchParams.set('next', pathname + search);
    return redirectWithSession(login, response, sessionHeaders);
  }

  const { data: row, error } = await supabase
    .from('users')
    .select('access_status')
    .eq('id', user.id)
    .maybeSingle<{ access_status: AccessStatus }>();

  // A failed lookup is not evidence of anything: don't sign out, don't let the request through.
  if (error) return unavailable(response, sessionHeaders);

  if (!row) {
    await supabase.auth.signOut({ scope: 'local' });
    return redirectWithSession(new URL(LOGIN_PATH, req.nextUrl.origin), response, sessionHeaders);
  }

  if (row.access_status !== 'approved') {
    return redirectWithSession(
      new URL(ACCOUNT_STATUS_PATH, req.nextUrl.origin),
      response,
      sessionHeaders,
    );
  }

  return response;
}

/** Copy session cookies (refreshed or cleared) and @supabase/ssr's headers onto `to`. */
function withSession(
  to: NextResponse,
  from: NextResponse,
  headers: Record<string, string>,
): NextResponse {
  for (const cookie of from.cookies.getAll()) to.cookies.set(cookie);
  for (const [key, value] of Object.entries(headers)) to.headers.set(key, value);
  return to;
}

/** A redirect that keeps the session cookies and cache headers. */
function redirectWithSession(
  url: URL,
  from: NextResponse,
  headers: Record<string, string>,
): NextResponse {
  return withSession(NextResponse.redirect(url), from, headers);
}

/**
 * 503 for a transient Auth/DB failure. Keeps any rotated cookies: a refresh that succeeded before
 * the failure has already spent the old refresh token.
 */
function unavailable(from: NextResponse, headers: Record<string, string>): NextResponse {
  const res = new NextResponse('Service temporarily unavailable. Please try again shortly.', {
    status: 503,
    headers: {
      'Retry-After': RETRY_AFTER_SECONDS,
      'Cache-Control': 'private, no-store',
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
  return withSession(res, from, headers);
}

// Run on every route except static assets so the session stays fresh on public pages too
// (`/login`, `/auth/callback`, `/account-status`); which routes are gated is decided by
// `isPublicRoute` above.
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
