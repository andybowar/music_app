// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

// The middleware reads the session through @supabase/ssr. Replace the client so we can control
// whether a user is present without a real Supabase stack or cookies.
let getUserResult: { data: { user: { id: string } | null } } = {
  data: { user: { id: '00000000-0000-4000-8000-000000000001' } },
};
vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      getUser: () => getUserResult,
    },
  })),
}));

// Avoid the real DB/env at import time.
vi.mock('@/lib/db', () => ({ getDb: vi.fn(), withTx: vi.fn() }));
vi.mock('@/lib/env', () => ({ env: {} }));

const { config, middleware } = await import('./middleware');

function nextRequest(pathname: string, search = '') {
  const cookieStore: Array<{ name: string; value: string }> = [];
  const headers = new Headers();
  const req = {
    nextUrl: { pathname, search, origin: 'http://localhost:3000' },
    headers,
    cookies: {
      getAll: () => cookieStore,
      set: (name: string, value: string) => {
        cookieStore.push({ name, value });
      },
    },
  };
  return req as unknown as Parameters<typeof middleware>[0];
}

beforeEach(() => {
  getUserResult = { data: { user: { id: '00000000-0000-4000-8000-000000000001' } } };
});

describe('config.matcher', () => {
  it('protects the (app) route families and omits the public routes', () => {
    expect(config!.matcher).toContain('/library/:path*');
    expect(config!.matcher).toContain('/admin/:path*');
    const all = (config!.matcher as string[]).join(' ');
    expect(all).not.toMatch(/login|account-status|share/);
  });
});

describe('middleware', () => {
  it('passes an authenticated request to a protected route', async () => {
    const res = await middleware(nextRequest('/library'));
    expect(res.status).not.toBe(307);
    expect(res.headers.get('location')).toBeNull();
  });

  it('passes an authenticated request to a public route without redirect', async () => {
    const res = await middleware(nextRequest('/login'));
    expect(res.headers.get('location')).toBeNull();
  });

  it('redirects an unauthenticated request to /login?next=…', async () => {
    getUserResult = { data: { user: null } };
    const res = await middleware(nextRequest('/library'));
    expect(res.status).toBe(307);
    // The `next` value is our own path, which the URL may percent-encode; decode it back out.
    expect(
      new URL(res.headers.get('location')!, 'http://localhost:3000').searchParams.get('next'),
    ).toBe('/library');
  });

  it('preserves the query string in the next parameter', async () => {
    getUserResult = { data: { user: null } };
    const res = await middleware(nextRequest('/library', '?q=hymn'));
    expect(
      new URL(res.headers.get('location')!, 'http://localhost:3000').searchParams.get('next'),
    ).toBe('/library?q=hymn');
  });
});
