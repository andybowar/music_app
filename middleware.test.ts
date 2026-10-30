// @vitest-environment node
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const USER_ID = '00000000-0000-4000-8000-000000000001';

// The middleware reads the session and the user's own `users` row through @supabase/ssr. Replace
// the client so each test controls the session, the row lookup, and any cookie refresh.
type Cookie = { name: string; value: string; options: Record<string, unknown> };
type CookieAdapter = {
  setAll: (cookies: Cookie[], headers?: Record<string, string>) => void;
};
const state = {
  user: { id: USER_ID } as { id: string } | null,
  row: { access_status: 'approved' } as { access_status: string } | null,
  rowError: null as Error | null,
  authError: null as { name: string; status?: number; message: string } | null,
  refresh: null as { cookies: Cookie[]; headers: Record<string, string> } | null,
  signOutCookies: [] as Cookie[],
};
const signOut = vi.fn();
const fromTable = vi.fn();

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn((_url: string, _key: string, opts: { cookies: CookieAdapter }) => ({
    auth: {
      getUser: async () => {
        if (state.refresh) opts.cookies.setAll(state.refresh.cookies, state.refresh.headers);
        return { data: { user: state.user }, error: state.authError };
      },
      signOut: async (args: unknown) => {
        signOut(args);
        opts.cookies.setAll(state.signOutCookies);
        return { error: null };
      },
    },
    from: (table: string) => {
      fromTable(table);
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: state.row, error: state.rowError }),
          }),
        }),
      };
    },
  })),
}));

vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost:54321');
vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key');

const { createServerClient } = await import('@supabase/ssr');
const { config, isPublicRoute, isTransientAuthError, middleware, normalisePath } =
  await import('./middleware');

function request(path: string): NextRequest {
  return new NextRequest(new URL(path, 'http://localhost:3000'));
}

function location(res: Response): URL | null {
  const loc = res.headers.get('location');
  return loc ? new URL(loc) : null;
}

beforeEach(() => {
  vi.clearAllMocks();
  state.user = { id: USER_ID };
  state.row = { access_status: 'approved' };
  state.rowError = null;
  state.authError = null;
  state.refresh = null;
  state.signOutCookies = [];
});

describe('normalisePath', () => {
  it.each([
    ['/library', '/library'],
    ['/%6Cibrary', '/library'],
    ['/library/', '/library'],
    ['//library', '/library'],
    ['/./library', '/library'],
    ['/login/%2E%2E/library', '/library'],
    ['/share%2F..%2Flibrary', '/library'],
    ['/login\\..\\library', '/library'],
    ['/', '/'],
    ['', '/'],
  ])('%s → %s', (raw, expected) => {
    expect(normalisePath(raw)).toBe(expected);
  });

  it('returns null for an undecodable path', () => {
    expect(normalisePath('/%E0%A4%A')).toBeNull();
  });
});

describe('isPublicRoute', () => {
  it.each([
    '/',
    '/login',
    '/signup',
    '/reset/confirm',
    '/auth/callback',
    '/account-status',
    '/share/abc-token',
    '/api/cron/usage',
    '/dev',
    '/dev/tokens',
    '/%6Cogin',
    '/login/',
  ])('treats %s as public', (pathname) => {
    expect(isPublicRoute(pathname)).toBe(true);
  });

  it.each([
    '/library',
    '/library/sv',
    '/songs/1',
    '/lists/2',
    '/branches',
    '/quick',
    '/admin/users',
    // Not listed anywhere: gated by default.
    '/settings',
    '/new-feature/x',
    // Lookalikes and encodings must not slip through.
    '/%6Cibrary',
    '/login-help',
    '/sharex',
    '/login/%2E%2E/library',
    '/share%2F..%2Fadmin',
    '/%E0%A4%A',
  ])('gates %s', (pathname) => {
    expect(isPublicRoute(pathname)).toBe(false);
  });
});

describe('isTransientAuthError', () => {
  it.each([
    [{ name: 'AuthRetryableFetchError', status: 0 }],
    [{ name: 'AuthRetryableFetchError', status: 502 }],
    [{ name: 'AuthApiError', status: 500 }],
    [{ name: 'AuthRefreshDiscardedError', status: 409 }],
    [{ name: 'AuthUnknownError' }],
  ])('treats %o as transient', (error) => {
    expect(isTransientAuthError(error)).toBe(true);
  });

  it.each([
    [{ name: 'AuthSessionMissingError', status: 400 }],
    [{ name: 'AuthApiError', status: 400 }],
    [{ name: 'AuthApiError', status: 403 }],
    [{ name: 'AuthInvalidJwtError', status: 400 }],
  ])('treats %o as an absent session', (error) => {
    expect(isTransientAuthError(error)).toBe(false);
  });
});

describe('config.matcher', () => {
  const pattern = new RegExp(`^${config.matcher[0]}$`);

  it.each(['/library', '/login', '/account-status', '/share/abc'])('runs on %s', (path) => {
    expect(pattern.test(path)).toBe(true);
  });

  it.each(['/_next/static/chunk.js', '/_next/image', '/favicon.ico', '/logo.svg'])(
    'skips %s',
    (path) => {
      expect(pattern.test(path)).toBe(false);
    },
  );
});

