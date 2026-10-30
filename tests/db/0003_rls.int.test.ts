// @vitest-environment node
// Integration (DB-03): RLS policies from db/migrations/0003_rls.sql.
// Needs local Supabase with migrations applied (`pnpm db:start && pnpm db:migrate`);
// CI's integration job does both. CI sets DATABASE_URL; locally it comes from
// .env.local, which Vitest doesn't load on its own.
//
// Each check runs in its own transaction as a real API role: `set local role
// authenticated` (or `anon`) plus `request.jwt.claims`, the way PostgREST does,
// and is always rolled back. Fixtures are created as `postgres` (BYPASSRLS) and
// removed afterwards.
import { existsSync } from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';

import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

if (!process.env.DATABASE_URL && existsSync('.env.local')) process.loadEnvFile('.env.local');

const sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });

const tag = randomUUID().slice(0, 8);

/** Three random capital letters, for the `^[A-Z]{2,3}$` branch code. */
function branchCode(): string {
  return [...randomBytes(3)].map((b) => String.fromCharCode(65 + (b % 26))).join('');
}

const USERS = {
  member: { role: 'member', branch: 'a' },
  member2: { role: 'member', branch: 'a' },
  contributor: { role: 'contributor', branch: 'a' },
  leaderA: { role: 'music_leader', branch: 'a' },
  leaderB: { role: 'music_leader', branch: 'b' },
  admin: { role: 'admin', branch: 'a' },
  disabledAdmin: { role: 'admin', branch: 'a', disabled: true },
} as const;
type UserKey = keyof typeof USERS;
type Who = UserKey | 'anon';

const ids = {
  user: {} as Record<UserKey, string>,
  branchA: '',
  branchB: '',
  song: '',
  deletedSong: '',
  songKey: '',
  resource: '',
  composer: '',
  theme: '',
  setlistA: '', // owned by member, branch A
  playlist: '', // owned by member, branch A
  setlistB: '', // owned by leaderB, branch B
  deletedSetlist: '', // owned by member, soft-deleted
  listItem: '',
  share: '', // on setlistA
  audit: '',
  object: `songs/${tag}/common/${randomUUID()}.pdf`,
};

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

const ROLLBACK = Symbol('rollback');

/** Run `fn` as `who` inside a transaction that is always rolled back. */
async function as<T>(who: Who, fn: (tx: postgres.TransactionSql) => Promise<T>): Promise<T> {
  let out: T | undefined;
  try {
    await sql.begin(async (tx) => {
      const claims =
        who === 'anon'
          ? { role: 'anon' }
          : { sub: ids.user[who], role: 'authenticated', aud: 'authenticated' };
      await tx`select set_config('request.jwt.claims', ${JSON.stringify(claims)}, true)`;
      // Lets storage.objects deletes reach RLS instead of storage's own guard.
      await tx`select set_config('storage.allow_delete_query', 'true', true)`;
      await tx.unsafe(`set local role ${who === 'anon' ? 'anon' : 'authenticated'}`);
      out = await fn(tx);
      throw ROLLBACK;
    });
  } catch (error) {
    if (error !== ROLLBACK) throw error;
  }
  return out as T;
}

/** Number of rows `who` can see in `table` (optionally filtered by id). */
async function visible(who: Who, table: string, id?: string): Promise<number> {
  return as(who, async (tx) => {
    const [row] = id
      ? await tx<{ n: number }[]>`select count(*)::int as n from ${tx(table)} where id = ${id}`
      : await tx<{ n: number }[]>`select count(*)::int as n from ${tx(table)}`;
    return row!.n;
  });
}

/**
 * Whether a write by `who` takes effect: true when it changes at least one row,
 * false when RLS filters every row out or rejects the new row (SQLSTATE 42501).
 * Any other error is a broken test, so it's rethrown.
 */
async function allowed(
  who: Who,
  fn: (tx: postgres.TransactionSql) => Promise<postgres.RowList<postgres.Row[]>>,
): Promise<boolean> {
  try {
    return await as(who, async (tx) => (await fn(tx)).count > 0);
  } catch (error) {
    if ((error as { code?: string }).code === '42501') return false;
    throw error;
  }
}

