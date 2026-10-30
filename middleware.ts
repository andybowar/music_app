/**
 * Edge middleware (REQ-AUTH-06, REQ-AUTH-08; contracts/ui.md `app/(app)` shell guard).
 *
 * On requests for the protected `(app)` route families this middleware:
 *
 * 1. **Refreshes the Supabase session each request.** `@supabase/ssr` writes an updated session
 *    cookie on a cache miss; the `x-supabase-middleware` request header and a fresh router
 *    response keep the cookie update from being hidden by the router cache. The per-request server
 *    client in `lib/supabase/server.ts` then reads the refreshed cookie.
 * 2. **Redirects unauthenticated users to `/login?next=…`,** preserving the path they were after.
 *    The `next` is our own pathname + search (never a free-form client value), so no `safeNext` is
 *    needed here.
 *
 * Supabase Auth itself (sign-in / sign-out) stays a browser concern handled by the server actions
 * in `features/auth/actions.ts`; this middleware only reads the session token. Pending / rejected
 * users are NOT redirected here — they may reach only `/account-status`, which the `(app)` layout
 * enforces by throwing `FORBIDDEN` from `requireUser`. Keeping that out of middleware keeps it a
 * light, edge-safe gate.
 */

import { isProtectedAppRoute } from '@/lib/auth';
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const LOGIN_PATH = '/login';

export async function middleware(req: NextRequest): Promise<NextResponse> {
  // The `matcher` already restricts this to protected routes; double-check against the single
  // source of truth so a matcher/contract drift can't open a gap.
  if (!isProtectedAppRoute(req.nextUrl.pathname)) {
    return NextResponse.next();
  }

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-supabase-middleware', 'true');
  // Refreshed session cookies are written to this response; the browser re-reads the cookie on the
  // next request, so opting out of the router cache avoids a stale cached response.
  const response = NextResponse.next({ request: { headers: requestHeaders } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://localhost:54321',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const login = new URL(LOGIN_PATH, req.nextUrl.origin);
    login.searchParams.set('next', req.nextUrl.pathname + req.nextUrl.search);
    return NextResponse.redirect(login);
  }

  return response;
}

// Protect the `(app)` route families only. Public routes — `(auth)`, `/account-status`,
// `/share/[token]`, `/api/*`, and static assets — are excluded.
export const config = {
  matcher: [
    '/library/:path*',
    '/songs/:path*',
    '/lists/:path*',
    '/branches/:path*',
    '/quick/:path*',
    '/admin/:path*',
  ],
};
