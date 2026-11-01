// @vitest-environment node
// Unit: input checks and the write-permission paths, with a fake transaction. Queries against
// real rows (ordering, scopes, ListDetail assembly) are in lists.int.test.ts.
import type { AppUser, ListType, Role } from '@/types/domain';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ActionError } from '@/lib/action';

vi.mock('server-only', () => ({}));

const requireUser = vi.fn<() => Promise<AppUser>>();
vi.mock('@/lib/auth', () => ({ requireUser: () => requireUser() }));

const withTx = vi.fn();
const getDb = vi.fn();
vi.mock('@/lib/db', () => ({
  withTx: (...args: unknown[]) => withTx(...args),
  getDb: () => getDb(),
}));

const { createList, deleteList, getList, listLists, renameList } = await import('./lists');

const LIST = '11111111-1111-4111-8111-111111111111';
const BRANCH = '22222222-2222-4222-8222-222222222222';
const OTHER_BRANCH = '33333333-3333-4333-8333-333333333333';

function makeUser(role: Role, branchId: string | null = BRANCH): AppUser {
  return {
    id: '44444444-4444-4444-8444-444444444444',
    email: 'x@example.test',
    name: 'Test',
    branchId,
    role,
    authProvider: 'password',
    disabledAt: null,
    accessStatus: 'approved',
  };
}

const OTHER_USER = '55555555-5555-4555-8555-555555555555';

interface LockedRow {
  type: ListType;
  ownerId: string;
  branchId: string | null;
}

/** A fake `Tx`: the locked SELECT yields `row` (or nothing); UPDATE records what was set. */
function fakeTx(row: LockedRow | undefined) {
  const updates: Array<Record<string, unknown>> = [];
  const tx = {
    select: () => ({
      from: () => ({ where: () => ({ for: async () => (row ? [row] : []) }) }),
    }),
    update: () => ({
      set: (values: Record<string, unknown>) => {
        updates.push(values);
        return { where: async () => undefined };
      },
    }),
  };
  withTx.mockImplementation(async (fn: (t: typeof tx) => unknown) => fn(tx));
  return updates;
}

let user: AppUser;

beforeEach(() => {
  requireUser.mockReset();
  withTx.mockReset();
  getDb.mockReset();
  user = makeUser('member');
  requireUser.mockImplementation(async () => user);
});

async function expectValidation(promise: Promise<unknown>, field: string) {
  const result = await promise;
  expect(result).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
  expect((result as { error: { fieldErrors?: object } }).error.fieldErrors).toHaveProperty(field);
}

describe('before the database', () => {
  it('passes requireUser failures through the actions', async () => {
    requireUser.mockRejectedValue(new ActionError('UNAUTHENTICATED', 'Sign in.'));
    for (const call of [
      () => createList({ type: 'playlist', name: 'x' }),
      () => renameList(LIST, 'x'),
      () => deleteList(LIST),
    ]) {
      expect(await call()).toEqual({
        ok: false,
        error: { code: 'UNAUTHENTICATED', message: 'Sign in.' },
      });
    }
    expect(withTx).not.toHaveBeenCalled();
    expect(getDb).not.toHaveBeenCalled();
  });

  it('read helpers rethrow requireUser failures', async () => {
    requireUser.mockRejectedValue(new ActionError('UNAUTHENTICATED', 'Sign in.'));
    await expect(getList(LIST)).rejects.toThrow('Sign in.');
    await expect(listLists({ scope: 'mine' })).rejects.toThrow('Sign in.');
  });

  it.each([
    ['a setlist without a date', { type: 'setlist', name: 'Sunday' }, 'eventDate'],
    ['an empty name', { type: 'playlist', name: '   ' }, 'name'],
    ['a name over 120 chars', { type: 'playlist', name: 'x'.repeat(121) }, 'name'],
    ['a bad date', { type: 'setlist', name: 'x', eventDate: '2026-13-01' }, 'eventDate'],
    ['an unknown type', { type: 'mixtape', name: 'x' }, 'type'],
  ])('createList rejects %s', async (_label, input, field) => {
    await expectValidation(createList(input as never), field);
    expect(getDb).not.toHaveBeenCalled();
  });

  it('createList is denied to a user who may not create lists', async () => {
    user = { ...makeUser('member'), disabledAt: '2026-01-01T00:00:00Z' };
    const result = await createList({ type: 'playlist', name: 'x' });
    expect(result).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
    expect(getDb).not.toHaveBeenCalled();
  });

  it('renameList and deleteList reject malformed input', async () => {
    await expectValidation(renameList('nope', 'x'), 'id');
    await expectValidation(renameList(LIST, ''), 'name');
    await expectValidation(renameList(LIST, 'x', '01/02/2026'), 'eventDate');
    await expectValidation(deleteList('nope'), '(root)');
    expect(withTx).not.toHaveBeenCalled();
  });

  it('getList returns null for a malformed id without querying', async () => {
    expect(await getList('nope')).toBeNull();
    expect(getDb).not.toHaveBeenCalled();
  });

  it('listLists rejects an unknown scope or type', async () => {
    await expect(listLists({ scope: 'everyone' as never })).rejects.toThrow();
    await expect(listLists({ scope: 'all', type: 'mixtape' as never })).rejects.toThrow();
    expect(getDb).not.toHaveBeenCalled();
  });
});

