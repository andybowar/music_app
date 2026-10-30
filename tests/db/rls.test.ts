// @vitest-environment node
// Integration (DB-05): RLS (db/migrations/0003_rls.sql + 0004_access_status.sql) and
// `can()` (lib/permissions.ts) agree for every role × action in contracts/permissions.md.
// Runs in the `integration` Vitest project (`tests/db/**/*.test.ts`). Needs local Supabase
// with migrations applied (`pnpm db:start && pnpm db:migrate`); CI's integration job does
// both. CI sets DATABASE_URL; locally it comes from .env.local.
//
// Each action maps to one or more SQL probes that exercise it the way a user's JWT would
// through PostgREST/Storage: `set local role authenticated` plus `request.jwt.claims`,
// inside a transaction that is always rolled back. A probe is "allowed" when it sees or
// changes at least one row; RLS rejections (SQLSTATE 42501) count as denied. For every
// subject (role × access status) and action (× list scenario for list-scoped actions),
// each probe must equal `can(user, action, ctx)`. Pending and rejected users must also be
// denied outright, by both sides.
//
// Fixtures are self-contained (created as `postgres`, BYPASSRLS, and removed afterwards)
// rather than taken from `pnpm db:seed`, so the suite needs no seeded database and can't
// be broken by seed data changes.
import { existsSync } from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';

import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { can, type Action, type PermCtx } from '@/lib/permissions';
import { ROLES, type AccessStatus, type AppUser, type ListType, type Role } from '@/types/domain';

if (!process.env.DATABASE_URL && existsSync('.env.local')) process.loadEnvFile('.env.local');

const sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });

const tag = randomUUID().slice(0, 8);

/** CR documenting that `can()` ignores `accessStatus` (contract: non-approved users can do nothing). */
const CR_ACCESS_STATUS = 'agent-spec/change-requests/DB-05-can-access-status.md';

function branchCode(): string {
  return [...randomBytes(3)].map((b) => String.fromCharCode(65 + (b % 26))).join('');
}

const STATUSES = ['approved', 'pending', 'rejected'] as const satisfies readonly AccessStatus[];

// Branch and owner ids are fixed up front so every `can()` input is known when tests are
// collected (needed to pick `test.fails` for the known mismatch).
const ids = {
  branchA: randomUUID(),
  branchB: randomUUID(),
  ownerA: randomUUID(), // approved member, branch A: owns the "another member's" lists
  ownerB: randomUUID(), // approved member, branch B
  song: '', // on lists; target of reads and edits
  spareSong: '', // unreferenced; target of soft/hard deletes
  songKey: '',
  resource: '',
  composer: '', // linked to song
  spareComposer: '', // unreferenced; target of merge deletes
  theme: '',
  audit: '',
  otherPlaylistA: '',
  otherSetlistA: '',
  otherSetlistB: '',
  object: `songs/${tag}/common/${randomUUID()}.pdf`,
};

interface Subject {
  key: string;
  user: AppUser;
  ownPlaylist: string;
  ownSetlist: string;
}

/** Subjects: every role × every access status, all in branch A. */
const SUBJECTS: Subject[] = STATUSES.flatMap((status) =>
  ROLES.map((role) => ({
    key: `${status} ${role}`,
    user: {
      id: randomUUID(),
      email: `rls-parity-${status}-${role}-${tag}@example.test`.replace(/_/g, '-'),
      name: `RLS parity ${status} ${role}`,
      branchId: ids.branchA,
      role,
      authProvider: 'password',
      disabledAt: null,
      accessStatus: status,
    },
    ownPlaylist: '',
    ownSetlist: '',
  })),
);

const ROLLBACK = Symbol('rollback');

/** Run `fn` as the API role `authenticated` with `userId`'s JWT, always rolled back. */
async function as<T>(userId: string, fn: (tx: postgres.TransactionSql) => Promise<T>): Promise<T> {
  let out: T | undefined;
  try {
    await sql.begin(async (tx) => {
      const claims = { sub: userId, role: 'authenticated', aud: 'authenticated' };
      await tx`select set_config('request.jwt.claims', ${JSON.stringify(claims)}, true)`;
      // Lets storage.objects deletes reach RLS instead of storage's own guard.
      await tx`select set_config('storage.allow_delete_query', 'true', true)`;
      await tx.unsafe('set local role authenticated');
      out = await fn(tx);
      throw ROLLBACK;
    });
  } catch (error) {
    if (error !== ROLLBACK) throw error;
  }
  return out as T;
}

