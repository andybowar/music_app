// @vitest-environment node
import { afterEach, describe, expect, test, vi } from 'vitest';

import { isAuthorized } from './authorize';
import { GET } from './route';

const req = (auth?: string) =>
  new Request('http://localhost/api/debug/sentry', {
    headers: auth ? { authorization: auth } : {},
  });

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('isAuthorized', () => {
  test('matches only the exact bearer token', () => {
    expect(isAuthorized('Bearer s3cret', 's3cret')).toBe(true);
    expect(isAuthorized('Bearer s3cre', 's3cret')).toBe(false);
    expect(isAuthorized('Bearer s3cretX', 's3cret')).toBe(false);
    expect(isAuthorized('s3cret', 's3cret')).toBe(false);
  });

  test('false without a header or without a configured secret', () => {
    expect(isAuthorized(null, 's3cret')).toBe(false);
    expect(isAuthorized('Bearer ', '')).toBe(false);
    expect(isAuthorized('Bearer undefined', undefined)).toBe(false);
  });
});

describe('GET /api/debug/sentry', () => {
  test('404 without a token', () => {
    vi.stubEnv('CRON_SECRET', 's3cret');
    expect(GET(req()).status).toBe(404);
  });

  test('404 with a wrong token', () => {
    vi.stubEnv('CRON_SECRET', 's3cret');
    expect(GET(req('Bearer nope')).status).toBe(404);
  });

  test('404 when CRON_SECRET is unset', () => {
    vi.stubEnv('CRON_SECRET', '');
    expect(GET(req('Bearer ')).status).toBe(404);
  });

  test('throws the test error with the right token', () => {
    vi.stubEnv('CRON_SECRET', 's3cret');
    expect(() => GET(req('Bearer s3cret'))).toThrow('Sentry test error');
  });
});
