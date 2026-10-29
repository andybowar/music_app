// @vitest-environment node
import { ROLES, type AppUser, type ListType, type Role } from '@/types/domain';

import { assertCan, can, type Action, type PermCtx } from './permissions';

// ---------------------------------------------------------------------------------------
// The matrix below is a line-by-line transcription of contracts/permissions.md § Actions.
// Columns: member | contributor | music_leader | admin. Cell text is copied verbatim.
// `list:read` is split into its two contract rows (setlist / playlist); those rows only
// apply when `ctx.list.type` matches. Combined rows (`theme:merge` / `theme:synonyms`, …)
// are expanded to one line per action.
// ---------------------------------------------------------------------------------------
type Cell = '✓' | '' | 'owner' | 'owner, or same-branch setlist' | 'if list:write' | '←';
type Row = readonly [
  action: Action,
  listType: ListType | null,
  cells: readonly [Cell, Cell, Cell, Cell],
];

const MATRIX: readonly Row[] = [
  ['song:read', null, ['✓', '✓', '✓', '✓']],
  ['song:write', null, ['', '✓', '✓', '✓']],
  ['song:delete', null, ['', '', '', '✓']],
  ['song:set_added_by', null, ['', '', '', '✓']],
  ['resource:read', null, ['✓', '✓', '✓', '✓']],
  ['resource:write', null, ['', '✓', '✓', '✓']],
  ['theme:create', null, ['', '✓', '✓', '✓']],
  ['theme:merge', null, ['', '', '✓', '✓']],
  ['theme:synonyms', null, ['', '', '✓', '✓']],
  ['composer:create', null, ['', '✓', '✓', '✓']],
  ['composer:merge', null, ['', '', '✓', '✓']],
  ['usage:write', null, ['', '✓', '✓', '✓']],
  ['list:create', null, ['✓', '✓', '✓', '✓']],
  ['list:read', 'setlist', ['✓', '✓', '✓', '✓']],
  ['list:read', 'playlist', ['owner', 'owner', 'owner', '✓']],
  ['list:write', null, ['owner', 'owner', 'owner, or same-branch setlist', '✓']],
  ['share:create', null, ['if list:write', '←', '←', '✓']],
  ['share:revoke', null, ['if list:write', '←', '←', '✓']],
  ['audit:read', null, ['', '✓', '✓', '✓']],
  ['admin:users', null, ['', '', '', '✓']],
  ['admin:branches', null, ['', '', '', '✓']],
  ['admin:import', null, ['', '', '', '✓']],
];

/** Every Action; the type assertion below fails to compile if one is missing. */
const ACTIONS = [
  'song:read',
  'song:write',
  'song:delete',
  'song:set_added_by',
  'resource:read',
  'resource:write',
  'theme:create',
  'theme:merge',
  'theme:synonyms',
  'composer:create',
  'composer:merge',
  'usage:write',
  'list:create',
  'list:read',
  'list:write',
  'share:create',
  'share:revoke',
  'audit:read',
  'admin:users',
  'admin:branches',
  'admin:import',
] as const satisfies readonly Action[];
type MissingAction = Exclude<Action, (typeof ACTIONS)[number]>;
const allActionsListed: [MissingAction] extends [never] ? true : false = true;

/** Actions whose outcome depends on `ctx.list` (for non-admins). */
const LIST_SCOPED: readonly Action[] = ['list:read', 'list:write', 'share:create', 'share:revoke'];

// ---------- Users and list contexts ----------
const BRANCH_A = '00000000-0000-4000-8000-00000000000a';
const BRANCH_B = '00000000-0000-4000-8000-00000000000b';
const ME = '00000000-0000-4000-8000-000000000001';
const OTHER = '00000000-0000-4000-8000-000000000002';

function makeUser(role: Role, overrides: Partial<AppUser> = {}): AppUser {
  return {
    id: ME,
    email: `${role}@example.org`,
    name: `Test ${role}`,
    branchId: BRANCH_A,
    role,
    authProvider: 'password',
    disabledAt: null,
    ...overrides,
  };
}

type ListCtx = NonNullable<PermCtx['list']>;
interface Scenario {
  name: string;
  userBranchId: string | null;
  list: ListCtx | null;
}