type Query = (tx: postgres.TransactionSql, s: Subject) => Promise<postgres.RowList<postgres.Row[]>>;
interface Probe {
  name: string;
  run: Query;
}

/**
 * Whether the probe takes effect for `s`: at least one row read or changed. RLS
 * rejections (42501, incl. the songs_guard_added_by trigger) are a denial; any other
 * error means the probe itself is broken, so it's rethrown.
 */
async function rlsAllows(s: Subject, probe: Probe): Promise<boolean> {
  try {
    return await as(s.user.id, async (tx) => (await probe.run(tx, s)).count > 0);
  } catch (error) {
    if ((error as { code?: string }).code === '42501') return false;
    throw error;
  }
}

const p = (name: string, run: Query): Probe => ({ name, run });
const uniq = () => `${randomUUID()}-${tag}`;

// ---------------------------------------------------------------------------------------
// Role-only actions → SQL probes. `Record` keeps this exhaustive over `Action`.
// ---------------------------------------------------------------------------------------
type ListAction = 'list:read' | 'list:write' | 'share:create' | 'share:revoke';
type RoleAction = Exclude<Action, ListAction>;

const ROLE_PROBES: Record<RoleAction, Probe[]> = {
  'song:read': [
    p('select song', (tx) => tx`select 1 from songs where id = ${ids.song}`),
    p('select song keys', (tx) => tx`select 1 from song_keys where song_id = ${ids.song}`),
    p(
      'select song composers',
      (tx) => tx`select 1 from song_composers where song_id = ${ids.song}`,
    ),
    p('select song themes', (tx) => tx`select 1 from song_themes where song_id = ${ids.song}`),
  ],
  'song:write': [
    p(
      'insert song stamped with own branch',
      (tx, s) =>
        tx`insert into songs (title, added_by_branch_id) values (${`New ${tag}`}, ${s.user.branchId})`,
    ),
    p('update song', (tx) => tx`update songs set tempo_bpm = 90 where id = ${ids.song}`),
    p('add key', (tx) => tx`insert into song_keys (song_id, key) values (${ids.song}, 'A')`),
    p(
      'update key chords',
      (tx) => tx`update song_keys set chorus_chord = 'C' where id = ${ids.songKey}`,
    ),
    p(
      'link composer',
      (tx) =>
        tx`insert into song_composers (song_id, composer_id) values (${ids.song}, ${ids.spareComposer})`,
    ),
    p(
      'tag theme',
      (tx) =>
        tx`insert into song_themes (song_id, theme_id, section) values (${ids.song}, ${ids.theme}, 'bridge')`,
    ),
  ],
  'song:delete': [
    p('soft delete', (tx) => tx`update songs set deleted_at = now() where id = ${ids.spareSong}`),
    p('hard delete', (tx) => tx`delete from songs where id = ${ids.spareSong}`),
  ],
  'song:set_added_by': [
    p(
      'update added_by branch',
      (tx) => tx`update songs set added_by_branch_id = ${ids.branchB} where id = ${ids.song}`,
    ),
    p(
      'insert song stamped with another branch',
      (tx) =>
        tx`insert into songs (title, added_by_branch_id) values (${`New ${tag}`}, ${ids.branchB})`,
    ),
  ],
  'resource:read': [
    p('select resource', (tx) => tx`select 1 from resources where id = ${ids.resource}`),
    p(
      'select storage object',
      (tx) =>
        tx`select 1 from storage.objects where bucket_id = 'resources' and name = ${ids.object}`,
    ),
  ],
  'resource:write': [
    p(
      'insert resource',
      (tx) => tx`insert into resources (song_id, kind, format, label, storage_path)
                 values (${ids.song}, 'projection', 'pro', 'Slides', ${`songs/${ids.song}/common/${uniq()}.pro`})`,
    ),
    p('delete resource', (tx) => tx`delete from resources where id = ${ids.resource}`),
    p(
      'upload object',
      (tx) =>
        tx`insert into storage.objects (bucket_id, name) values ('resources', ${`songs/${tag}/common/${uniq()}.pdf`})`,
    ),
    p(
      'replace object',
      (tx) => tx`update storage.objects set metadata = '{"size": 1}'
                 where bucket_id = 'resources' and name = ${ids.object}`,
    ),
    p(
      'delete object',
      (tx) =>
        tx`delete from storage.objects where bucket_id = 'resources' and name = ${ids.object}`,
    ),
  ],
  'theme:create': [
    p('insert theme', (tx) => tx`insert into themes (name) values (${`new-${uniq()}`})`),
  ],
  'theme:merge': [
    p(
      'rename theme',
      (tx) => tx`update themes set name = ${`renamed-${uniq()}`} where id = ${ids.theme}`,
    ),
    p('delete theme', (tx) => tx`delete from themes where id = ${ids.theme}`),
  ],
  'theme:synonyms': [
    p(
      'add synonym',
      (tx) =>
        tx`insert into theme_synonyms (theme_id, synonym) values (${ids.theme}, ${`s-${uniq()}`})`,
    ),
    p('remove synonym', (tx) => tx`delete from theme_synonyms where theme_id = ${ids.theme}`),
  ],
  'composer:create': [
    p(
      'insert composer',
      (tx) => tx`insert into composers (name, pop_member) values (${`C ${uniq()}`}, 'none')`,
    ),
  ],
  'composer:merge': [
    p(
      'set pop_member',
      (tx) => tx`update composers set pop_member = 'past' where id = ${ids.composer}`,
    ),
    p(
      'insert composer with pop_member',
      (tx) => tx`insert into composers (name, pop_member) values (${`C ${uniq()}`}, 'current')`,
    ),
    p('delete merged composer', (tx) => tx`delete from composers where id = ${ids.spareComposer}`),
  ],
  'usage:write': [
    p(
      'insert usage',
      (tx) =>
        tx`insert into branch_usage (song_id, branch_id, level) values (${ids.song}, ${ids.branchB}, 'low')`,
    ),
    p(
      'update usage',
      (tx) => tx`update branch_usage set level = 'rare'
                 where song_id = ${ids.song} and branch_id = ${ids.branchA}`,
    ),
  ],
  'list:create': [
    p(
      'insert own playlist',
      (tx, s) => tx`insert into lists (type, name, owner_id, branch_id)
                    values ('playlist', ${`New ${tag}`}, ${s.user.id}, ${s.user.branchId})`,
    ),
    p(
      'insert own setlist',
      (tx, s) => tx`insert into lists (type, name, event_date, owner_id, branch_id)
                    values ('setlist', ${`New ${tag}`}, '2026-12-06', ${s.user.id}, ${s.user.branchId})`,
    ),
  ],
  'audit:read': [
    p('select audit entry', (tx) => tx`select 1 from audit_log where id = ${ids.audit}`),
  ],
  'admin:users': [
    p('read another user', (tx) => tx`select 1 from users where id = ${ids.ownerA}`),
    p(
      'change another user role',
      (tx) => tx`update users set role = 'contributor' where id = ${ids.ownerA}`,
    ),
    p(
      'reject another user',
      (tx) => tx`update users set access_status = 'rejected' where id = ${ids.ownerA}`,
    ),
  ],
  'admin:branches': [
    p(
      'insert branch',
      (tx) => tx`insert into branches (name, code) values (${`B ${uniq()}`}, ${branchCode()})`,
    ),
    p(
      'update branch',
      (tx) => tx`update branches set sso_group = ${`g-${uniq()}`} where id = ${ids.branchA}`,
    ),
  ],
  // The importer has no table of its own. It writes songs stamped with whichever branch
  // the spreadsheet says, which through RLS is only possible for admins.
  'admin:import': [
    p(
      'insert song stamped with another branch',
      (tx) =>
        tx`insert into songs (title, added_by_branch_id) values (${`Import ${tag}`}, ${ids.branchB})`,
    ),
  ],
};