/** Run `fn` for each user in `who` and return { user: result }. */
async function each<T>(who: readonly Who[], fn: (w: Who) => Promise<T>) {
  const out: Partial<Record<Who, T>> = {};
  for (const w of who) out[w] = await fn(w);
  return out;
}

const ACTIVE: readonly UserKey[] = ['member', 'contributor', 'leaderA', 'leaderB', 'admin'];

beforeAll(async () => {
  const [a] = await sql<{ id: string }[]>`
    insert into branches (name, code) values (${`RLS A ${tag}`}, ${branchCode()}) returning id`;
  const [b] = await sql<{ id: string }[]>`
    insert into branches (name, code) values (${`RLS B ${tag}`}, ${branchCode()}) returning id`;
  ids.branchA = a!.id;
  ids.branchB = b!.id;

  for (const [key, spec] of Object.entries(USERS) as [UserKey, (typeof USERS)[UserKey]][]) {
    const id = randomUUID();
    const email = `rls-${key.toLowerCase()}-${tag}@example.test`;
    await sql`insert into auth.users (id, email, aud, role) values (${id}, ${email}, 'authenticated', 'authenticated')`;
    await sql`
      insert into users (id, email, name, branch_id, role, auth_provider, disabled_at, access_status)
      values (${id}, ${email}, ${`RLS ${key}`}, ${spec.branch === 'a' ? ids.branchA : ids.branchB},
              ${spec.role}, 'password', ${'disabled' in spec ? new Date() : null}, 'approved')`;
    ids.user[key] = id;
  }

  const [song] = await sql<{ id: string }[]>`
    insert into songs (title, added_by_branch_id) values (${`RLS song ${tag}`}, ${ids.branchA}) returning id`;
  const [deleted] = await sql<{ id: string }[]>`
    insert into songs (title, deleted_at) values (${`RLS deleted ${tag}`}, now()) returning id`;
  ids.song = song!.id;
  ids.deletedSong = deleted!.id;

  const [key] = await sql<{ id: string }[]>`
    insert into song_keys (song_id, key, is_primary) values (${ids.song}, 'G', true) returning id`;
  ids.songKey = key!.id;
  await sql`insert into song_keys (song_id, key) values (${ids.deletedSong}, 'D')`;

  const [resource] = await sql<{ id: string }[]>`
    insert into resources (song_id, song_key_id, kind, format, label, url)
    values (${ids.song}, ${ids.songKey}, 'video_link', 'url', 'Video', 'https://example.test/v')
    returning id`;
  ids.resource = resource!.id;

  const [composer] = await sql<{ id: string }[]>`
    insert into composers (name) values (${`RLS composer ${tag}`}) returning id`;
  ids.composer = composer!.id;
  await sql`insert into song_composers (song_id, composer_id) values (${ids.song}, ${ids.composer})`;

  const [theme] = await sql<{ id: string }[]>`
    insert into themes (name) values (${`rls-theme-${tag}`}) returning id`;
  ids.theme = theme!.id;
  await sql`insert into theme_synonyms (theme_id, synonym) values (${ids.theme}, ${`rls-syn-${tag}`})`;
  await sql`insert into song_themes (song_id, theme_id, section) values (${ids.song}, ${ids.theme}, 'chorus')`;
  await sql`insert into branch_usage (song_id, branch_id, level) values (${ids.song}, ${ids.branchA}, 'high')`;

  const list = async (type: string, owner: UserKey, branch: string, deleted = false) => {
    const [row] = await sql<{ id: string }[]>`
      insert into lists (type, name, event_date, owner_id, branch_id, deleted_at)
      values (${type}, ${`RLS ${type} ${tag}`}, ${type === 'setlist' ? '2026-11-01' : null},
              ${ids.user[owner]}, ${branch}, ${deleted ? new Date() : null})
      returning id`;
    return row!.id;
  };
  ids.setlistA = await list('setlist', 'member', ids.branchA);
  ids.playlist = await list('playlist', 'member', ids.branchA);
  ids.setlistB = await list('setlist', 'leaderB', ids.branchB);
  ids.deletedSetlist = await list('setlist', 'member', ids.branchA, true);

  const [item] = await sql<{ id: string }[]>`
    insert into list_items (list_id, song_id, position) values (${ids.setlistA}, ${ids.song}, 0) returning id`;
  ids.listItem = item!.id;
  await sql`insert into list_items (list_id, song_id, position) values (${ids.playlist}, ${ids.song}, 0)`;

  const [share] = await sql<{ id: string }[]>`
    insert into shares (list_id, token, created_by)
    values (${ids.setlistA}, ${`rls-${tag}-${randomUUID()}`}, ${ids.user.member}) returning id`;
  ids.share = share!.id;

  const [audit] = await sql<{ id: string }[]>`
    insert into audit_log (actor_id, entity, entity_id, action)
    values (${ids.user.contributor}, 'song', ${ids.song}, 'create') returning id`;
  ids.audit = audit!.id;

  await sql`insert into storage.objects (bucket_id, name) values ('resources', ${ids.object})`;
});

