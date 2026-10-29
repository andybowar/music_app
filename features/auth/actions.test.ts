// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const auth = {
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  getUser: vi.fn(),
  updateUser: vi.fn(),
};
vi.mock('@/lib/supabase/server', () => ({ createServerSupabase: vi.fn(async () => ({ auth })) }));

// Minimal Drizzle stand-in: select(...).from().where().limit() → rows; update().set().where().
const dbState = { rows: [] as Array<{ disabledAt: Date | null }> };
const updateSet = vi.fn();
const db = {
  select: vi.fn(() => ({
    from: () => ({ where: () => ({ limit: async () => dbState.rows }) }),
  })),
  update: vi.fn(() => ({ set: (v: unknown) => (updateSet(v), { where: async () => undefined }) })),
};
vi.mock('@/lib/db', () => ({ getDb: () => db }));
vi.mock('@/lib/env', () => ({ env: { APP_URL: 'https://app.example.test' } }));

const { setSentryCapture } = await import('@/lib/action');
const { confirmPasswordReset, requestPasswordReset, signInWithPassword, signOut } =
  await import('./actions');

const USER_ID = '00000000-0000-4000-8000-000000000001';
const authError = (status: number, code?: string) =>
  Object.assign(new Error(`auth ${status}`), { name: 'AuthApiError', status, code });

const capture = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  dbState.rows = [{ disabledAt: null }];
  setSentryCapture(capture);
  auth.signInWithPassword.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
  auth.signOut.mockResolvedValue({ error: null });
  auth.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
  auth.exchangeCodeForSession.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
  auth.getUser.mockResolvedValue({ data: { user: null }, error: null });
  auth.updateUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
});

