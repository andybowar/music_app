// @vitest-environment node
import type { User, UserIdentity } from '@supabase/supabase-js';
import type { Tx } from '@/lib/db';

import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { findIdentity, identityVouchesFor, isLinkedTo, resolveSsoAccount, revokeUserSessions } =
  await import('./linking');

const USER_ID = '00000000-0000-4000-8000-000000000001';
const EMAIL = 'ana@example.test';
const GOOGLE = { provider: 'google', supabaseProvider: 'google', subject: 'g-sub' } as const;

function identity(data: Record<string, unknown>, overrides: Partial<UserIdentity> = {}) {
  return {
    id: 'g-sub',
    identity_id: 'i1',
    user_id: USER_ID,
    provider: 'google',
    identity_data: data,
    ...overrides,
  } as UserIdentity;
}

const verified = identity({ sub: 'g-sub', email: EMAIL, email_verified: true });

function authUser(identities: UserIdentity[] = [verified]): Pick<User, 'id' | 'identities'> {
  return { id: USER_ID, identities };
}

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: USER_ID,
    email: EMAIL,
    name: 'Ana',
    branchId: null,
    role: 'member',
    authProvider: 'password',
    ssoSubject: null,
    lastLoginAt: null,
    disabledAt: null,
    accessStatus: 'pending',
    accessDecidedBy: null,
    accessDecidedAt: null,
    createdAt: new Date(),
    ...overrides,
  };
}

// A stand-in transaction: each awaited select chain resolves the next queued result, and
// the WHERE clauses are rendered so the tests can check what was asked.
const results: unknown[][] = [];
const wheres: string[] = [];
const dialect = new PgDialect();
function chain(): unknown {
  const self: Record<string, unknown> = {};
  for (const m of ['from', 'for', 'limit']) self[m] = () => self;
  self.where = (clause: SQL) => {
    const { sql, params } = dialect.sqlToQuery(clause);
    wheres.push(`${sql} ${JSON.stringify(params)}`);
    return self;
  };
  self.then = (resolve: (v: unknown) => void, reject: (e: unknown) => void) => {
    const next = results.shift();
    return next ? Promise.resolve(next).then(resolve) : reject(new Error('unexpected query'));
  };
  return self;
}
const tx = { select: () => chain() } as unknown as Tx;

beforeEach(() => {
  results.length = 0;
  wheres.length = 0;
});

describe('findIdentity', () => {
  it('matches on provider and subject (sub claim, else identity id)', () => {
    const azure = identity({ sub: 'g-sub' }, { provider: 'azure' });
    const bySub = identity({ sub: 'g-sub' }, { id: 'other-id' });
    expect(findIdentity({ identities: [azure, bySub] }, GOOGLE)).toBe(bySub);
    const byId = identity({});
    expect(findIdentity({ identities: [byId] }, GOOGLE)).toBe(byId);
  });

  it('returns null when no identity matches', () => {
    expect(findIdentity({ identities: [identity({ sub: 'someone-else' })] }, GOOGLE)).toBeNull();
    expect(findIdentity({ identities: undefined }, GOOGLE)).toBeNull();
  });
});

describe('identityVouchesFor', () => {
  it('accepts a verified claim for the same email, case-insensitively', () => {
    expect(identityVouchesFor(verified, EMAIL)).toBe(true);
    expect(
      identityVouchesFor(identity({ email: ' Ana@Example.TEST ', email_verified: 'true' }), EMAIL),
    ).toBe(true);
  });

  it.each([
    ['email_verified false', { email: EMAIL, email_verified: false }],
    ['email_verified missing', { email: EMAIL }],
    ['email_verified a truthy non-boolean', { email: EMAIL, email_verified: 1 }],
    ['another email', { email: 'mallory@example.test', email_verified: true }],
    ['no email claim', { email_verified: true }],
  ])('rejects %s', (_label, data) => {
    expect(identityVouchesFor(identity(data), EMAIL)).toBe(false);
  });

  it('rejects a missing identity or identity_data', () => {
    expect(identityVouchesFor(null, EMAIL)).toBe(false);
    expect(identityVouchesFor(identity(undefined as never), EMAIL)).toBe(false);
  });
});