afterAll(async () => {
  await sql.begin(async (tx) => {
    await tx`select set_config('storage.allow_delete_query', 'true', true)`;
    await tx`delete from storage.objects where bucket_id = 'resources' and name = ${ids.object}`;
  });
  const userIds = Object.values(ids.user);
  const branchIds = [ids.branchA, ids.branchB].filter(Boolean);
  if (userIds.length) {
    await sql`delete from audit_log where actor_id = any(${userIds})`;
    await sql`delete from lists where owner_id = any(${userIds})`; // cascades items + shares
  }
  await sql`delete from songs where title like ${`%${tag}%`}`; // cascades song children
  await sql`delete from composers where name like ${`%${tag}%`}`;
  await sql`delete from themes where name like ${`%${tag}%`}`;
  if (userIds.length) await sql`delete from auth.users where id = any(${userIds})`; // cascades users
  if (branchIds.length) await sql`delete from branches where id = any(${branchIds})`;
  await sql.end();
});

describe('coverage', () => {
  test('RLS is enabled on every public table, and each has a policy', async () => {
    const rows = await sql<{ tablename: string; rowsecurity: boolean; policies: number }[]>`
      select t.tablename, t.rowsecurity,
             (select count(*)::int from pg_policies p
              where p.schemaname = 'public' and p.tablename = t.tablename) as policies
      from pg_tables t where t.schemaname = 'public'`;
    expect(rows.map((r) => r.tablename).sort()).toEqual([...PUBLIC_TABLES].sort());
    for (const row of rows) {
      expect(row, row.tablename).toMatchObject({ rowsecurity: true });
      expect(row.policies, row.tablename).toBeGreaterThan(0);
    }
  });

  test('a disabled user (even an admin) and anon get zero rows from every table', async () => {
    for (const table of PUBLIC_TABLES) {
      expect(await visible('admin', table), `admin sees ${table}`).toBeGreaterThan(0);
      expect(await visible('disabledAdmin', table), `disabled ${table}`).toBe(0);
      expect(await visible('anon', table), `anon ${table}`).toBe(0);
    }
  });

  test('a disabled user and anon can write nothing', async () => {
    for (const who of ['disabledAdmin', 'anon'] as const) {
      expect(await allowed(who, (tx) => tx`insert into themes (name) values (${`x-${tag}`})`)).toBe(
        false,
      );
      expect(
        await allowed(who, (tx) => tx`update songs set title = 'x' where id = ${ids.song}`),
      ).toBe(false);
      expect(await allowed(who, (tx) => tx`delete from lists where id = ${ids.setlistA}`)).toBe(
        false,
      );
    }
  });

  test('the API roles cannot TRUNCATE (it bypasses RLS)', async () => {
    await expect(as('admin', (tx) => tx`truncate audit_log`)).rejects.toMatchObject({
      code: '42501',
    });
  });
});

