import { AuthError } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('server-only', () => ({}));

const auth = { signInWithSSO: vi.fn() };
vi.mock('@/lib/supabase/server', () => ({ createServerSupabase: vi.fn(async () => ({ auth })) }));

const envMock = { APP_URL: 'https://app.example.test', FEATURE_SAML: false };
vi.mock('@/lib/env', () => ({ env: envMock }));

const { ActionError } = await import('@/lib/action');
const {
  SAML_NO_PROVIDER_MESSAGE,
  SAML_UNAVAILABLE_MESSAGE,
  currentSamlIdentity,
  isSamlEnabled,
  samlDomainFrom,
  startSamlSignIn,
} = await import('./saml');

function authError(status: number, code?: string): AuthError {
  return new AuthError('boom', status, code);
}

beforeEach(() => {
  vi.clearAllMocks();
  envMock.FEATURE_SAML = false;
  auth.signInWithSSO.mockResolvedValue({
    data: { url: 'https://idp.example.org/sso?SAMLRequest=x' },
    error: null,
  });
});

describe('samlDomainFrom', () => {
  it.each([
    ['ann@example.org', 'example.org'],
    ['  Ann.Lee@Mail.Example.ORG ', 'mail.example.org'],
    ['example.org', 'example.org'],
    ['odd"local@part@example.org', 'example.org'],
    ['x@my-org.co.uk', 'my-org.co.uk'],
  ])('%j → %j', (input, expected) => expect(samlDomainFrom(input)).toBe(expected));

  it.each([
    '',
    '   ',
    '@example.org',
    'ann@',
    'ann@localhost',
    'ann@exa mple.org',
    'ann@-bad.org',
    'ann@bad-.org',
    'ann@example..org',
    'ann@exa_mple.org',
    'ann@10.0.0.1',
    `ann@${'a'.repeat(64)}.org`,
    `${'a'.repeat(250)}.org`,
    `ann@${'a.'.repeat(130)}org`,
    'a'.repeat(321),
  ])('rejects %j', (input) => expect(samlDomainFrom(input)).toBeNull());
});

describe('isSamlEnabled', () => {
  it('follows FEATURE_SAML', () => {
    expect(isSamlEnabled()).toBe(false);
    envMock.FEATURE_SAML = true;
    expect(isSamlEnabled()).toBe(true);
  });
});

describe('startSamlSignIn', () => {
  it('flag off: refuses without calling Supabase', async () => {
    await expect(startSamlSignIn('ann@example.org')).rejects.toEqual(
      new ActionError('FORBIDDEN', SAML_UNAVAILABLE_MESSAGE),
    );
    // Even a malformed email gets the same answer: nothing about SAML runs.
    await expect(startSamlSignIn('nope')).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(auth.signInWithSSO).not.toHaveBeenCalled();
  });

  describe('flag on', () => {
    beforeEach(() => {
      envMock.FEATURE_SAML = true;
    });

    it('asks Supabase for the IdP URL of the email domain, via the callback', async () => {
      expect(await startSamlSignIn('Ann@Example.org', '/songs/1?tab=files')).toEqual({
        url: 'https://idp.example.org/sso?SAMLRequest=x',
      });
      expect(auth.signInWithSSO).toHaveBeenCalledWith({
        domain: 'example.org',
        options: {
          redirectTo: 'https://app.example.test/auth/callback?next=%2Fsongs%2F1%3Ftab%3Dfiles',
          skipBrowserRedirect: true,
        },
      });
    });

    it('sanitizes next', async () => {
      await startSamlSignIn('example.org', '//evil.test');
      expect(auth.signInWithSSO).toHaveBeenCalledWith(
        expect.objectContaining({
          options: expect.objectContaining({
            redirectTo: 'https://app.example.test/auth/callback?next=%2Flibrary',
          }),
        }),
      );
    });

    it('rejects a malformed email before calling Supabase', async () => {
      await expect(startSamlSignIn('not an email')).rejects.toMatchObject({ name: 'ZodError' });
      await expect(startSamlSignIn(42 as never)).rejects.toMatchObject({ name: 'ZodError' });
      expect(auth.signInWithSSO).not.toHaveBeenCalled();
    });

    it.each([
      ['sso_provider_not_found', 404],
      ['saml_idp_not_found', 400],
      ['saml_provider_disabled', 400],
      [undefined, 404],
    ])('no provider for the domain (%s, %i): friendly NOT_FOUND', async (code, status) => {
      auth.signInWithSSO.mockResolvedValueOnce({ data: null, error: authError(status, code) });
      await expect(startSamlSignIn('ann@unknown.example')).rejects.toEqual(
        new ActionError('NOT_FOUND', SAML_NO_PROVIDER_MESSAGE),
      );
    });

    it('maps rate limits and rethrows anything else', async () => {
      auth.signInWithSSO.mockResolvedValueOnce({
        data: null,
        error: authError(429, 'over_request_rate_limit'),
      });
      await expect(startSamlSignIn('example.org')).rejects.toMatchObject({ code: 'RATE_LIMITED' });

      auth.signInWithSSO.mockResolvedValueOnce({
        data: null,
        error: authError(400, 'over_request_rate_limit'),
      });
      await expect(startSamlSignIn('example.org')).rejects.toMatchObject({ code: 'RATE_LIMITED' });

      const boom = authError(500);
      auth.signInWithSSO.mockResolvedValueOnce({ data: null, error: boom });
      await expect(startSamlSignIn('example.org')).rejects.toBe(boom);

      auth.signInWithSSO.mockResolvedValueOnce({ data: { url: '' }, error: null });
      await expect(startSamlSignIn('example.org')).rejects.toThrow('returned no URL');
    });
  });
});

describe('currentSamlIdentity', () => {
  const identity = (over: Record<string, unknown>) =>
    ({
      id: 'identity-id',
      provider: 'sso:prov-1',
      identity_data: { sub: 'name-id-1' },
      last_sign_in_at: '2026-01-01T00:00:00Z',
      ...over,
    }) as never;

  it('returns null without SAML identities', () => {
    expect(currentSamlIdentity({ identities: undefined })).toBeNull();
    expect(currentSamlIdentity({ identities: [identity({ provider: 'google' })] })).toBeNull();
    expect(currentSamlIdentity({ identities: [identity({ provider: 'sso:' })] })).toBeNull();
  });

  it('picks the most recently used SAML identity', () => {
    expect(
      currentSamlIdentity({
        identities: [
          identity({ provider: 'google' }),
          identity({ provider: 'sso:old', identity_data: { sub: 'a' } }),
          identity({
            provider: 'sso:new',
            identity_data: { sub: 'b' },
            last_sign_in_at: '2026-06-01T00:00:00Z',
          }),
          identity({
            provider: 'sso:older',
            identity_data: { sub: 'c' },
            last_sign_in_at: null,
            updated_at: '2025-01-01T00:00:00Z',
          }),
        ],
      }),
    ).toEqual({ providerId: 'new', subject: 'b' });
  });

  it('falls back to the identity id when there is no sub', () => {
    expect(
      currentSamlIdentity({
        identities: [identity({ identity_data: {}, last_sign_in_at: null, updated_at: null })],
      }),
    ).toEqual({ providerId: 'prov-1', subject: 'identity-id' });
    expect(
      currentSamlIdentity({ identities: [identity({ identity_data: undefined, id: '' })] }),
    ).toBeNull();
  });
});
