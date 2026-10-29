// @vitest-environment node
import { expect, test } from 'vitest';

import { isLocalSupabase, readSupabaseConfig } from './supabaseConfig';

test('returns the config with any trailing slash removed', () => {
  expect(
    readSupabaseConfig({
      NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321/',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'key',
    }),
  ).toEqual({ url: 'http://127.0.0.1:54321', anonKey: 'key' });
});

test.each([
  [{}],
  [{ NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321' }],
  [{ NEXT_PUBLIC_SUPABASE_URL: ' ', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'key' }],
])('returns null when a variable is missing or blank: %o', (env) => {
  expect(readSupabaseConfig(env)).toBeNull();
});

test.each([
  ['http://127.0.0.1:54321', true],
  ['http://localhost:54321', true],
  ['https://abc.supabase.co', false],
  ['https://localhost.example.com', false],
])('isLocalSupabase(%s) is %s', (url, expected) => {
  expect(isLocalSupabase({ url, anonKey: 'k' })).toBe(expected);
});

test('isLocalSupabase(null) is false', () => {
  expect(isLocalSupabase(null)).toBe(false);
});
