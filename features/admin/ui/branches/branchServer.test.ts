// Unit (ADM-02): the branch actions' guard rails in features/admin/server.ts: auth, permissions,
// validation, and mapping a racing unique violation to an inline field error. DB behaviour is in
// branchServer.int.test.ts. (Kept in ADM-02's own folder; server.ts is a touched file.)
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
  withTx: vi.fn((): Promise<unknown> => {
    throw new Error('unexpected DB access');
  }),
}));
vi.mock('@/lib/db', () => db);
vi.mock('@/lib/supabase/server', () => ({ createServiceSupabase: vi.fn() }));
vi.mock('@/lib/env', () => ({ env: { APP_URL: 'http://localhost:3000' } }));

const { deleteBranch, listBranches, upsertBranch } = await import('@/features/admin/server');

const ME = '20000000-0000-4000-8000-000000000001';
const BRANCH = '10000000-0000-4000-8000-000000000001';
const valid = { name: 'Servant', code: 'SV', ssoGroup: 'pop-branch-sv' };

function signInAs(role: Role) {
  const base = fixtureUsers[0];
  if (!base) throw new Error('fixture users missing');
  const user: AppUser = { ...base, id: ME, role, disabledAt: null, accessStatus: 'approved' };
  auth.requireUser.mockResolvedValue(user);
}

/** What postgres-js throws for a unique violation, optionally wrapped like Drizzle does. */
function uniqueError(constraint: string, wrapped = false): Error {
  const pg = Object.assign(new Error('duplicate key'), {
    code: '23505',
    constraint_name: constraint,
  });
  return wrapped ? new Error('Failed query', { cause: pg }) : pg;
}

beforeEach(() => {
  auth.requireUser.mockReset();
  db.getDb.mockClear();
  db.withTx.mockClear();
});

test('signed out: actions return UNAUTHENTICATED and the read helper throws', async () => {
  auth.requireUser.mockRejectedValue(new ActionError('UNAUTHENTICATED', 'Sign in.'));
  expect(await upsertBranch(valid)).toMatchObject({
    ok: false,
    error: { code: 'UNAUTHENTICATED' },
  });
  expect(await deleteBranch(BRANCH)).toMatchObject({
    ok: false,
    error: { code: 'UNAUTHENTICATED' },
  });
  await expect(listBranches()).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
});

describe.each(['member', 'contributor', 'music_leader'] as const)('%s (non-admin)', (role) => {
  beforeEach(() => signInAs(role));

  test('is FORBIDDEN before any DB work', async () => {
    expect(await upsertBranch(valid)).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
    expect(await deleteBranch(BRANCH)).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
    await expect(listBranches()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(db.withTx).not.toHaveBeenCalled();
    expect(db.getDb).not.toHaveBeenCalled();
  });
});

describe('admin', () => {
  beforeEach(() => signInAs('admin'));

  test('invalid input is VALIDATION with field errors, before any DB work', async () => {
    expect(await upsertBranch({ name: ' ', code: 'S1', ssoGroup: 'x'.repeat(201) })).toMatchObject({
      ok: false,
      error: {
        code: 'VALIDATION',
        fieldErrors: {
          name: ['Enter a name'],
          code: ['Use 2 or 3 letters, like SV'],
          ssoGroup: expect.any(Array),
        },
      },
    });
    expect(await upsertBranch({ ...valid, code: 'ABCD' })).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION', fieldErrors: { code: expect.any(Array) } },
    });
    expect(await upsertBranch({ ...valid, id: 'not-a-uuid' })).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION' },
    });
    expect(await deleteBranch('not-a-uuid')).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION' },
    });
    expect(db.withTx).not.toHaveBeenCalled();
  });

  test('a lower-case code and blank SSO group pass validation and reach the DB', async () => {
    db.withTx.mockResolvedValueOnce({ id: BRANCH });
    expect(await upsertBranch({ name: 'Servant', code: ' sv ', ssoGroup: '  ' })).toEqual({
      ok: true,
      data: { id: BRANCH },
    });
    expect(db.withTx).toHaveBeenCalledOnce();
  });

  test.each([
    ['branches_name_key', 'name', false],
    ['branches_code_key', 'code', true],
    ['branches_sso_group_key', 'ssoGroup', true],
  ])('a racing %s violation is CONFLICT on %s', async (constraint, field, wrapped) => {
    db.withTx.mockRejectedValueOnce(uniqueError(constraint, wrapped));
    const result = await upsertBranch(valid);
    expect(result).toMatchObject({ ok: false, error: { code: 'CONFLICT' } });
    if (result.ok) throw new Error('expected failure');
    expect(Object.keys(result.error.fieldErrors ?? {})).toEqual([field]);
  });

  test('an unknown unique violation is CONFLICT without field errors; other errors are INTERNAL', async () => {
    db.withTx.mockRejectedValueOnce(uniqueError('something_else'));
    const conflict = await upsertBranch(valid);
    expect(conflict).toMatchObject({ ok: false, error: { code: 'CONFLICT' } });
    expect(conflict.ok ? null : conflict.error.fieldErrors).toBeUndefined();

    db.withTx.mockRejectedValueOnce(new Error('boom'));
    expect(await upsertBranch(valid)).toMatchObject({ ok: false, error: { code: 'INTERNAL' } });
  });
});