describe('helper functions', () => {
  test('app_user_role / app_user_branch / app_role_at_least reflect the caller', async () => {
    type Row = { role: string | null; branch: string | null; contrib: boolean; leader: boolean };
    const read = (who: Who) =>
      as(who, async (tx) => {
        const [row] = await tx<Row[]>`
          select public.app_user_role()::text as role, public.app_user_branch() as branch,
                 public.app_role_at_least('contributor') as contrib,
                 public.app_role_at_least('music_leader') as leader`;
        return row!;
      });
    expect(await read('member')).toEqual({
      role: 'member',
      branch: ids.branchA,
      contrib: false,
      leader: false,
    });
    expect(await read('contributor')).toMatchObject({
      role: 'contributor',
      contrib: true,
      leader: false,
    });
    expect(await read('leaderB')).toMatchObject({
      role: 'music_leader',
      branch: ids.branchB,
      leader: true,
    });
    expect(await read('disabledAdmin')).toEqual({
      role: null,
      branch: null,
      contrib: false,
      leader: false,
    });
  });

  test('anon cannot call the helpers', async () => {
    await expect(as('anon', (tx) => tx`select public.app_user_role()`)).rejects.toMatchObject({
      code: '42501',
    });
  });
});

describe('songs', () => {
  test('song:read for every active role; soft-deleted songs only for admins', async () => {
    expect(await each(ACTIVE, (w) => visible(w, 'songs', ids.song))).toEqual({
      member: 1,
      contributor: 1,
      leaderA: 1,
      leaderB: 1,
      admin: 1,
    });
    expect(await each(ACTIVE, (w) => visible(w, 'songs', ids.deletedSong))).toEqual({
      member: 0,
      contributor: 0,
      leaderA: 0,
      leaderB: 0,
      admin: 1,
    });
  });

  test('song:write (create) is contributor+, stamped with the creator branch', async () => {
    const create = (who: Who, branch: string | null) =>
      allowed(
        who,
        (tx) =>
          tx`insert into songs (title, added_by_branch_id) values (${`New ${tag}`}, ${branch})`,
      );
    expect(await create('member', ids.branchA)).toBe(false);
    expect(await create('contributor', ids.branchA)).toBe(true);
    expect(await create('leaderB', ids.branchB)).toBe(true);
    // song:set_added_by is admin-only.
    expect(await create('contributor', ids.branchB)).toBe(false);
    expect(await create('contributor', null)).toBe(false);
    expect(await create('admin', ids.branchB)).toBe(true);
    // Non-admins can't create already-deleted songs.
    expect(
      await allowed(
        'contributor',
        (tx) => tx`insert into songs (title, added_by_branch_id, deleted_at)
                   values (${`New ${tag}`}, ${ids.branchA}, now())`,
      ),
    ).toBe(false);
  });

  test('song:write (update) is contributor+ and only on non-deleted songs', async () => {
    const edit = (who: Who, id: string) =>
      allowed(who, (tx) => tx`update songs set tempo_bpm = 90 where id = ${id}`);
    expect(await edit('member', ids.song)).toBe(false);
    expect(await edit('contributor', ids.song)).toBe(true);
    expect(await edit('leaderB', ids.song)).toBe(true);
    expect(await edit('contributor', ids.deletedSong)).toBe(false);
    expect(await edit('admin', ids.deletedSong)).toBe(true);
  });

  test('song:delete (soft, via deleted_at) and restore are admin-only; hard delete too', async () => {
    const softDelete = (who: Who) =>
      allowed(who, (tx) => tx`update songs set deleted_at = now() where id = ${ids.song}`);
    expect(await softDelete('contributor')).toBe(false);
    expect(await softDelete('leaderA')).toBe(false);
    expect(await softDelete('admin')).toBe(true);
    expect(
      await allowed(
        'admin',
        (tx) => tx`update songs set deleted_at = null where id = ${ids.deletedSong}`,
      ),
    ).toBe(true);
    // ids.song is on a list (list_items restricts deletes), so admins hard-delete the other one.
    const hardDelete = (who: Who, id: string) =>
      allowed(who, (tx) => tx`delete from songs where id = ${id}`);
    expect(await hardDelete('leaderA', ids.song)).toBe(false);
    expect(await hardDelete('admin', ids.deletedSong)).toBe(true);
  });

  test('song:set_added_by on update is admin-only', async () => {
    const move = (who: Who) =>
      allowed(
        who,
        (tx) => tx`update songs set added_by_branch_id = ${ids.branchB} where id = ${ids.song}`,
      );
    expect(await move('contributor')).toBe(false);
    expect(await move('leaderA')).toBe(false);
    expect(await move('admin')).toBe(true);
  });
});