// ---------------------------------------------------------------------------------------
// List-scoped actions: each runs against every list scenario, with `ctx = { list }`.
// ---------------------------------------------------------------------------------------
type ListQuery = (
  tx: postgres.TransactionSql,
  s: Subject,
  listId: string,
) => Promise<postgres.RowList<postgres.Row[]>>;
const lp = (name: string, run: ListQuery) => ({ name, run });

const LIST_PROBES: Record<ListAction, { name: string; run: ListQuery }[]> = {
  'list:read': [
    lp('select list', (tx, _s, l) => tx`select 1 from lists where id = ${l}`),
    lp('select items', (tx, _s, l) => tx`select 1 from list_items where list_id = ${l}`),
  ],
  'list:write': [
    lp('rename', (tx, _s, l) => tx`update lists set name = 'Renamed' where id = ${l}`),
    lp(
      'add item',
      (tx, _s, l) =>
        tx`insert into list_items (list_id, song_id, position) values (${l}, ${ids.song}, 1)`,
    ),
    lp(
      'override item',
      (tx, _s, l) => tx`update list_items set override_key = 'D' where list_id = ${l}`,
    ),
    lp('remove item', (tx, _s, l) => tx`delete from list_items where list_id = ${l}`),
    lp('soft delete', (tx, _s, l) => tx`update lists set deleted_at = now() where id = ${l}`),
    lp('hard delete', (tx, _s, l) => tx`delete from lists where id = ${l}`),
  ],
  'share:create': [
    lp(
      'insert share',
      (tx, s, l) =>
        tx`insert into shares (list_id, token, created_by) values (${l}, ${`tok-${uniq()}`}, ${s.user.id})`,
    ),
  ],
  'share:revoke': [
    lp(
      'revoke share',
      (tx, _s, l) => tx`update shares set revoked_at = now() where list_id = ${l}`,
    ),
    lp('delete share', (tx, _s, l) => tx`delete from shares where list_id = ${l}`),
  ],
};

