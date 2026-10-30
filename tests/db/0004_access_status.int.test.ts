// @vitest-environment node
// Integration (DB-07): user access status from db/migrations/0004_access_status.sql.
// Needs local Supabase with migrations applied (`pnpm db:start && pnpm db:migrate`).
// CI sets DATABASE_URL; locally it comes from .env.local.
//
// Same approach as 0003_rls.int.test.ts: each check runs as the `authenticated`
// role with the user's JWT claims inside a transaction that is always rolled
// back. Fixtures are created as `postgres` (BYPASSRLS) and removed afterwards.
import { existsSync } from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';

import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

if (!process.env.DATABASE_URL && existsSync('.env.local')) process.loadEnvFile('.env.local');

const sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });

const tag = randomUUID().slice(0, 8);

function branchCode(): string {
  return [...randomBytes(3)].map((b) => String.fromCharCode(65 + (b % 26))).join('');
}

const USERS = {
  member: { role: 'member', status: 'approved', disabled: false },
  admin: { role: 'admin', status: 'approved', disabled: false },
  // Role 'admin' so a leak through any role check would show up.
  pending: { role: 'admin', status: 'pending', disabled: false },
  rejected: { role: 'admin', status: 'rejected', disabled: false },
  disabled: { role: 'admin', status: 'approved', disabled: true },
  disabledPending: { role: 'member', status: 'pending', disabled: true },
} as const;
type UserKey = keyof typeof USERS;
const NOT_APPROVED = ['pending', 'rejected'] as const;

const PUBLIC_TABLES = [
  'branches',
  'users',
  'composers',
  'songs',
  'song_composers',
  'song_keys',
  'resources',
  'themes',
  'theme_synonyms',
  'song_themes',
  'branch_usage',
  'lists',
  'list_items',
  'shares',
  'audit_log',
] as const;

const ids = {
  user: {} as Record<UserKey, string>,
  branch: '',
  song: '',
  theme: '',
  setlist: '',
  pendingPlaylist: '', // owned by the pending user
};

const ROLLBACK = Symbol('rollback');

async function as<T>(who: UserKey, fn: (tx: postgres.TransactionSql) => Promise<T>): Promise<T> {
  let out: T | undefined;
  try {
    await sql.begin(async (tx) => {
      const claims = { sub: ids.user[who], role: 'authenticated', aud: 'authenticated' };
      await tx`select set_config('request.jwt.claims', ${JSON.stringify(claims)}, true)`;
      await tx.unsafe('set local role authenticated');
      out = await fn(tx);
      throw ROLLBACK;
    });
  } catch (error) {
    if (error !== ROLLBACK) throw error;
  }
  return out as T;
}

async function visible(who: UserKey, table: string): Promise<number> {
  return as(who, async (tx) => {
    const [row] = await tx<{ n: number }[]>`select count(*)::int as n from ${tx(table)}`;
    return row!.n;
  });
}

async function allowed(
  who: UserKey,
  fn: (tx: postgres.TransactionSql) => Promise<postgres.RowList<postgres.Row[]>>,
): Promise<boolean> {
  try {
    return await as(who, async (tx) => (await fn(tx)).count > 0);
  } catch (error) {
    if ((error as { code?: string }).code === '42501') return false;
    throw error;
  }
}