describe('isLinkedTo', () => {
  it('is true only for the provider and subject recorded on the row', () => {
    expect(isLinkedTo({ authProvider: 'google', ssoSubject: 'g-sub' }, GOOGLE)).toBe(true);
    expect(isLinkedTo({ authProvider: 'google', ssoSubject: 'other' }, GOOGLE)).toBe(false);
    expect(isLinkedTo({ authProvider: 'microsoft', ssoSubject: 'g-sub' }, GOOGLE)).toBe(false);
    expect(isLinkedTo({ authProvider: 'password', ssoSubject: null }, GOOGLE)).toBe(false);
  });
});

describe('resolveSsoAccount', () => {
  it('links a verified identity to the existing account, whatever its status', async () => {
    for (const accessStatus of ['pending', 'rejected', 'approved']) {
      const existing = row({ accessStatus });
      results.push([existing]);
      await expect(resolveSsoAccount(tx, authUser(), EMAIL, GOOGLE)).resolves.toEqual({
        kind: 'existing',
        row: existing,
      });
    }
    // Only the signed-in user's own row is read; no second account is looked for.
    expect(wheres).toHaveLength(3);
    expect(wheres[0]).toContain(USER_ID);
  });

  it('refuses a new link the IdP did not verify', async () => {
    const unverified = identity({ sub: 'g-sub', email: EMAIL, email_verified: false });
    results.push([row()]);
    await expect(resolveSsoAccount(tx, authUser([unverified]), EMAIL, GOOGLE)).resolves.toEqual({
      kind: 'unverified',
    });

    const otherEmail = identity({ sub: 'g-sub', email: 'x@example.test', email_verified: true });
    results.push([row()]);
    await expect(resolveSsoAccount(tx, authUser([otherEmail]), EMAIL, GOOGLE)).resolves.toEqual({
      kind: 'unverified',
    });

    // The identity on the session isn't the one being linked.
    results.push([row()]);
    await expect(resolveSsoAccount(tx, authUser([]), EMAIL, GOOGLE)).resolves.toEqual({
      kind: 'unverified',
    });
  });

  it('checks the email recorded on the account, not the one on the auth user', async () => {
    results.push([row({ email: 'renamed@example.test' })]);
    await expect(resolveSsoAccount(tx, authUser(), EMAIL, GOOGLE)).resolves.toEqual({
      kind: 'unverified',
    });
  });

  it('lets an already-linked identity back in without re-checking the claim', async () => {
    const linked = row({ authProvider: 'google', ssoSubject: 'g-sub' });
    results.push([linked]);
    await expect(resolveSsoAccount(tx, authUser([identity({})]), EMAIL, GOOGLE)).resolves.toEqual({
      kind: 'existing',
      row: linked,
    });
  });

  it('reports a disabled account before anything else', async () => {
    const disabled = row({ disabledAt: new Date(), authProvider: 'google', ssoSubject: 'g-sub' });
    results.push([disabled]);
    await expect(resolveSsoAccount(tx, authUser(), EMAIL, GOOGLE)).resolves.toEqual({
      kind: 'disabled',
      row: disabled,
    });

    // Even through an identity that would not be allowed to link.
    results.push([row({ disabledAt: new Date() })]);
    await expect(resolveSsoAccount(tx, authUser([]), EMAIL, GOOGLE)).resolves.toMatchObject({
      kind: 'disabled',
    });
  });

  it('refuses an email another account already has, case-insensitively', async () => {
    results.push([], [{ id: 'someone-else' }]);
    await expect(resolveSsoAccount(tx, authUser(), ' Ana@Example.TEST ', GOOGLE)).resolves.toEqual({
      kind: 'email_taken',
    });
    expect(wheres[1]).toMatch(/lower\(("users"\.)?"email"\) = \$1/);
    expect(wheres[1]).toContain(JSON.stringify([EMAIL]));
  });

  it('is new when neither the auth id nor the email has an account', async () => {
    results.push([], []);
    await expect(resolveSsoAccount(tx, authUser(), EMAIL, GOOGLE)).resolves.toEqual({
      kind: 'new',
    });
  });
});

describe('revokeUserSessions', () => {
  it("deletes the user's auth sessions and counts them", async () => {
    let query = '';
    const db = {
      execute: async (clause: SQL) => {
        const { sql, params } = dialect.sqlToQuery(clause);
        query = `${sql} ${JSON.stringify(params)}`;
        return [{ id: 's1' }, { id: 's2' }];
      },
    } as unknown as Tx;
    await expect(revokeUserSessions(db, USER_ID)).resolves.toBe(2);
    expect(query).toBe(
      `delete from auth.sessions where auth.sessions.user_id = $1 returning auth.sessions.id ["${USER_ID}"]`,
    );
  });
});
