// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, expect, test } from 'vitest';

import { discoverRoutes, routeFromPageFile } from './pages';

test.each([
  ['page.tsx', { path: '/', needsSignIn: false }],
  ['(auth)/login/page.tsx', { path: '/login', needsSignIn: false }],
  ['(auth)/reset/confirm/page.tsx', { path: '/reset/confirm', needsSignIn: false }],
  ['(app)/library/page.tsx', { path: '/library', needsSignIn: true }],
  ['dev/atoms/page.tsx', { path: '/dev/atoms', needsSignIn: false }],
])('%s → %o', (file, expected) => {
  expect(routeFromPageFile(file)).toEqual(expected);
});

test('skips dynamic routes', () => {
  expect(routeFromPageFile('(app)/songs/[id]/page.tsx')).toBeNull();
  expect(routeFromPageFile('share/[token]/page.tsx')).toBeNull();
});

const dir = mkdtempSync(join(tmpdir(), 'dev-routes-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

test('discoverRoutes finds pages recursively, ignores other files, and sorts', () => {
  const files = [
    'page.tsx',
    'layout.tsx',
    'dev/tokens/page.tsx',
    'dev/tokens/TokensGallery.tsx',
    '(auth)/login/page.tsx',
    '(app)/songs/[id]/page.tsx',
    'api/cron/usage/route.ts',
  ];
  for (const f of files) {
    mkdirSync(join(dir, f, '..'), { recursive: true });
    writeFileSync(join(dir, f), '');
  }
  expect(discoverRoutes(dir).map((r) => r.path)).toEqual(['/', '/dev/tokens', '/login']);
});