beforeAll(async () => {
  const [branch] = await sql<{ id: string }[]>`
    insert into branches (name, code) values (${`Access ${tag}`}, ${branchCode()}) returning id`;
  ids.branch = branch!.id;

  for (const [key, spec] of Object.entries(USERS) as [UserKey, (typeof USERS)[UserKey]][]) {
    const id = randomUUID();
    const email = `access-${key.toLowerCase()}-${tag}@example.test`;
    await sql`insert into auth.users (id, email, aud, role) values (${id}, ${email}, 'authenticated', 'authenticated')`;
    await sql`
      insert into users (id, email, name, branch_id, role, auth_provider, disabled_at, access_status)
      values (${id}, ${email}, ${`Access ${key}`}, ${ids.branch}, ${spec.role}, 'password',
              ${spec.disabled ? new Date() : null}, ${spec.status})`;
    ids.user[key] = id;
  }

  const [song] = await sql<{ id: string }[]>`
    insert into songs (title, added_by_branch_id) values (${`Access song ${tag}`}, ${ids.branch}) returning id`;
  ids.song = song!.id;
  const [key] = await sql<{ id: string }[]>`
    insert into song_keys (song_id, key, is_primary) values (${ids.song}, 'G', true) returning id`;
  await sql`
    insert into resources (song_id, song_key_id, kind, format, label, url)
    values (${ids.song}, ${key!.id}, 'video_link', 'url', 'Video', 'https://example.test/v')`;
  const [composer] = await sql<{ id: string }[]>`
    insert into composers (name) values (${`Access composer ${tag}`}) returning id`;
  await sql`insert into song_composers (song_id, composer_id) values (${ids.song}, ${composer!.id})`;
  const [theme] = await sql<{ id: string }[]>`
    insert into themes (name) values (${`access-theme-${tag}`}) returning id`;
  ids.theme = theme!.id;
  await sql`insert into theme_synonyms (theme_id, synonym) values (${ids.theme}, ${`access-syn-${tag}`})`;
  await sql`insert into song_themes (song_id, theme_id, section) values (${ids.song}, ${ids.theme}, 'chorus')`;
  await sql`insert into branch_usage (song_id, branch_id, level) values (${ids.song}, ${ids.branch}, 'high')`;

  const list = async (type: string, owner: UserKey) => {
    const [row] = await sql<{ id: string }[]>`
      insert into lists (type, name, event_date, owner_id, branch_id)
      values (${type}, ${`Access ${type} ${tag}`}, ${type === 'setlist' ? '2026-11-01' : null},
              ${ids.user[owner]}, ${ids.branch})
      returning id`;
    return row!.id;
  };
  ids.setlist = await list('setlist', 'member');
  ids.pendingPlaylist = await list('playlist', 'pending');
  await sql`insert into list_items (list_id, song_id, position) values (${ids.setlist}, ${ids.song}, 0)`;
  await sql`
    insert into list_items (list_id, song_id, position) values (${ids.pendingPlaylist}, ${ids.song}, 0)`;
  await sql`
    insert into shares (list_id, token, created_by)
    values (${ids.setlist}, ${`access-${tag}-${randomUUID()}`}, ${ids.user.member})`;
  await sql`
    insert into audit_log (actor_id, entity, entity_id, action)
    values (${ids.user.admin}, 'song', ${ids.song}, 'create')`;
});

afterAll(async () => {
  const userIds = Object.values(ids.user);
  if (userIds.length) {
    await sql`delete from audit_log where actor_id = any(${userIds})`;
    await sql`delete from lists where owner_id = any(${userIds})`;
  }
  await sql`delete from songs where title like ${`%${tag}%`}`;
  await sql`delete from composers where name like ${`%${tag}%`}`;
  await sql`delete from themes where name like ${`%${tag}%`}`;
  if (userIds.length) await sql`delete from auth.users where id = any(${userIds})`;
  if (ids.branch) await sql`delete from branches where id = ${ids.branch}`;
  await sql.end();
});

describe('schema', () => {
  test('access_status enum and users columns match contracts/schema.md', async () => {
    const [e] = await sql<{ labels: string[] }[]>`
      select array_agg(e.enumlabel::text order by e.enumsortorder) as labels
      from pg_enum e join pg_type t on t.oid = e.enumtypid
      where t.typname = 'access_status' and t.typnamespace = 'public'::regnamespace`;
    expect(e!.labels).toEqual(['pending', 'approved', 'rejected']);

    const cols = await sql<
      {
        column_name: string;
        data_type: string;
        is_nullable: string;
        column_default: string | null;
      }[]
    >`
      select column_name, data_type, is_nullable, column_default from information_schema.columns
      where table_schema = 'public' and table_name = 'users' and column_name like 'access_%'
      order by column_name`;
    expect(cols).toEqual([
      {
        column_name: 'access_decided_at',
        data_type: 'timestamp with time zone',
        is_nullable: 'YES',
        column_default: null,
      },
      {
        column_name: 'access_decided_by',
        data_type: 'uuid',
        is_nullable: 'YES',
        column_default: null,
      },
      {
        column_name: 'access_status',
        data_type: 'USER-DEFINED',
        is_nullable: 'NO',
        column_default: "'pending'::access_status",
      },
    ]);
  });

  test('new users start pending; access_decided_by references users', async () => {
    const id = randomUUID();
    const email = `access-default-${tag}@example.test`;
    await sql
      .begin(async (tx) => {
        await tx`insert into auth.users (id, email, aud, role) values (${id}, ${email}, 'authenticated', 'authenticated')`;
        const [row] = await tx<{ access_status: string }[]>`
        insert into users (id, email, name, auth_provider) values (${id}, ${email}, 'Default', 'password')
        returning access_status::text`;
        expect(row!.access_status).toBe('pending');
        await expect(
          tx`update users set access_decided_by = ${randomUUID()} where id = ${id}`,
        ).rejects.toMatchObject({ code: '23503' });
        throw ROLLBACK;
      })
      .catch((error: unknown) => {
        if (error !== ROLLBACK) throw error;
      });
  });
});

