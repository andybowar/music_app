// @vitest-environment node
import { describe, expect, test } from 'vitest';

import {
  isDevGalleryAdminOnly,
  isDevGalleryEnabled,
  isDevGalleryPath,
  mayOpenDevGallery,
} from './devGallery';

test.each([
  [{ VERCEL_ENV: 'production', NODE_ENV: 'production' }, true],
  [{ VERCEL_ENV: 'preview', NODE_ENV: 'production' }, false],
  [{ VERCEL_ENV: 'development', NODE_ENV: 'development' }, false],
  [{ NODE_ENV: 'production' }, false],
  [{ NODE_ENV: 'development' }, false],
] as const)('admin-only for %o → %s', (env, expected) => {
  expect(isDevGalleryAdminOnly(env as NodeJS.ProcessEnv)).toBe(expected);
  // Page-level checks always pass; the gates are middleware.ts and app/dev/layout.tsx.
  expect(isDevGalleryEnabled(env as NodeJS.ProcessEnv)).toBe(true);
});

test.each([
  ['/dev', true],
  ['/dev/tokens', true],
  ['/dev/a/b', true],
  ['/devices', false],
  ['/library', false],
  ['/', false],
  [null, false],
] as const)('isDevGalleryPath(%s) → %s', (path, expected) => {
  expect(isDevGalleryPath(path)).toBe(expected);
});

describe('mayOpenDevGallery', () => {
  const admin = { access_status: 'approved', role: 'admin', disabled_at: null };
  test('approved, enabled admin', () => expect(mayOpenDevGallery(admin)).toBe(true));
  test.each([
    ['no row', null],
    ['music leader', { ...admin, role: 'music_leader' }],
    ['member', { ...admin, role: 'member' }],
    ['pending admin', { ...admin, access_status: 'pending' }],
    ['rejected admin', { ...admin, access_status: 'rejected' }],
    ['disabled admin', { ...admin, disabled_at: '2026-01-01T00:00:00Z' }],
  ] as const)('%s → false', (_name, row) => expect(mayOpenDevGallery(row)).toBe(false));
});