describe('middleware: access gating', () => {
  it('passes an approved user through to a protected route', async () => {
    const res = await middleware(request('/library'));
    expect(location(res)).toBeNull();
    expect(fromTable).toHaveBeenCalledWith('users');
  });

  it('redirects a signed-out request to /login?next=… preserving the query', async () => {
    state.user = null;
    const res = await middleware(request('/library?q=hymn'));
    expect(res.status).toBe(307);
    expect(location(res)?.pathname).toBe('/login');
    expect(location(res)?.searchParams.get('next')).toBe('/library?q=hymn');
  });

  it.each(['pending', 'rejected'])('sends a %s user to /account-status', async (status) => {
    state.row = { access_status: status };
    const res = await middleware(request('/songs/1'));
    expect(res.status).toBe(307);
    expect(location(res)?.pathname).toBe('/account-status');
  });

  it('signs out a user whose row RLS hides (disabled) and sends them to /login', async () => {
    state.row = null;
    state.signOutCookies = [{ name: 'sb-auth', value: '', options: { maxAge: 0 } }];
    const res = await middleware(request('/library'));
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(location(res)?.pathname).toBe('/login');
    expect(res.cookies.get('sb-auth')?.value).toBe('');
  });

  it('fails closed with a 503 when the row lookup fails, without signing out', async () => {
    state.rowError = new Error('network');
    const res = await middleware(request('/library'));
    expect(res.status).toBe(503);
    expect(res.headers.get('retry-after')).toBe('5');
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect(location(res)).toBeNull();
    expect(signOut).not.toHaveBeenCalled();
  });

  it('fails closed with a 503 when Auth is unreachable', async () => {
    state.user = null;
    state.authError = { name: 'AuthRetryableFetchError', status: 0, message: 'fetch failed' };
    const res = await middleware(request('/library'));
    expect(res.status).toBe(503);
    expect(res.headers.get('retry-after')).toBe('5');
    expect(fromTable).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
  });

  it('treats the normal missing-session error as signed out', async () => {
    state.user = null;
    state.authError = { name: 'AuthSessionMissingError', status: 400, message: 'missing' };
    const res = await middleware(request('/library'));
    expect(res.status).toBe(307);
    expect(location(res)?.pathname).toBe('/login');
  });

  it('does not 503 a public route when Auth is unreachable', async () => {
    state.user = null;
    state.authError = { name: 'AuthRetryableFetchError', status: 0, message: 'fetch failed' };
    const res = await middleware(request('/login'));
    expect(res.status).toBe(200);
  });

  it('keeps rotated cookies on a 503', async () => {
    state.refresh = {
      cookies: [{ name: 'sb-auth', value: 'fresh', options: { path: '/' } }],
      headers: { 'cache-control': 'private, no-cache', pragma: 'no-cache' },
    };
    state.rowError = new Error('network');
    const res = await middleware(request('/library'));
    expect(res.status).toBe(503);
    expect(res.cookies.get('sb-auth')?.value).toBe('fresh');
    expect(res.headers.get('pragma')).toBe('no-cache');
    expect(res.headers.get('retry-after')).toBe('5');
  });

  it('gates an unlisted route', async () => {
    state.user = null;
    const res = await middleware(request('/settings'));
    expect(location(res)?.pathname).toBe('/login');
    expect(location(res)?.searchParams.get('next')).toBe('/settings');
  });

  it('gates a percent-encoded protected path', async () => {
    state.user = null;
    const res = await middleware(request('/%6Cibrary'));
    expect(res.status).toBe(307);
    expect(location(res)?.pathname).toBe('/login');
  });

  it('gates a dot-segment escape from a public prefix', async () => {
    state.row = { access_status: 'pending' };
    const res = await middleware(request('/share/%2E%2E/library'));
    expect(location(res)?.pathname).toBe('/account-status');
  });

  it('only refreshes the session on public routes (no gating, no row lookup)', async () => {
    state.user = null;
    for (const path of ['/login', '/account-status', '/share/abc']) {
      const res = await middleware(request(path));
      expect(location(res)).toBeNull();
    }
    expect(fromTable).not.toHaveBeenCalled();
  });
});

describe('middleware: session refresh', () => {
  const refreshed: Cookie = { name: 'sb-auth', value: 'fresh', options: { path: '/' } };

  it('writes refreshed cookies to the response and forwards them to the request', async () => {
    state.refresh = { cookies: [refreshed], headers: { 'cache-control': 'private, no-store' } };
    const res = await middleware(request('/library'));
    expect(res.cookies.get('sb-auth')?.value).toBe('fresh');
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    // NextResponse.next({ request }) forwards overridden request cookies via this header.
    expect(res.headers.get('x-middleware-request-cookie')).toContain('sb-auth=fresh');
  });

  it('keeps refreshed cookies and every cache header @supabase/ssr sets on a redirect', async () => {
    state.refresh = {
      cookies: [refreshed],
      headers: {
        'Cache-Control': 'private, no-cache, no-store, must-revalidate, max-age=0',
        Expires: '0',
        Pragma: 'no-cache',
      },
    };
    state.row = { access_status: 'pending' };
    const res = await middleware(request('/library'));
    expect(location(res)?.pathname).toBe('/account-status');
    expect(res.cookies.get('sb-auth')?.value).toBe('fresh');
    expect(res.headers.get('cache-control')).toBe(
      'private, no-cache, no-store, must-revalidate, max-age=0',
    );
    expect(res.headers.get('expires')).toBe('0');
    expect(res.headers.get('pragma')).toBe('no-cache');
  });
});

describe('middleware: Supabase not configured (unprovisioned preview)', () => {
  afterEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost:54321');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key');
  });

  it.each(['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'])(
    'passes public routes straight through without %s',
    async (name) => {
      vi.stubEnv(name, '');
      for (const path of ['/', '/dev/tokens', '/login']) {
        const res = await middleware(request(path));
        expect(location(res)).toBeNull();
      }
      expect(createServerClient).not.toHaveBeenCalled();
    },
  );

  it('fails loudly on protected routes rather than serving them unguarded', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
    await expect(middleware(request('/library'))).rejects.toThrow(/NEXT_PUBLIC_SUPABASE/);
  });
});
