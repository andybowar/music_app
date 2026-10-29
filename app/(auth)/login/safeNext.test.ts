import { describe, expect, it } from 'vitest';

import { DEFAULT_AFTER_LOGIN, safeNext } from './safeNext';

describe('safeNext', () => {
  it.each([
    ['/library', '/library'],
    ['/songs/123?tab=history', '/songs/123?tab=history'],
    ['/lists/abc#top', '/lists/abc#top'],
    [['/quick', '/admin'], '/quick'],
    ['/login-help', '/login-help'],
  ])('keeps same-origin path %j', (input, expected) => {
    expect(safeNext(input)).toBe(expected);
  });

  it.each([
    undefined,
    null,
    '',
    [],
    'library',
    'https://evil.test/library',
    '//evil.test',
    '/\\evil.test',
    '/\t/evil.test',
    '/\n/evil.test',
    'javascript:alert(1)',
    '/login',
    '/login?next=/library',
    '/reset/confirm',
    '/auth/callback',
  ])('falls back to /library for %j', (input) => {
    expect(safeNext(input)).toBe(DEFAULT_AFTER_LOGIN);
  });
});