describe('helper functions', () => {
  test('app_user_role / app_user_branch are null unless approved and not disabled', async () => {
    const read = (who: UserKey) =>
      as(who, async (tx) => {
        const [row] = await tx<{ role: string | null; branch: string | null; member: boolean }[]>`
          select public.app_user_role()::text as role, public.app_user_branch() as branch,
                 public.app_role_at_least('member') as member`;
        return row!;
      });
    expect(await read('member')).toEqual({ role: 'member', branch: ids.branch, member: true });
    expect(await read('admin')).toEqual({ role: 'admin', branch: ids.branch, member: true });
    for (const who of [...NOT_APPROVED, 'disabled', 'disabledPending'] as const) {
      expect(await read(who), who).toEqual({ role: null, branch: null, member: false });
    }
  });
});

describe('reads', () => {
  test('pending and rejected users see nothing except their own users row', async () => {
    for (const who of NOT_APPROVED) {
      for (const table of PUBLIC_TABLES) {
        expect(await visible(who, table), `${who} sees ${table}`).toBe(table === 'users' ? 1 : 0);
      }
      const rows = await as(
        who,
        (tx) => tx<{ id: string; access_status: string }[]>`
        select id, access_status::text from users`,
      );
      expect(rows).toEqual([{ id: ids.user[who], access_status: who }]);
    }
  });

  test('a pending user cannot see even their own playlist', async () => {
    const rows = await as(
      'pending',
      (tx) => tx`select id from lists where id = ${ids.pendingPlaylist}`,
    );
    expect(rows).toHaveLength(0);
  });

  test('a disabled user still gets nothing, whatever their access status', async () => {
    for (const who of ['disabled', 'disabledPending'] as const) {
      for (const table of PUBLIC_TABLES) {
        expect(await visible(who, table), `${who} sees ${table}`).toBe(0);
      }
    }
  });

  test('approved users are unaffected', async () => {
    for (const table of PUBLIC_TABLES) {
      expect(await visible('admin', table), `admin sees ${table}`).toBeGreaterThan(0);
    }
    for (const table of ['branches', 'songs', 'themes', 'lists', 'list_items', 'song_keys']) {
      expect(await visible('member', table), `member sees ${table}`).toBeGreaterThan(0);
    }
    // A member reads only their own users row; the admin reads pending and rejected users too.
    expect(await visible('member', 'users')).toBe(1);
    const seen = await as(
      'admin',
      (tx) => tx<{ id: string }[]>`
      select id from users where id = any(${[ids.user.pending, ids.user.rejected]})`,
    );
    expect(seen).toHaveLength(2);
  });
});

describe('writes', () => {
  test('pending and rejected users can write nothing, including their own row', async () => {
    for (const who of NOT_APPROVED) {
      expect(
        await allowed(who, (tx) => tx`insert into themes (name) values (${`x-${who}-${tag}`})`),
        `${who} insert theme`,
      ).toBe(false);
      expect(
        await allowed(who, (tx) => tx`update songs set title = 'x' where id = ${ids.song}`),
        `${who} update song`,
      ).toBe(false);
      expect(
        await allowed(
          who,
          (tx) => tx`
            insert into lists (type, name, owner_id, branch_id)
            values ('playlist', 'x', ${ids.user[who]}, ${ids.branch})`,
        ),
        `${who} insert list`,
      ).toBe(false);
      expect(
        await allowed(
          who,
          (tx) => tx`update users set access_status = 'approved' where id = ${ids.user[who]}`,
        ),
        `${who} approve self`,
      ).toBe(false);
    }
    expect(
      await allowed('pending', (tx) => tx`delete from lists where id = ${ids.pendingPlaylist}`),
    ).toBe(false);
  });

  test('an approved admin can approve a pending user', async () => {
    expect(
      await allowed(
        'admin',
        (tx) => tx`
          update users set access_status = 'approved', access_decided_by = ${ids.user.admin},
                           access_decided_at = now()
          where id = ${ids.user.pending}`,
      ),
    ).toBe(true);
  });
});
