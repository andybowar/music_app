// @vitest-environment node
import { expect, test } from 'vitest';

import { patchPostgrestSpec } from './patchSpec';

const spec = {
  swagger: '2.0',
  host: '0.0.0.0:3000',
  basePath: '/',
  schemes: ['http'],
  info: { version: '12.2.3' },
  paths: { '/songs': {} },
};

test('points the spec at the public Supabase REST URL', () => {
  const patched = patchPostgrestSpec(spec, 'http://127.0.0.1:54321');
  expect(patched).toMatchObject({
    host: '127.0.0.1:54321',
    basePath: '/rest/v1',
    schemes: ['http'],
    paths: { '/songs': {} },
  });
  expect(patched.info).toMatchObject({ version: '12.2.3' });
});

test('handles https and a trailing slash', () => {
  const patched = patchPostgrestSpec(spec, 'https://abc.supabase.co/');
  expect(patched).toMatchObject({
    host: 'abc.supabase.co',
    basePath: '/rest/v1',
    schemes: ['https'],
  });
});

test('does not modify the input spec', () => {
  patchPostgrestSpec(spec, 'http://127.0.0.1:54321');
  expect(spec.host).toBe('0.0.0.0:3000');
});
