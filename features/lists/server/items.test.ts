// @vitest-environment node
// Unit: the checks that run before any DB work. DB paths are in items.int.test.ts.
import type { AppUser } from '@/types/domain';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ActionError } from '@/lib/action';

vi.mock('server-only', () => ({}));

const requireUser = vi.fn<() => Promise<AppUser>>();
vi.mock('@/lib/auth', () => ({ requireUser: () => requireUser() }));

const withTx = vi.fn();
vi.mock('@/lib/db', () => ({ withTx: (...args: unknown[]) => withTx(...args) }));

const { addListItem, removeListItem, reorderList, updateListItem } = await import('./items');

const LIST = '11111111-1111-4111-8111-111111111111';
const SONG = '22222222-2222-4222-8222-222222222222';
const ITEM = '33333333-3333-4333-8333-333333333333';

const user: AppUser = {
  id: '44444444-4444-4444-8444-444444444444',
  email: 'x@example.test',
  name: 'Test',
  branchId: null,
  role: 'member',
  authProvider: 'password',
  disabledAt: null,
  accessStatus: 'approved',
};

beforeEach(() => {
  requireUser.mockReset();
  withTx.mockReset();
  requireUser.mockResolvedValue(user);
});

async function expectValidation(promise: Promise<unknown>, field: string) {
  const result = await promise;
  expect(result).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
  expect((result as { error: { fieldErrors?: object } }).error.fieldErrors).toHaveProperty(field);
  expect(withTx).not.toHaveBeenCalled();
}

describe('before the database', () => {
  it('passes requireUser failures through', async () => {
    requireUser.mockRejectedValue(new ActionError('UNAUTHENTICATED', 'Sign in.'));
    for (const call of [
      () => addListItem(LIST, SONG),
      () => removeListItem(ITEM),
      () => reorderList(LIST, [ITEM]),
      () => updateListItem(ITEM, {}),
    ]) {
      expect(await call()).toEqual({
        ok: false,
        error: { code: 'UNAUTHENTICATED', message: 'Sign in.' },
      });
    }
    expect(withTx).not.toHaveBeenCalled();
  });

  it('rejects malformed ids', async () => {
    await expectValidation(addListItem('nope', SONG), '(root)');
    await expectValidation(addListItem(LIST, 'nope'), '(root)');
    await expectValidation(removeListItem('nope'), '(root)');
    await expectValidation(updateListItem('nope', {}), '(root)');
    await expectValidation(reorderList(LIST, ['nope']), '0');
  });

  it('rejects duplicate ids in a reorder', async () => {
    await expectValidation(reorderList(LIST, [ITEM, ITEM]), '(root)');
  });

  it.each([
    ['a bad key', { overrideKey: 'H' }, 'overrideKey'],
    ['a BPM out of range', { overrideBpm: 19 }, 'overrideBpm'],
    ['a fractional BPM', { overrideBpm: 90.5 }, 'overrideBpm'],
    ['an unknown energy', { overrideEnergy: 'loud' }, 'overrideEnergy'],
    ['a bad resource id', { resourceId: 'nope' }, 'resourceId'],
    ['notes over 500 chars', { notes: 'x'.repeat(501) }, 'notes'],
  ])('rejects a patch with %s', async (_label, patch, field) => {
    await expectValidation(updateListItem(ITEM, patch as never), field);
  });

  it('runs valid input in a transaction', async () => {
    withTx.mockResolvedValue(undefined);
    expect(await reorderList(LIST, [ITEM])).toEqual({ ok: true, data: undefined });
    expect(withTx).toHaveBeenCalledTimes(1);
  });
});
