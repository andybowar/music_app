// Unit: the guard rails that run before any database work (auth, permissions,
// validation). DB behaviour is covered by server.int.test.ts.
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { users as fixtureUsers } from '@/fixtures';
import { ActionError } from '@/lib/action';
import type { AppUser, Role } from '@/types/domain';

vi.mock('server-only', () => ({}));

const auth = vi.hoisted(() => ({ requireUser: vi.fn() }));
vi.mock('@/lib/auth', () => auth);

const db = vi.hoisted(() => ({
  getDb: vi.fn(() => {
    throw new Error('unexpected DB access');
  }),
  withTx: vi.fn(() => {
    throw new Error('unexpected DB access');
  }),
}));
vi.mock('@/lib/db', () => db);

const { createTheme, mergeThemes, searchThemes, setSongThemes } = await import('./server');

const SONG = '10000000-0000-4000-8000-000000000001';
const THEME_A = '70000000-0000-4000-8000-000000000001';
const THEME_B = '70000000-0000-4000-8000-000000000002';

function userWith(role: Role): AppUser {
  const base = fixtureUsers[0];
  if (!base) throw new Error('fixture users missing');
  return { ...base, role, disabledAt: null, accessStatus: 'approved' };
}

function signInAs(role: Role) {
  auth.requireUser.mockResolvedValue(userWith(role));
}

beforeEach(() => {
  auth.requireUser.mockReset();
  db.getDb.mockClear();
  db.withTx.mockClear();
});

describe('signed out', () => {
  beforeEach(() => {
    auth.requireUser.mockRejectedValue(new ActionError('UNAUTHENTICATED', 'Sign in.'));
  });

  test('actions return UNAUTHENTICATED', async () => {
    for (const result of [
      await createTheme('glory'),
      await setSongThemes(SONG, []),
      await mergeThemes(THEME_A, THEME_B),
    ]) {
      expect(result).toMatchObject({ ok: false, error: { code: 'UNAUTHENTICATED' } });
    }
  });

  test('searchThemes throws', async () => {
    await expect(searchThemes('gl')).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    expect(db.getDb).not.toHaveBeenCalled();
  });
});

describe('permissions', () => {
  test('members cannot create, tag or merge', async () => {
    signInAs('member');
    expect(await createTheme('glory')).toMatchObject({ ok: false });
    expect(await setSongThemes(SONG, [])).toMatchObject({ ok: false });
    expect(await mergeThemes(THEME_A, THEME_B)).toMatchObject({ ok: false });
  });

  test('contributors cannot merge', async () => {
    signInAs('contributor');
    expect(await mergeThemes(THEME_A, THEME_B)).toMatchObject({ ok: false });
  });

  test('disabled users can do nothing', async () => {
    auth.requireUser.mockResolvedValue({
      ...userWith('admin'),
      disabledAt: '2026-01-01T00:00:00Z',
    });
    await expect(searchThemes('gl')).rejects.toThrow();
    expect(await createTheme('glory')).toMatchObject({ ok: false });
  });
});

describe('validation', () => {
  test('createTheme rejects blank and over-long names', async () => {
    signInAs('contributor');
    for (const name of ['   ', 'x'.repeat(61)]) {
      expect(await createTheme(name)).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
    }
    expect(db.withTx).not.toHaveBeenCalled();
  });

  test('setSongThemes rejects bad ids and sections', async () => {
    signInAs('contributor');
    expect(await setSongThemes('not-a-uuid', [])).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION', fieldErrors: { songId: expect.any(Array) } },
    });
    expect(
      // @ts-expect-error -- invalid section on purpose
      await setSongThemes(SONG, [{ section: 'tag', themeId: THEME_A }]),
    ).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION', fieldErrors: { 'entries.0.section': expect.any(Array) } },
    });
    expect(await setSongThemes(SONG, [{ section: 'chorus', themeId: 'nope' }])).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION', fieldErrors: { 'entries.0.themeId': expect.any(Array) } },
    });
    expect(db.withTx).not.toHaveBeenCalled();
  });

  test('mergeThemes rejects merging a theme into itself', async () => {
    signInAs('music_leader');
    expect(await mergeThemes(THEME_A, THEME_A)).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION', fieldErrors: { dropId: expect.any(Array) } },
    });
    expect(await mergeThemes(THEME_A, 'bad')).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION' },
    });
    expect(db.withTx).not.toHaveBeenCalled();
  });
});