interface Scenario {
  name: string;
  /** The list's row id. A fixture, so only read it inside the test. */
  id: (s: Subject) => string;
  /** `ctx.list` for `can()`, known at collection time. */
  ctx: (s: Subject) => NonNullable<PermCtx['list']>;
}
const listCtx = (type: ListType, ownerId: string, branchId: string) => ({
  type,
  ownerId,
  branchId,
});

const SCENARIOS: Scenario[] = [
  {
    name: 'own playlist',
    id: (s) => s.ownPlaylist,
    ctx: (s) => listCtx('playlist', s.user.id, ids.branchA),
  },
  {
    name: 'own setlist',
    id: (s) => s.ownSetlist,
    ctx: (s) => listCtx('setlist', s.user.id, ids.branchA),
  },
  {
    name: "another member's playlist (same branch)",
    id: () => ids.otherPlaylistA,
    ctx: () => listCtx('playlist', ids.ownerA, ids.branchA),
  },
  {
    name: "another member's setlist (same branch)",
    id: () => ids.otherSetlistA,
    ctx: () => listCtx('setlist', ids.ownerA, ids.branchA),
  },
  {
    name: 'setlist of another branch',
    id: () => ids.otherSetlistB,
    ctx: () => listCtx('setlist', ids.ownerB, ids.branchB),
  },
];

// ---------------------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------------------
async function insertUser(
  id: string,
  email: string,
  name: string,
  branchId: string,
  role: Role,
  status: AccessStatus,
) {
  await sql`insert into auth.users (id, email, aud, role) values (${id}, ${email}, 'authenticated', 'authenticated')`;
  await sql`
    insert into users (id, email, name, branch_id, role, auth_provider, access_status)
    values (${id}, ${email}, ${name}, ${branchId}, ${role}, 'password', ${status})`;
}

async function insertList(type: ListType, ownerId: string, branchId: string): Promise<string> {
  const [row] = await sql<{ id: string }[]>`
    insert into lists (type, name, event_date, owner_id, branch_id)
    values (${type}, ${`RLS parity ${type} ${tag}`}, ${type === 'setlist' ? '2026-11-01' : null},
            ${ownerId}, ${branchId})
    returning id`;
  const id = row!.id;
  await sql`insert into list_items (list_id, song_id, position) values (${id}, ${ids.song}, 0)`;
  await sql`insert into shares (list_id, token, created_by) values (${id}, ${`tok-${uniq()}`}, ${ownerId})`;
  return id;
}

const allUserIds = () => [ids.ownerA, ids.ownerB, ...SUBJECTS.map((s) => s.user.id)];