describe('song children', () => {
  test('keys, composers, themes and resources are readable with their song', async () => {
    for (const table of ['song_keys', 'song_composers', 'song_themes', 'resources']) {
      const count = (who: Who, song: string) =>
        as(who, async (tx) => {
          const [row] = await tx<{ n: number }[]>`
            select count(*)::int as n from ${tx(table)} where song_id = ${song}`;
          return row!.n;
        });
      expect(await count('member', ids.song), table).toBeGreaterThan(0);
    }
    const deletedKeys = (who: Who) =>
      as(who, async (tx) => {
        const [row] = await tx<{ n: number }[]>`
          select count(*)::int as n from song_keys where song_id = ${ids.deletedSong}`;
        return row!.n;
      });
    expect(await deletedKeys('contributor')).toBe(0);
    expect(await deletedKeys('admin')).toBe(1);
  });

  test('song:write on keys / composers / themes is contributor+', async () => {
    const addKey = (who: Who, song: string) =>
      allowed(who, (tx) => tx`insert into song_keys (song_id, key) values (${song}, 'A')`);
    expect(await addKey('member', ids.song)).toBe(false);
    expect(await addKey('contributor', ids.song)).toBe(true);
    expect(await addKey('contributor', ids.deletedSong)).toBe(false);
    expect(await addKey('admin', ids.deletedSong)).toBe(true);

    const chord = (who: Who) =>
      allowed(who, (tx) => tx`update song_keys set chorus_chord = 'C' where id = ${ids.songKey}`);
    expect(await chord('member')).toBe(false);
    expect(await chord('contributor')).toBe(true);

    // These also fire DB-02's denorm triggers, which update songs as the caller.
    const unlinkComposer = (who: Who) =>
      allowed(who, (tx) => tx`delete from song_composers where song_id = ${ids.song}`);
    expect(await unlinkComposer('member')).toBe(false);
    expect(await unlinkComposer('contributor')).toBe(true);

    const tag_ = (who: Who) =>
      allowed(
        who,
        (tx) =>
          tx`insert into song_themes (song_id, theme_id, section) values (${ids.song}, ${ids.theme}, 'bridge')`,
      );
    expect(await tag_('member')).toBe(false);
    expect(await tag_('contributor')).toBe(true);
  });

  test('resource:read is any active user; resource:write is contributor+', async () => {
    expect(await visible('member', 'resources', ids.resource)).toBe(1);
    const add = (who: Who) =>
      allowed(
        who,
        (tx) => tx`insert into resources (song_id, kind, format, label, storage_path)
                   values (${ids.song}, 'projection', 'pro', 'Slides', ${`songs/${ids.song}/common/x.pro`})`,
      );
    expect(await add('member')).toBe(false);
    expect(await add('contributor')).toBe(true);
    const remove = (who: Who) =>
      allowed(who, (tx) => tx`delete from resources where id = ${ids.resource}`);
    expect(await remove('member')).toBe(false);
    expect(await remove('contributor')).toBe(true);
  });
});

describe('composers', () => {
  test('composer:create is contributor+; setting pop_member needs music_leader+', async () => {
    const create = (who: Who, pop: string) =>
      allowed(
        who,
        (tx) =>
          tx`insert into composers (name, pop_member) values (${`C ${randomUUID()} ${tag}`}, ${pop})`,
      );
    expect(await create('member', 'none')).toBe(false);
    expect(await create('contributor', 'none')).toBe(true);
    expect(await create('contributor', 'current')).toBe(false);
    expect(await create('leaderA', 'current')).toBe(true);
  });

  test('composer:merge / pop_member (update, delete) is music_leader+', async () => {
    const setPop = (who: Who) =>
      allowed(who, (tx) => tx`update composers set pop_member = 'past' where id = ${ids.composer}`);
    expect(await setPop('member')).toBe(false);
    expect(await setPop('contributor')).toBe(false);
    expect(await setPop('leaderB')).toBe(true);
    expect(await setPop('admin')).toBe(true);
    const merge = (who: Who) =>
      allowed(who, async (tx) => {
        await tx`delete from song_composers where composer_id = ${ids.composer}`;
        return tx`delete from composers where id = ${ids.composer}`;
      });
    expect(await merge('contributor')).toBe(false);
    expect(await merge('leaderA')).toBe(true);
  });
});

