import { describe, expect, test } from 'vitest';

import { assertLocalTargets, isLocalUrl, SeedTargetError } from './guard';

describe('isLocalUrl', () => {
  test.each([
    'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
    'postgresql://postgres:postgres@localhost:54322/postgres',
    'postgres://u:p@[::1]:5432/db',
    'http://127.0.0.1:54321',
    'http://LOCALHOST:54321',
  ])('local: %s', (url) => expect(isLocalUrl(url)).toBe(true));

  test.each([
    'postgresql://postgres:secret@db.abcdefgh.supabase.co:5432/postgres',
    'postgresql://postgres:secret@aws-0-us-east-1.pooler.supabase.com:6543/postgres',
    'https://abcdefgh.supabase.co',
    'http://127.0.0.1.example.com',
    'http://localhost.evil.test',
    'not a url',
    '',
  ])('not local: %s', (url) => expect(isLocalUrl(url)).toBe(false));
});

describe('assertLocalTargets', () => {
  const local = { A: 'http://127.0.0.1:1', B: 'postgresql://u:p@localhost/db' };
  const remote = { A: 'http://127.0.0.1:1', B: 'postgresql://u:hunter2@db.example.com/db' };

  test('passes for local targets', () => {
    expect(() => assertLocalTargets(local, false)).not.toThrow();
  });

  test('refuses a remote target, naming the variable but not the URL', () => {
    expect(() => assertLocalTargets(remote, false)).toThrow(SeedTargetError);
    expect(() => assertLocalTargets(remote, false)).toThrow(/B is not localhost.*--force/);
    expect(() => assertLocalTargets(remote, false)).not.toThrow(/hunter2|example\.com/);
  });

  test('--force allows a remote target', () => {
    expect(() => assertLocalTargets(remote, true)).not.toThrow();
  });

  test('a missing target is an error even with force', () => {
    expect(() => assertLocalTargets({ A: undefined, B: '' }, true)).toThrow(/A, B to be set/);
  });
});
