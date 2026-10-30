// Unit: the guard rails that run before any database work (auth, permissions, validation,
// self-decisions). DB behaviour is covered by server.int.test.ts.
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

const supabase = vi.hoisted(() => ({
  createServiceSupabase: vi.fn(() => {
    throw new Error('unexpected Supabase access');
  }),
}));
vi.mock('@/lib/supabase/server', () => supabase);
vi.mock('@/lib/env', () => ({ env: { APP_URL: 'http://localhost:3000' } }));

const { approveUser, inviteUser, listBranchOptions, listUsers, rejectUser, updateUser } =
  await import('./server');

const ME = '20000000-0000-4000-8000-000000000001';
const OTHER = '20000000-0000-4000-8000-000000000009';

function signInAs(role: Role) {
  const base = fixtureUsers[0];
  if (!base) throw new Error('fixture users missing');
  const user: AppUser = { ...base, id: ME, role, disabledAt: null, accessStatus: 'approved' };
  auth.requireUser.mockResolvedValue(user);
}

const invite = { email: 'new@example.com', name: 'New Person' };

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
      await inviteUser(invite),
      await updateUser(OTHER, { role: 'member' }),
      await approveUser(OTHER, { role: 'member', branchId: null }),
      await rejectUser(OTHER),
    ]) {
      expect(result).toMatchObject({ ok: false, error: { code: 'UNAUTHENTICATED' } });
    }
  });

  test('read helpers throw', async () => {
    await expect(listUsers()).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    await expect(listBranchOptions()).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  });
});

describe.each(['member', 'contributor', 'music_leader'] as const)('%s (non-admin)', (role) => {
  beforeEach(() => signInAs(role));

  test('every action returns FORBIDDEN', async () => {
    for (const result of [
      await inviteUser(invite),
      await updateUser(OTHER, { role: 'admin' }),
      await approveUser(OTHER, { role: 'member', branchId: null }),
      await rejectUser(OTHER),
    ]) {
      expect(result).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
    }
    expect(db.withTx).not.toHaveBeenCalled();
  });

  test('read helpers throw FORBIDDEN', async () => {
    await expect(listUsers({ accessStatus: 'pending' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(listBranchOptions()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(db.getDb).not.toHaveBeenCalled();
  });
});

describe('admin', () => {
  beforeEach(() => signInAs('admin'));

  test("can't approve or reject their own account", async () => {
    expect(await approveUser(ME, { role: 'admin', branchId: null })).toMatchObject({
      ok: false,
      error: { code: 'FORBIDDEN' },
    });
    expect(await rejectUser(ME)).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
    expect(db.withTx).not.toHaveBeenCalled();
  });

  test("can't disable themselves", async () => {
    expect(await updateUser(ME, { disabled: true })).toMatchObject({
      ok: false,
      error: { code: 'FORBIDDEN' },
    });
    expect(db.withTx).not.toHaveBeenCalled();
  });

  test('invalid input is VALIDATION before any DB work', async () => {
    expect(await inviteUser({ email: 'nope', name: ' ' })).toMatchObject({
      ok: false,
      error: {
        code: 'VALIDATION',
        fieldErrors: { email: expect.any(Array), name: expect.any(Array) },
      },
    });
    expect(await updateUser('not-a-uuid', { role: 'member' })).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION' },
    });
    expect(await updateUser(OTHER, { role: 'owner' as Role })).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION' },
    });
    expect(await updateUser(OTHER, { name: 'x' } as unknown as { role: Role })).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION' },
    });
    expect(await approveUser(OTHER, { role: 'admin', branchId: 'x' })).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION' },
    });
    await expect(listUsers({ accessStatus: 'gone' as 'pending' })).rejects.toBeTruthy();
    expect(db.withTx).not.toHaveBeenCalled();
    expect(db.getDb).not.toHaveBeenCalled();
  });
});