describe('themes', () => {
  test('theme:create is contributor+', async () => {
    const create = (who: Who) =>
      allowed(who, (tx) => tx`insert into themes (name) values (${`new-${randomUUID()}-${tag}`})`);
    expect(await create('member')).toBe(false);
    expect(await create('contributor')).toBe(true);
  });

  test('theme:merge (update, delete) and theme:synonyms are music_leader+', async () => {
    const rename = (who: Who) =>
      allowed(
        who,
        (tx) => tx`update themes set name = ${`renamed-${tag}`} where id = ${ids.theme}`,
      );
    expect(await rename('contributor')).toBe(false);
    expect(await rename('leaderA')).toBe(true);
    const remove = (who: Who) =>
      allowed(who, (tx) => tx`delete from themes where id = ${ids.theme}`);
    expect(await remove('contributor')).toBe(false);
    expect(await remove('admin')).toBe(true);
    const synonym = (who: Who) =>
      allowed(
        who,
        (tx) =>
          tx`insert into theme_synonyms (theme_id, synonym) values (${ids.theme}, ${`s-${tag}`})`,
      );
    expect(await visible('member', 'theme_synonyms')).toBeGreaterThan(0);
    expect(await synonym('contributor')).toBe(false);
    expect(await synonym('leaderB')).toBe(true);
  });
});

describe('branch_usage', () => {
  test('readable by any active user; usage:write is contributor+', async () => {
    expect(await visible('member', 'branch_usage')).toBeGreaterThan(0);
    const set = (who: Who) =>
      allowed(
        who,
        (tx) => tx`update branch_usage set level = 'low'
                   where song_id = ${ids.song} and branch_id = ${ids.branchA}`,
      );
    expect(await set('member')).toBe(false);
    expect(await set('contributor')).toBe(true);
  });
});

describe('branches and users', () => {
  test('branches: readable by any active user; admin:branches writes', async () => {
    expect(await visible('member', 'branches', ids.branchA)).toBe(1);
    const rename = (who: Who) =>
      allowed(
        who,
        (tx) => tx`update branches set sso_group = ${`g-${tag}`} where id = ${ids.branchA}`,
      );
    expect(await rename('leaderA')).toBe(false);
    expect(await rename('admin')).toBe(true);
    expect(
      await allowed(
        'leaderA',
        (tx) => tx`insert into branches (name, code) values (${`X ${tag}`}, 'ZZZ')`,
      ),
    ).toBe(false);
  });

  test('users: non-admins see only their own row; admins see everyone', async () => {
    const userIds = Object.values(ids.user);
    const count = (who: Who) =>
      as(who, async (tx) => {
        const [row] = await tx<{ n: number }[]>`
          select count(*)::int as n from users where id = any(${userIds})`;
        return row!.n;
      });
    expect(await count('member')).toBe(1);
    expect(await count('leaderA')).toBe(1);
    expect(await count('admin')).toBe(userIds.length);
  });

  test('admin:users: only admins change users (no self-promotion)', async () => {
    const promote = (who: Who, target: UserKey) =>
      allowed(who, (tx) => tx`update users set role = 'admin' where id = ${ids.user[target]}`);
    expect(await promote('member', 'member')).toBe(false);
    expect(await promote('leaderA', 'member')).toBe(false);
    expect(await promote('admin', 'member')).toBe(true);
    expect(await promote('disabledAdmin', 'disabledAdmin')).toBe(false);
  });
});

