// @vitest-environment node
// Unit: permission and validation guards. These all reject before any DB access, so the DB
// is mocked to fail loudly if reached. DB behaviour is covered by composers.int.test.ts.
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { users as fixtureUsers } from '@/fixtures';
import { ActionError } from '@/lib/action';
import type { AppUser, Role } from '@/types/domain';

vi.mock('server-only', () => ({}));

const auth = vi.hoisted(() => ({ requireUser: vi.fn() }));
vi.mock('@/lib/auth', () => auth);

const unreachable = () => {
  throw new Error('DB must not be reached');
};
vi.mock('@/lib/db', () => ({ getDb: unreachable, withTx: unreachable }));

const { createComposer, mergeComposers, searchComposers, setComposerPop, setSongComposers } =
  await import('./composers');

const A = '30000000-0000-4000-8000-000000000001';
const B = '30000000-0000-4000-8000-000000000002';

function as(role: Role) {
  const base = fixtureUsers.find((u) => u.accessStatus === 'approved');
  if (!base) throw new Error('fixture user missing');
  auth.requireUser.mockResolvedValue({ ...base, role } satisfies AppUser);
}

beforeEach(() => {
  auth.requireUser.mockReset();
  as('admin');
});

describe('authentication', () => {
  test('signed-out callers get UNAUTHENTICATED, not a throw', async () => {
    auth.requireUser.mockRejectedValue(new ActionError('UNAUTHENTICATED', 'Sign in.'));
    expect(await createComposer('Jan Smith')).toMatchObject({
      ok: false,
      error: { code: 'UNAUTHENTICATED' },
    });
    await expect(searchComposers('ja')).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  });
});

describe('permissions', () => {
  test('members cannot create composers or set song composers', async () => {
    as('member');
    expect(await createComposer('Jan Smith')).toMatchObject({ ok: false });
    expect(await setSongComposers(A, [B])).toMatchObject({ ok: false });
  });

  test('contributors cannot merge or set the POP flag', async () => {
    as('contributor');
    expect(await mergeComposers(A, B)).toMatchObject({ ok: false });
    expect(await setComposerPop(A, 'past')).toMatchObject({ ok: false });
  });
});

describe('validation', () => {
  test('blank or over-long composer names are rejected', async () => {
    expect(await createComposer('   ')).toMatchObject({ error: { code: 'VALIDATION' } });
    expect(await createComposer('x'.repeat(201))).toMatchObject({
      error: { code: 'VALIDATION' },
    });
  });

  test('song composers need 1–10 distinct valid ids', async () => {
    for (const ids of [[], ['nope'], [A, A], [A, A.toUpperCase()], Array(11).fill(A)]) {
      expect(await setSongComposers(B, ids)).toMatchObject({ error: { code: 'VALIDATION' } });
    }
    expect(await setSongComposers('nope', [A])).toMatchObject({
      error: { code: 'VALIDATION', fieldErrors: { songId: expect.any(Array) } },
    });
  });

  test('POP flag must be none | past | current', async () => {
    expect(await setComposerPop(A, 'former' as never)).toMatchObject({
      error: { code: 'VALIDATION', fieldErrors: { pop: expect.any(Array) } },
    });
  });

  test('merging a composer into itself is rejected', async () => {
    expect(await mergeComposers(A, A.toUpperCase())).toMatchObject({
      error: { code: 'VALIDATION', fieldErrors: { dropId: expect.any(Array) } },
    });
    expect(await mergeComposers(A, 'nope')).toMatchObject({ error: { code: 'VALIDATION' } });
  });

  test('search prefixes longer than 200 chars are rejected', async () => {
    await expect(searchComposers('x'.repeat(201))).rejects.toThrow();
  });
});
