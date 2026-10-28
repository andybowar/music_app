// @vitest-environment node
import { EnvError, env, parseClientEnv, parseServerEnv, resetEnvCacheForTests } from './env';

const validServer = {
  SUPABASE_SERVICE_ROLE_KEY: 'service-key',
  DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
  APP_URL: 'http://127.0.0.1:3000',
  CRON_SECRET: 'cron',
};

const validClient = {
  NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
};

function catchEnvError(fn: () => unknown): EnvError {
  try {
    fn();
  } catch (error) {
    if (error instanceof EnvError) return error;
    throw error;
  }
  throw new Error('expected EnvError');
}

describe('parseServerEnv', () => {
  it('parses valid input with defaults', () => {
    expect(parseServerEnv(validServer)).toEqual({
      ...validServer,
      RESEND_API_KEY: undefined,
      SENTRY_DSN: undefined,
      FEATURE_SAML: false,
      SSO_PROVIDERS: [],
    });
  });

  it('names every missing variable in the error', () => {
    const error = catchEnvError(() => parseServerEnv({ APP_URL: 'http://x.test' }));
    expect(error.variables).toEqual(['SUPABASE_SERVICE_ROLE_KEY', 'DATABASE_URL', 'CRON_SECRET']);
    expect(error.message).toContain('SUPABASE_SERVICE_ROLE_KEY: is required');
    expect(error.message).toContain('DATABASE_URL: is required');
    expect(error.message).toContain('CRON_SECRET: is required');
    expect(error.message).toContain('.env.example');
  });

  it('treats empty strings as missing', () => {
    const error = catchEnvError(() => parseServerEnv({ ...validServer, CRON_SECRET: '  ' }));
    expect(error.variables).toEqual(['CRON_SECRET']);
  });

  it('rejects invalid URLs', () => {
    const error = catchEnvError(() => parseServerEnv({ ...validServer, APP_URL: 'not a url' }));
    expect(error.message).toContain('APP_URL: must be a valid URL');
  });

  it.each([
    ['true', true],
    ['TRUE', true],
    ['1', true],
    ['false', false],
    ['0', false],
    ['', false],
    [undefined, false],
  ])('parses FEATURE_SAML=%s as %s', (value, expected) => {
    expect(parseServerEnv({ ...validServer, FEATURE_SAML: value }).FEATURE_SAML).toBe(expected);
  });

  it('rejects a non-boolean FEATURE_SAML', () => {
    const error = catchEnvError(() => parseServerEnv({ ...validServer, FEATURE_SAML: 'yes' }));
    expect(error.variables).toEqual(['FEATURE_SAML']);
  });

  it.each([
    ['', []],
    [undefined, []],
    ['google', ['google']],
    [' Google , microsoft ,', ['google', 'microsoft']],
  ])('parses SSO_PROVIDERS=%j', (value, expected) => {
    expect(parseServerEnv({ ...validServer, SSO_PROVIDERS: value }).SSO_PROVIDERS).toEqual(
      expected,
    );
  });

  it('keeps optional vars when set', () => {
    const parsed = parseServerEnv({ ...validServer, RESEND_API_KEY: 're_1', SENTRY_DSN: 'dsn' });
    expect(parsed.RESEND_API_KEY).toBe('re_1');
    expect(parsed.SENTRY_DSN).toBe('dsn');
  });
});

describe('parseClientEnv', () => {
  it('parses valid input', () => {
    expect(parseClientEnv(validClient)).toEqual(validClient);
  });

  it('names missing public variables', () => {
    const error = catchEnvError(() => parseClientEnv({}));
    expect(error.variables).toEqual(['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY']);
  });
});

describe('env (server)', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    resetEnvCacheForTests();
  });
  afterAll(() => vi.unstubAllEnvs());

  function stub(vars: Record<string, string>) {
    for (const [k, v] of Object.entries(vars)) vi.stubEnv(k, v);
  }

  it('validates lazily: importing does not throw, access does', () => {
    stub({ ...validClient, ...validServer, CRON_SECRET: '' });
    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBe(validClient.NEXT_PUBLIC_SUPABASE_URL);
    expect(() => env.APP_URL).toThrowError(/CRON_SECRET: is required/);
  });

  it('returns parsed values', () => {
    stub({ ...validClient, ...validServer, FEATURE_SAML: 'true', SSO_PROVIDERS: 'google' });
    expect(env.FEATURE_SAML).toBe(true);
    expect(env.SSO_PROVIDERS).toEqual(['google']);
    expect(env.SUPABASE_SERVICE_ROLE_KEY).toBe('service-key');
  });

  it('is read-only', () => {
    expect(Object.isFrozen(env)).toBe(true);
  });
});

describe('env (browser)', () => {
  beforeEach(() => {
    resetEnvCacheForTests();
    vi.stubGlobal('window', {});
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', validClient.NEXT_PUBLIC_SUPABASE_URL);
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', validClient.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'secret');
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('exposes public variables', () => {
    expect(env.NEXT_PUBLIC_SUPABASE_ANON_KEY).toBe('anon-key');
  });

  it('refuses to read server variables, naming the variable', () => {
    expect(() => env.SUPABASE_SERVICE_ROLE_KEY).toThrowError(
      /env\.SUPABASE_SERVICE_ROLE_KEY is a server-only variable/,
    );
  });
});