describe('lists (REQ-LIST-08)', () => {
  test('setlists are readable by every active user; playlists only by owner and admin', async () => {
    expect(await each(ACTIVE, (w) => visible(w, 'lists', ids.setlistB))).toEqual({
      member: 1,
      contributor: 1,
      leaderA: 1,
      leaderB: 1,
      admin: 1,
    });
    expect(await visible('member', 'lists', ids.playlist)).toBe(1);
    expect(await visible('member2', 'lists', ids.playlist)).toBe(0);
    expect(await visible('leaderA', 'lists', ids.playlist)).toBe(0);
    expect(await visible('admin', 'lists', ids.playlist)).toBe(1);
  });

  test('soft-deleted lists are hidden from everyone but the owner and admins', async () => {
    expect(await visible('member', 'lists', ids.deletedSetlist)).toBe(1);
    expect(await visible('member2', 'lists', ids.deletedSetlist)).toBe(0);
    expect(await visible('admin', 'lists', ids.deletedSetlist)).toBe(1);
  });

  test('list:create: any active user, as owner, with their own branch', async () => {
    const create = (who: Who, owner: UserKey, branch: string) =>
      allowed(
        who,
        (tx) => tx`insert into lists (type, name, owner_id, branch_id)
                   values ('playlist', ${`New ${tag}`}, ${ids.user[owner]}, ${branch})`,
      );
    expect(await create('member', 'member', ids.branchA)).toBe(true);
    expect(await create('member', 'member2', ids.branchA)).toBe(false);
    expect(await create('member', 'member', ids.branchB)).toBe(false);
    expect(await create('admin', 'member', ids.branchB)).toBe(true);
  });

  test('list:write: owner, music_leader on a same-branch setlist, admin', async () => {
    const rename = (who: Who, id: string) =>
      allowed(who, (tx) => tx`update lists set name = ${`Renamed ${tag}`} where id = ${id}`);
    expect(await rename('member', ids.setlistA)).toBe(true);
    expect(await rename('member', ids.playlist)).toBe(true);
    expect(await rename('member2', ids.setlistA)).toBe(false);
    expect(await rename('contributor', ids.setlistA)).toBe(false);
    expect(await rename('leaderA', ids.setlistA)).toBe(true);
    expect(await rename('leaderB', ids.setlistA)).toBe(false);
    expect(await rename('leaderA', ids.setlistB)).toBe(false);
    expect(await rename('leaderA', ids.playlist)).toBe(false);
    expect(await rename('admin', ids.setlistB)).toBe(true);
    // Ownership can't be handed to someone else to sidestep the rules.
    expect(
      await allowed(
        'member',
        (tx) => tx`update lists set owner_id = ${ids.user.member2} where id = ${ids.playlist}`,
      ),
    ).toBe(false);
    const softDelete = (who: Who) =>
      allowed(who, (tx) => tx`update lists set deleted_at = now() where id = ${ids.setlistA}`);
    expect(await softDelete('member2')).toBe(false);
    expect(await softDelete('member')).toBe(true);
    const hardDelete = (who: Who) =>
      allowed(who, (tx) => tx`delete from lists where id = ${ids.setlistA}`);
    expect(await hardDelete('member2')).toBe(false);
    expect(await hardDelete('leaderA')).toBe(true);
  });

  test('list_items follow the list: read with list:read, write with list:write', async () => {
    expect(await visible('member2', 'list_items', ids.listItem)).toBe(1);
    const playlistItems = (who: Who) =>
      as(who, async (tx) => {
        const [row] = await tx<{ n: number }[]>`
          select count(*)::int as n from list_items where list_id = ${ids.playlist}`;
        return row!.n;
      });
    expect(await playlistItems('member')).toBe(1);
    expect(await playlistItems('member2')).toBe(0);

    const add = (who: Who, list: string) =>
      allowed(
        who,
        (tx) =>
          tx`insert into list_items (list_id, song_id, position) values (${list}, ${ids.song}, 1)`,
      );
    expect(await add('member', ids.setlistA)).toBe(true);
    expect(await add('member2', ids.setlistA)).toBe(false);
    expect(await add('leaderA', ids.setlistA)).toBe(true);
    expect(await add('leaderB', ids.setlistA)).toBe(false);
    expect(await add('leaderA', ids.playlist)).toBe(false);
    expect(await add('admin', ids.playlist)).toBe(true);
    const override = (who: Who) =>
      allowed(who, (tx) => tx`update list_items set override_key = 'D' where id = ${ids.listItem}`);
    expect(await override('member2')).toBe(false);
    expect(await override('member')).toBe(true);
  });

  test('share:create / share:revoke need list:write; tokens are hidden from readers', async () => {
    expect(await visible('member', 'shares', ids.share)).toBe(1);
    expect(await visible('member2', 'shares', ids.share)).toBe(0);
    expect(await visible('leaderA', 'shares', ids.share)).toBe(1);
    expect(await visible('leaderB', 'shares', ids.share)).toBe(0);

    const create = (who: UserKey, list: string, createdBy: UserKey = who) =>
      allowed(
        who,
        (tx) => tx`insert into shares (list_id, token, created_by)
                   values (${list}, ${randomUUID()}, ${ids.user[createdBy]})`,
      );
    expect(await create('member', ids.playlist)).toBe(true);
    expect(await create('member2', ids.setlistA)).toBe(false);
    expect(await create('leaderA', ids.setlistA)).toBe(true);
    expect(await create('leaderB', ids.setlistA)).toBe(false);
    expect(await create('admin', ids.setlistB)).toBe(true);
    expect(await create('member', ids.playlist, 'member2')).toBe(false);

    const revoke = (who: Who) =>
      allowed(who, (tx) => tx`update shares set revoked_at = now() where id = ${ids.share}`);
    expect(await revoke('member2')).toBe(false);
    expect(await revoke('leaderB')).toBe(false);
    expect(await revoke('member')).toBe(true);
    expect(await revoke('leaderA')).toBe(true);
  });
});

