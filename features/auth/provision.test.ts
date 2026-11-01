// @vitest-environment node
import type { User } from '@supabase/supabase-js';

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

// A stand-in Drizzle transaction: every builder method chains, and awaiting a
// chain resolves the next queued result. Writes record what they were given.
const results: unknown[][] = [];
const writes: Array<{ op: 'update' | 'insert'; values: Record<string, unknown> }> = [];
function chain(op?: 'update' | 'insert'): unknown {
  const self: Record<string, unknown> = {};
  for (const m of ['from', 'where', 'for', 'limit', 'returning']) self[m] = () => self;
  self.set = self.values = (values: Record<string, unknown>) => {
    writes.push({ op: op!, values });
    return self;
  };
  self.then = (resolve: (v: unknown) => void, reject: (e: unknown) => void) => {
    const next = results.shift();
    return next ? Promise.resolve(next).then(resolve) : reject(new Error('unexpected query'));
  };
  return self;
}
const tx = { select: () => chain(), update: () => chain('update'), insert: () => chain('insert') };
vi.mock('@/lib/db', () => ({ withTx: (fn: (t: typeof tx) => unknown) => fn(tx) }));

const {
  DISABLED_MESSAGE,
  EMAIL_CONFLICT_MESSAGE,
  branchForGroups,
  currentOidcIdentity,
  displayNameFor,
  idpGroupsFromUser,
  provisionUser,
  toAuthProvider,
} = await import('./provision');

const USER_ID = '00000000-0000-4000-8000-000000000001';
const SV = '00000000-0000-4000-8000-0000000000a1';
const OR = '00000000-0000-4000-8000-0000000000a2';
const BRANCHES = [
  { id: SV, ssoGroup: 'pop-branch-sv' },
  { id: OR, ssoGroup: 'POP-Branch-OR' },
  { id: '00000000-0000-4000-8000-0000000000a3', ssoGroup: null },
];

function authUser(overrides: Partial<User> = {}): User {
  return {
    id: USER_ID,
    email: 'Ana@Example.TEST',
    aud: 'authenticated',
    created_at: '2026-01-01T00:00:00Z',
    app_metadata: { provider: 'azure' },
    user_metadata: { full_name: 'Ana Example' },
    identities: [
      {
        id: 'azure-sub-1',
        identity_id: 'i1',
        user_id: USER_ID,
        provider: 'azure',
        identity_data: { sub: 'azure-sub-1' },
        last_sign_in_at: '2026-10-01T00:00:00Z',
      },
    ],
    ...overrides,
  } as User;
}

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: USER_ID,
    email: 'ana@example.test',
    name: 'Ana Example',
    branchId: null,
    role: 'member',
    authProvider: 'microsoft',
    ssoSubject: 'azure-sub-1',
    lastLoginAt: null,
    disabledAt: null,
    accessStatus: 'pending',
    createdAt: new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  results.length = 0;
  writes.length = 0;
});

describe('toAuthProvider', () => {
  it.each([
    ['google', 'google'],
    ['azure', 'microsoft'],
    ['email', null],
    ['sso:abc', null],
    [undefined, null],
  ])('%s → %s', (input, expected) => expect(toAuthProvider(input)).toBe(expected));
});

