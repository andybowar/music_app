// @vitest-environment node
import { resetEnvCacheForTests } from '@/lib/env';

vi.mock('server-only', () => ({}));

const cookieStore = {
  getAll: vi.fn(() => [{ name: 'sb', value: 'v' }]),
  set: vi.fn(),
};
vi.mock('next/headers', () => ({ cookies: vi.fn(async () => cookieStore) }));

const createServerClient = vi.fn((..._args: unknown[]) => ({ kind: 'server' }));
const createBrowserClient = vi.fn((..._args: unknown[]) => ({ kind: 'browser' }));
vi.mock('@supabase/ssr', () => ({ createServerClient, createBrowserClient }));

const createClient = vi.fn((..._args: unknown[]) => ({ kind: 'service' }));
vi.mock('@supabase/supabase-js', () => ({ createClient }));

type CookieOpts = {
  cookies: {
    getAll: () => unknown;
    setAll: (c: { name: string; value: string; options: object }[]) => void;
  };
};

beforeEach(() => {
  vi.clearAllMocks();
  resetEnvCacheForTests();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:54321');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-key');
  vi.stubEnv('DATABASE_URL', 'postgresql://postgres:postgres@127.0.0.1:54322/postgres');
  vi.stubEnv('APP_URL', 'http://127.0.0.1:3000');
  vi.stubEnv('CRON_SECRET', 'cron');
});
afterAll(() => vi.unstubAllEnvs());

describe('createServerSupabase', () => {
  it('creates an anon cookie-bound client', async () => {
    const { createServerSupabase } = await import('./server');
    await createServerSupabase();
    const [url, key, opts] = createServerClient.mock.calls[0] as [string, string, CookieOpts];
    expect(url).toBe('http://127.0.0.1:54321');
    expect(key).toBe('anon-key');
    expect(opts.cookies.getAll()).toEqual([{ name: 'sb', value: 'v' }]);
    opts.cookies.setAll([{ name: 'a', value: '1', options: { path: '/' } }]);
    expect(cookieStore.set).toHaveBeenCalledWith('a', '1', { path: '/' });
  });

  it('ignores cookie writes outside actions/route handlers', async () => {
    cookieStore.set.mockImplementationOnce(() => {
      throw new Error('read-only');
    });
    const { createServerSupabase } = await import('./server');
    await createServerSupabase();
    const opts = createServerClient.mock.calls[0]?.[2] as CookieOpts;
    expect(() => opts.cookies.setAll([{ name: 'a', value: '1', options: {} }])).not.toThrow();
  });
});

describe('createServiceSupabase', () => {
  it('is re-exported from server.ts and uses the service key without sessions', async () => {
    const { createServiceSupabase } = await import('./server');
    createServiceSupabase();
    expect(createClient).toHaveBeenCalledWith('http://127.0.0.1:54321', 'service-key', {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  });
});

describe('createBrowserSupabase', () => {
  it('returns a singleton', async () => {
    const { createBrowserSupabase } = await import('./client');
    const a = createBrowserSupabase();
    const b = createBrowserSupabase();
    expect(a).toBe(b);
    expect(createBrowserClient).toHaveBeenCalledTimes(1);
    expect(createBrowserClient).toHaveBeenCalledWith('http://127.0.0.1:54321', 'anon-key');
  });
});