describe('audit_log', () => {
  test('audit:read is contributor+', async () => {
    expect(await each(ACTIVE, (w) => visible(w, 'audit_log', ids.audit))).toEqual({
      member: 0,
      contributor: 1,
      leaderA: 1,
      leaderB: 1,
      admin: 1,
    });
  });

  test('is append-only from server code: API roles cannot write it', async () => {
    const insert = (who: Who) =>
      allowed(
        who,
        (tx) => tx`insert into audit_log (actor_id, entity, entity_id, action)
                   values (${ids.user.admin}, 'song', ${ids.song}, 'update')`,
      );
    expect(await insert('contributor')).toBe(false);
    expect(await insert('admin')).toBe(false);
    expect(await allowed('admin', (tx) => tx`delete from audit_log where id = ${ids.audit}`)).toBe(
      false,
    );
  });
});

describe('storage bucket `resources`', () => {
  test('exists and is private', async () => {
    const [bucket] = await sql<{ public: boolean }[]>`
      select public from storage.buckets where id = 'resources'`;
    expect(bucket).toEqual({ public: false });
  });

  test('read: any active user', async () => {
    const count = (who: Who) =>
      as(who, async (tx) => {
        const [row] = await tx<{ n: number }[]>`
          select count(*)::int as n from storage.objects
          where bucket_id = 'resources' and name = ${ids.object}`;
        return row!.n;
      });
    expect(await count('member')).toBe(1);
    expect(await count('disabledAdmin')).toBe(0);
    expect(await count('anon')).toBe(0);
  });

  test('write (upload, replace, delete): contributor+', async () => {
    const upload = (who: Who) =>
      allowed(
        who,
        (tx) => tx`insert into storage.objects (bucket_id, name)
                   values ('resources', ${`songs/${tag}/common/${randomUUID()}.pdf`})`,
      );
    expect(await upload('member')).toBe(false);
    expect(await upload('anon')).toBe(false);
    expect(await upload('contributor')).toBe(true);
    const replace = (who: Who) =>
      allowed(
        who,
        (tx) => tx`update storage.objects set metadata = '{"size": 1}'
                   where bucket_id = 'resources' and name = ${ids.object}`,
      );
    expect(await replace('member')).toBe(false);
    expect(await replace('contributor')).toBe(true);
    const remove = (who: Who) =>
      allowed(
        who,
        (tx) =>
          tx`delete from storage.objects where bucket_id = 'resources' and name = ${ids.object}`,
      );
    expect(await remove('member')).toBe(false);
    expect(await remove('leaderA')).toBe(true);
  });
});