const LIST_SCENARIOS: readonly Scenario[] = [
  { name: 'no ctx', userBranchId: BRANCH_A, list: null },
  { name: 'empty ctx object', userBranchId: BRANCH_A, list: null },
  ...(['setlist', 'playlist'] as const).flatMap((type): Scenario[] => [
    {
      name: `own ${type}, same branch`,
      userBranchId: BRANCH_A,
      list: { type, ownerId: ME, branchId: BRANCH_A },
    },
    {
      name: `own ${type}, other branch`,
      userBranchId: BRANCH_A,
      list: { type, ownerId: ME, branchId: BRANCH_B },
    },
    {
      name: `own ${type}, no branch`,
      userBranchId: null,
      list: { type, ownerId: ME, branchId: null },
    },
    {
      name: `other's ${type}, same branch`,
      userBranchId: BRANCH_A,
      list: { type, ownerId: OTHER, branchId: BRANCH_A },
    },
    {
      name: `other's ${type}, other branch`,
      userBranchId: BRANCH_A,
      list: { type, ownerId: OTHER, branchId: BRANCH_B },
    },
    {
      name: `other's ${type}, list has no branch`,
      userBranchId: BRANCH_A,
      list: { type, ownerId: OTHER, branchId: null },
    },
    {
      name: `other's ${type}, user has no branch`,
      userBranchId: null,
      list: { type, ownerId: OTHER, branchId: BRANCH_A },
    },
    {
      name: `other's ${type}, neither has a branch`,
      userBranchId: null,
      list: { type, ownerId: OTHER, branchId: null },
    },
  ]),
];

function ctxFor(s: Scenario): PermCtx | undefined {
  if (s.list) return { list: s.list };
  return s.name === 'empty ctx object' ? {} : undefined;
}

/** Interprets one matrix cell for a given user and list context. */
function evalCell(action: Action, roleIndex: number, user: AppUser, list: ListCtx | null): boolean {
  const rows = MATRIX.filter(([a]) => a === action);
  // A ✓ on every row for this action (e.g. the admin column) is unconditional.
  if (rows.every(([, , cells]) => cells[roleIndex] === '✓')) return true;
  // Otherwise the cell depends on the list; with no list there is nothing to check, so deny.
  if (!list) return false;
  const row = rows.find(([, t]) => t === null || t === list.type)!;
  let cell = row[2][roleIndex]!;
  for (let i = roleIndex; cell === '←'; i--) cell = row[2][i - 1]!;
  switch (cell) {
    case '✓':
      return true;
    case '':
      return false;
    case 'owner':
      return list.ownerId === user.id;
    case 'owner, or same-branch setlist':
      return (
        list.ownerId === user.id ||
        (list.type === 'setlist' && user.branchId !== null && list.branchId === user.branchId)
      );
    case 'if list:write':
      return evalCell('list:write', roleIndex, user, list);
    default:
      throw new Error(`unhandled cell ${cell}`);
  }
}

// ---------- Tests ----------
describe('permission matrix transcription', () => {
  it('lists every Action exactly once (list:read once per list type)', () => {
    expect(allActionsListed).toBe(true);
    const actions = MATRIX.map(([a]) => a);
    expect(new Set(actions)).toEqual(new Set(ACTIONS));
    expect(actions.filter((a) => a === 'list:read')).toHaveLength(2);
    expect(actions.length).toBe(ACTIONS.length + 1);
  });

  it('uses the DB role order', () => {
    expect(ROLES).toEqual(['member', 'contributor', 'music_leader', 'admin']);
  });
});

const roleCases = ROLES.map((role, roleIndex) => ({ role, roleIndex }));

describe.each(roleCases)('can() as $role', ({ role, roleIndex }) => {
  const roleOnly = ACTIONS.filter((a) => !LIST_SCOPED.includes(a));
  it.each(roleOnly)('%s matches the matrix (with and without list ctx)', (action) => {
    const expected = evalCell(action, roleIndex, makeUser(role), null);
    for (const s of LIST_SCENARIOS) {
      expect(can(makeUser(role, { branchId: s.userBranchId }), action, ctxFor(s))).toBe(expected);
    }
  });

  const listCases = LIST_SCOPED.flatMap((action) => LIST_SCENARIOS.map((s) => ({ action, s })));
  it.each(listCases)('$action · $s.name', ({ action, s }) => {
    const user = makeUser(role, { branchId: s.userBranchId });
    expect(can(user, action, ctxFor(s))).toBe(evalCell(action, roleIndex, user, s.list));
  });
});