describe('currentOidcIdentity', () => {
  it('picks the most recently used Google/Microsoft identity', () => {
    const user = authUser({
      identities: [
        {
          id: 'g',
          identity_id: '1',
          user_id: USER_ID,
          provider: 'google',
          identity_data: { sub: 'g-sub' },
          last_sign_in_at: '2026-10-02T00:00:00Z',
        },
        {
          id: 'e',
          identity_id: '2',
          user_id: USER_ID,
          provider: 'email',
          last_sign_in_at: '2026-10-09T00:00:00Z',
        },
        {
          id: 'a',
          identity_id: '3',
          user_id: USER_ID,
          provider: 'azure',
          identity_data: {},
          last_sign_in_at: '2026-10-05T00:00:00Z',
        },
      ],
    });
    expect(currentOidcIdentity(user)).toEqual({ provider: 'microsoft', subject: 'a' });
  });

  it('falls back to updated_at and ignores identities without a subject', () => {
    const user = authUser({
      identities: [
        { id: '', identity_id: '1', user_id: USER_ID, provider: 'azure', identity_data: {} },
        {
          id: 'g',
          identity_id: '2',
          user_id: USER_ID,
          provider: 'google',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ],
    });
    expect(currentOidcIdentity(user)).toEqual({ provider: 'google', subject: 'g' });
  });

  it('returns null without an OIDC identity', () => {
    expect(currentOidcIdentity(authUser({ identities: undefined }))).toBeNull();
    expect(
      currentOidcIdentity(
        authUser({
          identities: [{ id: 'e', identity_id: '1', user_id: USER_ID, provider: 'email' }],
        }),
      ),
    ).toBeNull();
  });
});

describe('idpGroupsFromUser', () => {
  it('collects groups from metadata, custom claims and app metadata, de-duplicated', () => {
    const user = authUser({
      user_metadata: {
        groups: [' pop-branch-sv ', 7, ''],
        custom_claims: { groups: 'pop-branch-or' },
      },
      app_metadata: { groups: ['pop-branch-sv', 'leaders'] },
    });
    expect(idpGroupsFromUser(user)).toEqual(['pop-branch-sv', 'pop-branch-or', 'leaders']);
  });

  it('returns [] when there are no group claims', () => {
    expect(idpGroupsFromUser(authUser())).toEqual([]);
    expect(
      idpGroupsFromUser({ user_metadata: undefined, app_metadata: undefined } as unknown as User),
    ).toEqual([]);
  });
});

describe('branchForGroups', () => {
  it('maps the first matching group, case-insensitively', () => {
    expect(branchForGroups(['other', 'pop-branch-or', 'pop-branch-sv'], BRANCHES)).toBe(OR);
    expect(branchForGroups([' POP-BRANCH-SV '], BRANCHES)).toBe(SV);
  });

  it('returns null for unknown or no groups', () => {
    expect(branchForGroups(['unknown'], BRANCHES)).toBeNull();
    expect(branchForGroups([], BRANCHES)).toBeNull();
  });
});

describe('displayNameFor', () => {
  it('prefers full_name, then name, then the email local part', () => {
    expect(displayNameFor({ user_metadata: { full_name: ' Ana E ', name: 'x' } }, 'a@x.test')).toBe(
      'Ana E',
    );
    expect(displayNameFor({ user_metadata: { name: 'Ana' } }, 'a@x.test')).toBe('Ana');
    expect(displayNameFor({ user_metadata: {} }, 'ana@x.test')).toBe('ana');
  });
});

describe('provisionUser', () => {
  it('creates a member of the mapped branch on first login (known group)', async () => {
    results.push([], [], BRANCHES, [row({ branchId: SV, lastLoginAt: new Date() })]);
    const user = await provisionUser(authUser(), ['pop-branch-sv']);
    expect(writes).toEqual([
      {
        op: 'insert',
        values: {
          id: USER_ID,
          email: 'ana@example.test',
          name: 'Ana Example',
          branchId: SV,
          role: 'member',
          authProvider: 'microsoft',
          ssoSubject: 'azure-sub-1',
          lastLoginAt: expect.any(Date),
          accessStatus: 'pending',
        },
      },
    ]);
    expect(user).toMatchObject({
      id: USER_ID,
      branchId: SV,
      role: 'member',
      disabledAt: null,
      accessStatus: 'pending',
    });
  });

  it('creates a pending user with no branch when no group is mapped (unknown group)', async () => {
    results.push([], [], BRANCHES, [row()]);
    const user = await provisionUser(authUser(), ['unknown']);
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({
      op: 'insert',
      values: { branchId: null, role: 'member', accessStatus: 'pending' },
    });
    expect(user).toMatchObject({ branchId: null, accessStatus: 'pending' });
  });

  it('creates a pending user with no groups without reading branches', async () => {
    results.push([], [], [row()]);
    await provisionUser(authUser(), []);
    expect(writes[0]).toMatchObject({ op: 'insert', values: { branchId: null } });
    expect(results).toEqual([]);
  });

  it('never changes the access status of an existing user', async () => {
    results.push([row({ accessStatus: 'rejected' })], [row({ accessStatus: 'rejected' })]);
    const user = await provisionUser(authUser(), []);
    expect(writes[0]!.values).not.toHaveProperty('accessStatus');
    expect(user.accessStatus).toBe('rejected');
  });

  it('updates an existing user; unknown group leaves branch null', async () => {
    results.push([row({ authProvider: 'password', ssoSubject: null })], BRANCHES, [row()]);
    const user = await provisionUser(authUser(), ['unknown']);
    expect(writes).toEqual([
      {
        op: 'update',
        values: {
          authProvider: 'microsoft',
          ssoSubject: 'azure-sub-1',
          lastLoginAt: expect.any(Date),
          branchId: null,
        },
      },
    ]);
    expect(user.branchId).toBeNull();
  });

  it('keeps an existing branch and role even if the groups say otherwise', async () => {
    results.push([row({ branchId: OR, role: 'admin' })], [row({ branchId: OR, role: 'admin' })]);
    const user = await provisionUser(authUser(), ['pop-branch-sv']);
    expect(writes[0]!.values.branchId).toBe(OR);
    expect(writes[0]!.values).not.toHaveProperty('role');
    expect(user.role).toBe('admin');
  });

  it('rejects a disabled user without writing', async () => {
    results.push([row({ disabledAt: new Date('2026-05-01T00:00:00Z') })]);
    await expect(provisionUser(authUser(), ['pop-branch-sv'])).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: DISABLED_MESSAGE,
    });
    expect(writes).toEqual([]);
  });

  it('rejects when another account already has the email', async () => {
    results.push([], [{ id: 'other' }]);
    await expect(provisionUser(authUser(), ['pop-branch-sv'])).rejects.toMatchObject({
      code: 'CONFLICT',
      message: EMAIL_CONFLICT_MESSAGE,
    });
  });

  it('rejects users without an OIDC identity or an email', async () => {
    await expect(provisionUser(authUser({ identities: [] }), [])).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
    await expect(provisionUser(authUser({ email: undefined }), [])).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
  });

  it('serializes disabledAt as an ISO string', async () => {
    // Defensive path in toAppUser; a row comes back disabled only in a race.
    results.push([row()], [row({ disabledAt: new Date('2026-05-01T00:00:00Z') })]);
    const user = await provisionUser(authUser(), []);
    expect(user.disabledAt).toBe('2026-05-01T00:00:00.000Z');
  });
});
