// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from 'vitest';

const runUsageJob = vi.fn();
let secret = 's3cret';

vi.mock('@/lib/usage/job', () => ({ runUsageJob: () => runUsageJob() }));
vi.mock('@/lib/env', () => ({
  env: {
    get CRON_SECRET() {
      return secret;
    },
  },
}));

const { isAuthorized } = await import('./authorize');
const { GET } = await import('./route');

const req = (auth?: string) =>
  new Request('http://localhost/api/cron/usage', {
    headers: auth ? { authorization: auth } : {},
  });

beforeEach(() => {
  secret = 's3cret';
  runUsageJob.mockReset();
  runUsageJob.mockResolvedValue({ updated: 7 });
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

describe('GET /api/cron/usage', () => {
  test('401 without a token, and the job does not run', async () => {
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(runUsageJob).not.toHaveBeenCalled();
  });

  test('401 with a wrong token', async () => {
    const res = await GET(req('Bearer nope'));
    expect(res.status).toBe(401);
    expect(runUsageJob).not.toHaveBeenCalled();
  });

  test('401 when the secret is empty', async () => {
    secret = '';
    const res = await GET(req('Bearer '));
    expect(res.status).toBe(401);
    expect(runUsageJob).not.toHaveBeenCalled();
  });

  test('runs the job and returns { updated } with the right token', async () => {
    const res = await GET(req('Bearer s3cret'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ updated: 7 });
    expect(runUsageJob).toHaveBeenCalledTimes(1);
  });

  test('a job failure propagates (Next reports it via onRequestError)', async () => {
    runUsageJob.mockRejectedValue(new Error('db down'));
    await expect(GET(req('Bearer s3cret'))).rejects.toThrow('db down');
  });
});