describe('signInWithPassword', () => {
  it('signs in with a normalized email and records the login', async () => {
    await expect(signInWithPassword('  Ana@Example.TEST ', 'pw-123456')).resolves.toEqual({
      ok: true,
      data: undefined,
    });
    expect(auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'ana@example.test',
      password: 'pw-123456',
    });
    expect(updateSet).toHaveBeenCalledWith({ lastLoginAt: expect.any(Date) });
  });

  it('validates before calling Supabase', async () => {
    const result = await signInWithPassword('not-an-email', '');
    expect(result).toMatchObject({
      ok: false,
      error: {
        code: 'VALIDATION',
        fieldErrors: {
          email: ['Enter a valid email address.'],
          password: ['Enter your password.'],
        },
      },
    });
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it.each([
    ['wrong password', authError(400, 'invalid_credentials')],
    ['unconfirmed email', authError(400, 'email_not_confirmed')],
    ['unknown user (any 4xx)', authError(422)],
  ])('returns one generic error for %s', async (_label, error) => {
    auth.signInWithPassword.mockResolvedValue({ data: { user: null }, error });
    expect(await signInWithPassword('a@example.test', 'x')).toEqual({
      ok: false,
      error: { code: 'UNAUTHENTICATED', message: 'Incorrect email or password.' },
    });
  });

  it('reports rate limiting', async () => {
    auth.signInWithPassword.mockResolvedValue({
      data: { user: null },
      error: authError(429, 'over_request_rate_limit'),
    });
    expect(await signInWithPassword('a@example.test', 'x')).toMatchObject({
      ok: false,
      error: { code: 'RATE_LIMITED' },
    });
  });

  it('maps server failures to INTERNAL without leaking details', async () => {
    auth.signInWithPassword.mockResolvedValue({ data: { user: null }, error: authError(500) });
    expect(await signInWithPassword('a@example.test', 'x')).toEqual({
      ok: false,
      error: { code: 'INTERNAL', message: 'Something went wrong. Please try again.' },
    });
    expect(capture).toHaveBeenCalled();
  });

  it('signs a disabled user straight back out with the same generic error', async () => {
    dbState.rows = [{ disabledAt: new Date() }];
    expect(await signInWithPassword('a@example.test', 'pw-123456')).toEqual({
      ok: false,
      error: { code: 'UNAUTHENTICATED', message: 'Incorrect email or password.' },
    });
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(updateSet).not.toHaveBeenCalled();
  });

  it('lets a user without an app profile through (AUTH-04 guards app routes)', async () => {
    dbState.rows = [];
    expect(await signInWithPassword('a@example.test', 'pw')).toEqual({ ok: true, data: undefined });
    expect(updateSet).not.toHaveBeenCalled();
  });
});

describe('signOut', () => {
  it('ends the local session', async () => {
    expect(await signOut()).toEqual({ ok: true, data: undefined });
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('returns INTERNAL when Supabase fails', async () => {
    auth.signOut.mockResolvedValue({ error: authError(500) });
    expect(await signOut()).toMatchObject({ ok: false, error: { code: 'INTERNAL' } });
  });
});

describe('requestPasswordReset', () => {
  it('sends a link that returns to /reset/confirm on APP_URL', async () => {
    expect(await requestPasswordReset('Ana@Example.test')).toEqual({ ok: true, data: undefined });
    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith('ana@example.test', {
      redirectTo: 'https://app.example.test/reset/confirm',
    });
  });

  it('rejects malformed emails', async () => {
    expect(await requestPasswordReset('nope')).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION', fieldErrors: { email: ['Enter a valid email address.'] } },
    });
    expect(auth.resetPasswordForEmail).not.toHaveBeenCalled();
  });

  it('hides the per-address email limit, which only fires for real accounts', async () => {
    auth.resetPasswordForEmail.mockResolvedValue({
      data: null,
      error: authError(429, 'over_email_send_rate_limit'),
    });
    expect(await requestPasswordReset('a@example.test')).toEqual({ ok: true, data: undefined });
  });

  it('reports the per-client request limit', async () => {
    auth.resetPasswordForEmail.mockResolvedValue({
      data: null,
      error: authError(429, 'over_request_rate_limit'),
    });
    expect(await requestPasswordReset('a@example.test')).toMatchObject({
      ok: false,
      error: { code: 'RATE_LIMITED' },
    });
  });

  it('maps other failures to INTERNAL', async () => {
    auth.resetPasswordForEmail.mockResolvedValue({ data: null, error: authError(500) });
    expect(await requestPasswordReset('a@example.test')).toMatchObject({
      ok: false,
      error: { code: 'INTERNAL' },
    });
  });
});

describe('confirmPasswordReset', () => {
  it('exchanges the code and sets the new password', async () => {
    expect(await confirmPasswordReset('code-1', 'new-password-1')).toEqual({
      ok: true,
      data: undefined,
    });
    expect(auth.exchangeCodeForSession).toHaveBeenCalledWith('code-1');
    expect(auth.updateUser).toHaveBeenCalledWith({ password: 'new-password-1' });
  });

  it('validates the password before spending the single-use code', async () => {
    expect(await confirmPasswordReset('code-1', 'short')).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION', fieldErrors: { password: ['Use at least 8 characters.'] } },
    });
    expect(await confirmPasswordReset('', 'new-password-1')).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION', fieldErrors: { token: [expect.any(String)] } },
    });
    expect(auth.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it('rejects an invalid or expired code', async () => {
    auth.exchangeCodeForSession.mockResolvedValue({
      data: { user: null, session: null },
      error: authError(403, 'flow_state_expired'),
    });
    expect(await confirmPasswordReset('stale', 'new-password-1')).toEqual({
      ok: false,
      error: {
        code: 'UNAUTHENTICATED',
        message: 'This reset link is invalid or has expired. Request a new one.',
      },
    });
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it('retries with the recovery session when the code was already exchanged', async () => {
    auth.exchangeCodeForSession.mockResolvedValue({
      data: { user: null, session: null },
      error: authError(404, 'flow_state_not_found'),
    });
    auth.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
    expect(await confirmPasswordReset('used', 'new-password-1')).toEqual({
      ok: true,
      data: undefined,
    });
  });

  it('refuses disabled users', async () => {
    dbState.rows = [{ disabledAt: new Date() }];
    expect(await confirmPasswordReset('code-1', 'new-password-1')).toMatchObject({
      ok: false,
      error: { code: 'UNAUTHENTICATED' },
    });
    expect(auth.signOut).toHaveBeenCalled();
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it.each([
    ['weak_password', 'Choose a stronger password.'],
    ['same_password', 'Choose a password you have not used before.'],
  ])('maps %s to a password field error', async (code, message) => {
    auth.updateUser.mockResolvedValue({ data: { user: null }, error: authError(422, code) });
    expect(await confirmPasswordReset('code-1', 'new-password-1')).toEqual({
      ok: false,
      error: { code: 'VALIDATION', message, fieldErrors: { password: [message] } },
    });
  });

  it('maps rate limiting and server failures', async () => {
    auth.updateUser.mockResolvedValueOnce({ data: { user: null }, error: authError(429) });
    expect(await confirmPasswordReset('c', 'new-password-1')).toMatchObject({
      error: { code: 'RATE_LIMITED' },
    });
    auth.updateUser.mockResolvedValueOnce({ data: { user: null }, error: authError(500) });
    expect(await confirmPasswordReset('c', 'new-password-1')).toMatchObject({
      error: { code: 'INTERNAL' },
    });
  });
});