beforeAll(async () => {
  await sql`insert into branches (id, name, code)
            values (${ids.branchA}, ${`RLS parity A ${tag}`}, ${branchCode()})`;
  await sql`insert into branches (id, name, code)
            values (${ids.branchB}, ${`RLS parity B ${tag}`}, ${branchCode()})`;

  await insertUser(
    ids.ownerA,
    `rls-parity-owner-a-${tag}@example.test`,
    'Owner A',
    ids.branchA,
    'member',
    'approved',
  );
  await insertUser(
    ids.ownerB,
    `rls-parity-owner-b-${tag}@example.test`,
    'Owner B',
    ids.branchB,
    'member',
    'approved',
  );
  for (const s of SUBJECTS) {
    await insertUser(
      s.user.id,
      s.user.email,
      s.user.name,
      ids.branchA,
      s.user.role,
      s.user.accessStatus,
    );
  }

  const [song] = await sql<{ id: string }[]>`
    insert into songs (title, added_by_branch_id) values (${`RLS parity song ${tag}`}, ${ids.branchA}) returning id`;
  const [spare] = await sql<{ id: string }[]>`
    insert into songs (title, added_by_branch_id) values (${`RLS parity spare ${tag}`}, ${ids.branchA}) returning id`;
  ids.song = song!.id;
  ids.spareSong = spare!.id;

  const [key] = await sql<{ id: string }[]>`
    insert into song_keys (song_id, key, is_primary) values (${ids.song}, 'G', true) returning id`;
  ids.songKey = key!.id;

  const [resource] = await sql<{ id: string }[]>`
    insert into resources (song_id, song_key_id, kind, format, label, url)
    values (${ids.song}, ${ids.songKey}, 'video_link', 'url', 'Video', 'https://example.test/v')
    returning id`;
  ids.resource = resource!.id;

  const [composer] = await sql<{ id: string }[]>`
    insert into composers (name) values (${`RLS parity composer ${tag}`}) returning id`;
  const [spareComposer] = await sql<{ id: string }[]>`
    insert into composers (name) values (${`RLS parity spare composer ${tag}`}) returning id`;
  ids.composer = composer!.id;
  ids.spareComposer = spareComposer!.id;
  await sql`insert into song_composers (song_id, composer_id) values (${ids.song}, ${ids.composer})`;

  const [theme] = await sql<{ id: string }[]>`
    insert into themes (name) values (${`rls-parity-theme-${tag}`}) returning id`;
  ids.theme = theme!.id;
  await sql`insert into theme_synonyms (theme_id, synonym) values (${ids.theme}, ${`rls-parity-syn-${tag}`})`;
  await sql`insert into song_themes (song_id, theme_id, section) values (${ids.song}, ${ids.theme}, 'chorus')`;
  await sql`insert into branch_usage (song_id, branch_id, level) values (${ids.song}, ${ids.branchA}, 'high')`;

  const [audit] = await sql<{ id: string }[]>`
    insert into audit_log (actor_id, entity, entity_id, action)
    values (${ids.ownerA}, 'song', ${ids.song}, 'create') returning id`;
  ids.audit = audit!.id;

  await sql`insert into storage.objects (bucket_id, name) values ('resources', ${ids.object})`;

  ids.otherPlaylistA = await insertList('playlist', ids.ownerA, ids.branchA);
  ids.otherSetlistA = await insertList('setlist', ids.ownerA, ids.branchA);
  ids.otherSetlistB = await insertList('setlist', ids.ownerB, ids.branchB);
  for (const s of SUBJECTS) {
    s.ownPlaylist = await insertList('playlist', s.user.id, ids.branchA);
    s.ownSetlist = await insertList('setlist', s.user.id, ids.branchA);
  }
});

afterAll(async () => {
  await sql.begin(async (tx) => {
    await tx`select set_config('storage.allow_delete_query', 'true', true)`;
    await tx`delete from storage.objects where bucket_id = 'resources' and name = ${ids.object}`;
  });
  const userIds = allUserIds();
  await sql`delete from audit_log where actor_id = any(${userIds})`;
  await sql`delete from lists where owner_id = any(${userIds})`; // cascades items + shares
  await sql`delete from songs where title like ${`%${tag}%`}`; // cascades song children
  await sql`delete from composers where name like ${`%${tag}%`}`;
  await sql`delete from themes where name like ${`%${tag}%`}`;
  await sql`delete from auth.users where id = any(${userIds})`; // cascades users
  await sql`delete from branches where id = any(${[ids.branchA, ids.branchB]})`;
  await sql.end();
});

// ---------------------------------------------------------------------------------------
// Parity
// ---------------------------------------------------------------------------------------

/**
 * Known mismatch (see CR_ACCESS_STATUS): `can()` doesn't look at `accessStatus`, so for a
 * pending or rejected user it allows whatever the same role would get when approved,
 * while RLS denies. Those cases are `test.fails` until AUTH-05 adds the check; once it
 * lands they start passing, `test.fails` turns them red, and this guard should go.
 */
