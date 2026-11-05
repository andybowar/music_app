import { afterEach, describe, expect, it, vi } from 'vitest';

import { authOrigin, authOriginFor } from './authOrigin';

const STAGING = 'https://music-app-git-staging-team.vercel.app';
const base = {
  appUrl: STAGING,
  vercelEnv: 'preview',
  vercelUrl: 'music-ab12cd-team.vercel.app',
  vercelBranchUrl: 'music-app-git-staging-team.vercel.app',
};

describe('authOrigin', () => {
  it('production always comes back to APP_URL', () => {
    expect(
      authOrigin({
        ...base,
        appUrl: 'https://music.example.org',
        vercelEnv: 'production',
        host: 'music-ab12cd-team.vercel.app',
      }),
    ).toBe('https://music.example.org');
  });

  it('a preview comes back to the deployment or branch address it started on', () => {
    expect(authOrigin({ ...base, host: 'music-ab12cd-team.vercel.app' })).toBe(
      'https://music-ab12cd-team.vercel.app',
    );
    expect(authOrigin({ ...base, host: 'MUSIC-APP-GIT-STAGING-team.vercel.app' })).toBe(STAGING);
    expect(authOrigin({ ...base, host: 'music-ab12cd-team.vercel.app, proxy.internal' })).toBe(
      'https://music-ab12cd-team.vercel.app',
    );
  });

  it('falls back to APP_URL for an unknown or missing host', () => {
    expect(authOrigin({ ...base, host: 'evil.example.com' })).toBe(STAGING);
    expect(authOrigin({ ...base, host: 'other-project.vercel.app' })).toBe(STAGING);
    expect(authOrigin({ ...base, host: null })).toBe(STAGING);
    expect(authOrigin({ ...base, host: '' })).toBe(STAGING);
  });

  it('local dev keeps its own host and protocol', () => {
    expect(authOrigin({ appUrl: 'http://localhost:3000', host: 'localhost:3125' })).toBe(
      'http://localhost:3125',
    );
    expect(
      authOrigin({ appUrl: 'http://localhost:3000', host: '127.0.0.1:3000', proto: 'https' }),
    ).toBe('https://127.0.0.1:3000');
  });
});

describe('authOriginFor', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('reads the forwarded host and the Vercel system env', () => {
    vi.stubEnv('VERCEL_ENV', 'preview');
    vi.stubEnv('VERCEL_URL', 'music-ab12cd-team.vercel.app');
    vi.stubEnv('VERCEL_BRANCH_URL', 'music-app-git-staging-team.vercel.app');
    const headers = new Headers({
      host: 'internal:3000',
      'x-forwarded-host': 'music-ab12cd-team.vercel.app',
    });
    expect(authOriginFor(headers, STAGING)).toBe('https://music-ab12cd-team.vercel.app');
    expect(authOriginFor(new Headers({ host: 'music-ab12cd-team.vercel.app' }), STAGING)).toBe(
      'https://music-ab12cd-team.vercel.app',
    );
    vi.stubEnv('VERCEL_ENV', 'production');
    expect(authOriginFor(headers, 'https://music.example.org')).toBe('https://music.example.org');
  });
});
