/**
 * Edge middleware (REQ-AUTH-06, REQ-AUTH-08; contracts/ui.md `app/(app)` shell guard).
 *
 * On every non-asset request this middleware **refreshes the Supabase session**: `@supabase/ssr`
 * rotates an expired access token, and the new cookies are written to both the forwarded request
 * (so server components in this request see the fresh session instead of refreshing again with
 * a spent refresh token) and the response (so the browser stores them). The cache headers
 * supplied by `@supabase/ssr` keep CDNs from caching a response that carries session cookies.
 *
 * On the protected `(app)` route families it also gates access:
 *
 * - signed out → `/login?next=<path+search>` (our own path, never a client value, so no
 *   `safeNext` is needed);
 * - signed in with no readable `users` row → signed out, then `/login`. RLS (`users_select`)
 *   hides a disabled user's own row, so this is how a disabled user's session ends on their next
 *   request (REQ-AUTH-06); it also covers a session with no app profile;
 * - pending / rejected → `/account-status` (REQ-AUTH-08);
 * - approved → through. The `(app)` layout and server actions still call `requireUser`.
 *
 * Everything runs on the user's own anon-key session. This file must not import `lib/db` or
 * other server-only modules: they would be bundled into the edge runtime.
 */

import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

import type { AccessStatus } from '@/types/domain';

const LOGIN_PATH = '/login';
const ACCOUNT_STATUS_PATH = '/account-status';

/**
 * The signed-in `(app)` route families. Everything else — the `(auth)` routes,
 * `/account-status`, public `/share/[token]`, `/api/*` — only gets a session refresh.
 */
const PROTECTED_APP_PREFIXES = [
  '/library',
  '/songs',
  '/lists',
  '/branches',
  '/quick',
  '/admin',
] as const;

/** True when `pathname` is under a protected `(app)` route family. */
export function isProtectedAppRoute(pathname: string): boolean {
  return PROTECTED_APP_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function requirePublicEnv(name: string, value: string | undefined): string {
  // NEXT_PUBLIC_* values are inlined at build time; fail loudly rather than build a client that
  // 500s on every request.
  if (!value) throw new Error(`${name} is not set. Set it before building (see .env.example).`);
  return value;
}

export async function middleware(req: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request: req });

  const supabase = createServerClient(
    requirePublicEnv('NEXT_PUBLIC_SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL),
    requirePublicEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    {
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
          for (const [key, value] of Object.entries(headers ?? {})) {
            response.headers.set(key, value);
          }
        },
      },
    },
  );

  // Always call getUser (it performs the refresh), even on public routes.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname, search } = req.nextUrl;
  if (!isProtectedAppRoute(pathname)) return response;

  if (!user) {
    const login = new URL(LOGIN_PATH, req.nextUrl.origin);
    login.searchParams.set('next', pathname + search);
    return redirectWithCookies(login, response);
  }

  const { data: row, error } = await supabase
    .from('users')
    .select('access_status')
    .eq('id', user.id)
    .maybeSingle<{ access_status: AccessStatus }>();

  // A failed lookup is not evidence of anything; let the page-level `requireUser` decide.
  if (error) return response;

  if (!row) {
    await supabase.auth.signOut({ scope: 'local' });
    return redirectWithCookies(new URL(LOGIN_PATH, req.nextUrl.origin), response);
  }

  if (row.access_status !== 'approved') {
    return redirectWithCookies(new URL(ACCOUNT_STATUS_PATH, req.nextUrl.origin), response);
  }

  return response;
}

/** A redirect that keeps any refreshed (or cleared) session cookies and cache headers. */
function redirectWithCookies(url: URL, from: NextResponse): NextResponse {
  const redirect = NextResponse.redirect(url);
  for (const cookie of from.cookies.getAll()) redirect.cookies.set(cookie);
  from.headers.forEach((value, key) => {
    if (key.toLowerCase() === 'cache-control' || key.toLowerCase() === 'expires') {
      redirect.headers.set(key, value);
    }
  });
  return redirect;
}

// Run on every route except static assets so the session stays fresh on public pages too
// (`/login`, `/auth/callback`, `/account-status`); access gating is limited to
// `isProtectedAppRoute` above.
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