describe('write permissions (renameList / deleteList)', () => {
  const ownPlaylist: LockedRow = {
    type: 'playlist',
    ownerId: makeUser('member').id,
    branchId: BRANCH,
  };
  const othersPlaylist: LockedRow = { type: 'playlist', ownerId: OTHER_USER, branchId: BRANCH };
  const branchSetlist: LockedRow = { type: 'setlist', ownerId: OTHER_USER, branchId: BRANCH };
  const otherBranchSetlist: LockedRow = {
    type: 'setlist',
    ownerId: OTHER_USER,
    branchId: OTHER_BRANCH,
  };

  it('NOT_FOUND for a missing (or soft-deleted) list', async () => {
    fakeTx(undefined);
    expect(await deleteList(LIST)).toEqual({
      ok: false,
      error: { code: 'NOT_FOUND', message: 'List not found.' },
    });
  });

  it("another user's playlist looks missing", async () => {
    const updates = fakeTx(othersPlaylist);
    expect(await renameList(LIST, 'x')).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
    expect(updates).toHaveLength(0);
  });

  it("a member may not change another member's setlist", async () => {
    const updates = fakeTx(branchSetlist);
    expect(await renameList(LIST, 'x')).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
    expect(await deleteList(LIST)).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
    expect(updates).toHaveLength(0);
  });

  it('a same-branch music leader may rename and delete a setlist', async () => {
    user = makeUser('music_leader');
    const updates = fakeTx(branchSetlist);
    expect(await renameList(LIST, '  Easter  ')).toEqual({ ok: true, data: undefined });
    expect(await deleteList(LIST)).toEqual({ ok: true, data: undefined });
    expect(updates[0]).toMatchObject({ name: 'Easter' });
    expect(updates[0]).not.toHaveProperty('eventDate');
    expect(updates[1]).toHaveProperty('deletedAt');
  });

  it("a music leader may not change another branch's setlist", async () => {
    user = makeUser('music_leader');
    fakeTx(otherBranchSetlist);
    expect(await renameList(LIST, 'x')).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
  });

  it('an admin may change any list', async () => {
    user = makeUser('admin', null);
    fakeTx(othersPlaylist);
    expect(await deleteList(LIST)).toEqual({ ok: true, data: undefined });
  });

  it('the owner may set or clear a playlist date', async () => {
    const updates = fakeTx(ownPlaylist);
    expect((await renameList(LIST, 'x', '2026-12-24')).ok).toBe(true);
    expect((await renameList(LIST, 'x', null)).ok).toBe(true);
    expect(updates[0]).toMatchObject({ eventDate: '2026-12-24' });
    expect(updates[1]).toMatchObject({ eventDate: null });
  });

  it('a setlist date cannot be cleared', async () => {
    user = makeUser('music_leader');
    const updates = fakeTx(branchSetlist);
    await expectValidation(renameList(LIST, 'x', null), 'eventDate');
    expect(updates).toHaveLength(0);
  });
});
