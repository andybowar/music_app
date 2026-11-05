// @vitest-environment node
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const auth = { exchangeCodeForSession: vi.fn(), signOut: vi.fn() };
vi.mock('@/lib/supabase/server', () => ({ createServerSupabase: vi.fn(async () => ({ auth })) }));
vi.mock('@/lib/env', () => ({ env: { APP_URL: 'https://app.example.test' } }));

const provisionUser = vi.fn();
const idpGroupsFromUser = vi.fn(() => ['pop-branch-sv']);
vi.mock('@/features/auth/provision', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@/features/auth/provision');
  return { ...actual, provisionUser, idpGroupsFromUser };
});
vi.mock('@/lib/db', () => ({ withTx: vi.fn() }));

const { ActionError } = await import('@/lib/action');
const { DISABLED_MESSAGE, NO_ACCOUNT_MESSAGE, EMAIL_CONFLICT_MESSAGE } =
  await import('@/features/auth/provision');
const { GET } = await import('./route');

const USER = { id: '00000000-0000-4000-8000-000000000001', email: 'ana@example.test' };

async function callback(query: string) {
  const res = await GET(new NextRequest(`https://app.example.test/auth/callback${query}`));
  return { status: res.status, location: res.headers.get('location'), res };
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.exchangeCodeForSession.mockResolvedValue({ data: { user: USER, session: {} }, error: null });
  auth.signOut.mockResolvedValue({ error: null });
  provisionUser.mockResolvedValue({ id: USER.id });
});

describe('GET /auth/callback', () => {
  it('exchanges the code, provisions the user and redirects to next', async () => {
    const { status, location, res } = await callback('?code=abc&next=%2Fsongs%2F42%3Fv%3D1');
    expect(auth.exchangeCodeForSession).toHaveBeenCalledWith('abc');
    expect(idpGroupsFromUser).toHaveBeenCalledWith(USER);
    expect(provisionUser).toHaveBeenCalledWith(USER, ['pop-branch-sv']);
    expect(auth.signOut).not.toHaveBeenCalled();
    expect(status).toBe(303);
    expect(location).toBe('https://app.example.test/songs/42?v=1');
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('defaults to /library', async () => {
    expect((await callback('?code=abc')).location).toBe('https://app.example.test/library');
  });

  it.each([
    ['//evil.test/x'],
    ['https://evil.test/'],
    ['/\\evil.test'],
    ['/login'],
    ['javascript:alert(1)'],
  ])('never redirects off-site or back to auth pages (next=%s)', async (next) => {
    const { location } = await callback(`?code=abc&next=${encodeURIComponent(next)}`);
    expect(location).toBe('https://app.example.test/library');
  });

  it('reports denied consent as cancelled without exchanging', async () => {
    const { location } = await callback(
      '?error=access_denied&error_description=User+denied&next=%2Flists',
    );
    expect(auth.exchangeCodeForSession).not.toHaveBeenCalled();
    expect(location).toBe('https://app.example.test/login?error=sso_cancelled&next=%2Flists');
  });

  it('reports other IdP errors as a failure', async () => {
    const { location } = await callback('?error=server_error');
    expect(location).toBe('https://app.example.test/login?error=sso_failed');
  });

  it('fails when the code is missing', async () => {
    expect((await callback('')).location).toBe('https://app.example.test/login?error=sso_failed');
    expect(auth.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it('fails when the code exchange fails', async () => {
    auth.exchangeCodeForSession.mockResolvedValue({
      data: { user: null, session: null },
      error: new Error('invalid flow state'),
    });
    const { location } = await callback('?code=bad');
    expect(location).toBe('https://app.example.test/login?error=sso_failed');
    expect(provisionUser).not.toHaveBeenCalled();
  });

  it.each([
    [new ActionError('FORBIDDEN', DISABLED_MESSAGE), 'sso_disabled'],
    [new ActionError('FORBIDDEN', NO_ACCOUNT_MESSAGE), 'sso_no_account'],
    [new ActionError('UNAUTHENTICATED', 'x'), 'sso_no_account'],
    [new ActionError('CONFLICT', EMAIL_CONFLICT_MESSAGE), 'sso_email_conflict'],
    [new Error('db down'), 'sso_failed'],
  ])('signs out and redirects when provisioning throws %s', async (error, code) => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    provisionUser.mockRejectedValue(error);
    const { location } = await callback('?code=abc');
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(location).toBe(`https://app.example.test/login?error=${code}`);
    expect(spy).toHaveBeenCalledTimes(error instanceof ActionError ? 0 : 1);
    spy.mockRestore();
  });
});

describe('GET /auth/callback on a preview address (bug report 2026-11-05)', () => {
  const PREVIEW = 'music-ab12cd-team.vercel.app';
  const onPreview = (query: string, cookie?: string) =>
    GET(
      new NextRequest(`https://${PREVIEW}/auth/callback${query}`, {
        headers: { host: PREVIEW, ...(cookie ? { cookie } : {}) },
      }),
    );

  beforeEach(() => {
    vi.stubEnv('VERCEL_ENV', 'preview');
    vi.stubEnv('VERCEL_URL', PREVIEW);
  });
  afterEach(() => vi.unstubAllEnvs());

  it('sends the user on from the address sign-in started on, not APP_URL', async () => {
    const res = await onPreview('?code=ok&next=%2Flists');
    expect(res.headers.get('location')).toBe(`https://${PREVIEW}/lists`);
  });

  it('production still always uses APP_URL', async () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    const res = await onPreview('?code=ok');
    expect(res.headers.get('location')).toBe('https://app.example.test/library');
  });

  it('logs why a sign-in failed, with the address and whether the PKCE cookie was there', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    auth.exchangeCodeForSession.mockResolvedValue({
      data: { user: null, session: null },
      error: new Error('code verifier not found'),
    });
    const res = await onPreview('?code=bad');
    expect(res.headers.get('location')).toBe(`https://${PREVIEW}/login?error=sso_failed`);
    expect(warn).toHaveBeenCalledWith('[auth/callback] sign-in failed', {
      reason: 'exchange_failed',
      detail: 'code verifier not found',
      host: PREVIEW,
      appHost: 'app.example.test',
      hasVerifierCookie: false,
    });
    await onPreview('?code=bad', 'sb-ref-auth-token-code-verifier=abc');
    expect(warn).toHaveBeenLastCalledWith(
      '[auth/callback] sign-in failed',
      expect.objectContaining({ hasVerifierCookie: true }),
    );
    warn.mockRestore();
  });
});