describe('spot checks against the contract text', () => {
  const setlist = (ownerId: string, branchId: string | null): PermCtx => ({
    list: { type: 'setlist', ownerId, branchId },
  });
  const playlist = (ownerId: string): PermCtx => ({
    list: { type: 'playlist', ownerId, branchId: BRANCH_A },
  });

  it('members can read every setlist but only their own playlists', () => {
    const m = makeUser('member');
    expect(can(m, 'list:read', setlist(OTHER, BRANCH_B))).toBe(true);
    expect(can(m, 'list:read', playlist(OTHER))).toBe(false);
    expect(can(m, 'list:read', playlist(ME))).toBe(true);
  });

  it('music leaders write same-branch setlists only, never others’ playlists', () => {
    const ml = makeUser('music_leader');
    expect(can(ml, 'list:write', setlist(OTHER, BRANCH_A))).toBe(true);
    expect(can(ml, 'share:create', setlist(OTHER, BRANCH_A))).toBe(true);
    expect(can(ml, 'list:write', setlist(OTHER, BRANCH_B))).toBe(false);
    expect(can(ml, 'list:write', playlist(OTHER))).toBe(false);
    expect(
      can(makeUser('music_leader', { branchId: null }), 'list:write', setlist(OTHER, null)),
    ).toBe(false);
  });

  it('contributors cannot write same-branch setlists they do not own', () => {
    expect(can(makeUser('contributor'), 'list:write', setlist(OTHER, BRANCH_A))).toBe(false);
  });

  it('admins can do everything, with or without ctx', () => {
    const a = makeUser('admin');
    for (const action of ACTIONS) {
      expect(can(a, action)).toBe(true);
      expect(can(a, action, playlist(OTHER))).toBe(true);
    }
  });

  it('theme merge is music_leader+ (SPEC §6 default)', () => {
    expect(can(makeUser('contributor'), 'theme:merge')).toBe(false);
    expect(can(makeUser('music_leader'), 'theme:merge')).toBe(true);
  });
});

describe('unauthenticated and disabled users', () => {
  const contexts: (PermCtx | undefined)[] = [
    undefined,
    { list: { type: 'setlist', ownerId: ME, branchId: BRANCH_A } },
    { list: { type: 'playlist', ownerId: ME, branchId: BRANCH_A } },
  ];

  it.each(ACTIONS)('null user is denied %s', (action) => {
    for (const ctx of contexts) expect(can(null, action, ctx)).toBe(false);
  });

  it.each(ROLES)('disabled %s is denied every action, even on own lists', (role) => {
    const user = makeUser(role, { disabledAt: '2026-01-01T00:00:00.000Z' });
    for (const action of ACTIONS) {
      for (const ctx of contexts) expect(can(user, action, ctx)).toBe(false);
    }
  });
});

describe('assertCan()', () => {
  it('returns when allowed', () => {
    expect(() => assertCan(makeUser('member'), 'song:read')).not.toThrow();
    expect(assertCan(makeUser('admin'), 'admin:users')).toBeUndefined();
  });

  it.each([
    ['member writing a song', makeUser('member'), 'song:write' as Action],
    ['null user', null, 'song:read' as Action],
    [
      'disabled admin',
      makeUser('admin', { disabledAt: '2026-01-01T00:00:00.000Z' }),
      'admin:users' as Action,
    ],
  ])('throws a FORBIDDEN ActionError-shaped error for %s', (_label, user, action) => {
    let thrown: unknown;
    try {
      assertCan(user, action);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect(thrown).toMatchObject({ name: 'ActionError', code: 'FORBIDDEN' });
    expect((thrown as Error).message).toContain(action);
  });

  it('passes ctx through to can()', () => {
    const ctx: PermCtx = { list: { type: 'playlist', ownerId: OTHER, branchId: BRANCH_A } };
    expect(() => assertCan(makeUser('member'), 'list:write', ctx)).toThrow();
    expect(() => assertCan(makeUser('member', { id: OTHER }), 'list:write', ctx)).not.toThrow();
  });
});