function knownAccessStatusMismatch(s: Subject, action: Action, ctx?: PermCtx): boolean {
  return (
    s.user.accessStatus !== 'approved' && can({ ...s.user, accessStatus: 'approved' }, action, ctx)
  );
}

async function checkParity(
  s: Subject,
  action: Action,
  ctx: PermCtx | undefined,
  probes: { name: string; rls: () => Promise<boolean> }[],
) {
  const expected = can(s.user, action, ctx);
  const results: Record<string, boolean> = {};
  for (const probe of probes) results[probe.name] = await probe.rls();
  // Every probe agrees with can() …
  expect(results).toEqual(Object.fromEntries(probes.map((probe) => [probe.name, expected])));
  // … and a non-approved user gets nothing from either side (contracts/permissions.md).
  if (s.user.accessStatus !== 'approved') expect(expected).toBe(false);
}

for (const s of SUBJECTS) {
  describe(s.key, () => {
    for (const [action, probes] of Object.entries(ROLE_PROBES) as [RoleAction, Probe[]][]) {
      const t = knownAccessStatusMismatch(s, action) ? test.fails : test;
      const suffix = t === test ? '' : ` [known mismatch: ${CR_ACCESS_STATUS}]`;
      t(`${action}${suffix}`, () =>
        checkParity(
          s,
          action,
          undefined,
          probes.map((probe) => ({ name: probe.name, rls: () => rlsAllows(s, probe) })),
        ),
      );
    }

    for (const [action, probes] of Object.entries(LIST_PROBES) as [
      ListAction,
      { name: string; run: ListQuery }[],
    ][]) {
      for (const scenario of SCENARIOS) {
        const ctx: PermCtx = { list: scenario.ctx(s) };
        const t = knownAccessStatusMismatch(s, action, ctx) ? test.fails : test;
        const suffix = t === test ? '' : ` [known mismatch: ${CR_ACCESS_STATUS}]`;
        t(`${action} on ${scenario.name}${suffix}`, () => {
          const id = scenario.id(s); // fixture ids exist only once beforeAll has run
          return checkParity(
            s,
            action,
            ctx,
            probes.map((probe) => ({
              name: probe.name,
              rls: () => rlsAllows(s, { name: probe.name, run: (tx) => probe.run(tx, s, id) }),
            })),
          );
        });
      }
    }
  });
}

describe('non-approved users', () => {
  const notApproved = SUBJECTS.filter((s) => s.user.accessStatus !== 'approved');

  test('can read their own users row and nothing else in users', async () => {
    for (const s of notApproved) {
      const own = await as(
        s.user.id,
        (tx) => tx`select id, access_status from users where id = ${s.user.id}`,
      );
      expect([...own], s.key).toEqual([{ id: s.user.id, access_status: s.user.accessStatus }]);
      const others = await as(
        s.user.id,
        (tx) => tx`select 1 from users where id = any(${allUserIds()}) and id <> ${s.user.id}`,
      );
      expect(others.count, s.key).toBe(0);
    }
  });

  test('cannot change their own users row (no self-approval)', async () => {
    for (const s of notApproved) {
      const allowed = await rlsAllows(
        s,
        p(
          'self-approve',
          (tx) => tx`update users set access_status = 'approved' where id = ${s.user.id}`,
        ),
      );
      expect(allowed, s.key).toBe(false);
    }
  });

  test('every RLS helper returns null/false for them', async () => {
    for (const s of notApproved) {
      const [row] = await as(
        s.user.id,
        (tx) => tx<{ role: string | null; branch: string | null; member: boolean }[]>`
          select public.app_user_role()::text as role, public.app_user_branch() as branch,
                 public.app_role_at_least('member') as member`,
      );
      expect(row, s.key).toEqual({ role: null, branch: null, member: false });
    }
  });
});

describe('coverage', () => {
  test('every contract action has at least one probe', () => {
    // Record<RoleAction|ListAction, …> already makes this a compile-time guarantee; this
    // guards against an action being given an empty probe list.
    for (const [action, probes] of [...Object.entries(ROLE_PROBES), ...Object.entries(LIST_PROBES)])
      expect(probes.length, action).toBeGreaterThan(0);
    expect(Object.keys(ROLE_PROBES).length + Object.keys(LIST_PROBES).length).toBe(21);
  });
});
