// @vitest-environment node
// Integration (DB-04): the seed against the local Supabase stack. Needs migrations applied
// (`pnpm db:start && pnpm db:migrate`). Locally env comes from .env.local, which Vitest
// doesn't load on its own; CI exports the stack's values.
import { existsSync } from 'node:fs';

import { createClient } from '@supabase/supabase-js';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { branches, composers, listItems, lists, songs, themes, users } from '@/fixtures';
import { ROLES } from '@/types/domain';

import { buildUsers, DEV_PASSWORD } from './data';
import { SeedTargetError } from './guard';
import { seed } from './seed';
import type { SeedOptions } from './seed';

if (!process.env.DATABASE_URL && existsSync('.env.local')) process.loadEnvFile('.env.local');

const opts: SeedOptions = {
  databaseUrl: process.env.DATABASE_URL,
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
};

const sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });

const TABLES = [
  'branches',
  'users',
  'composers',
  'themes',
  'songs',
  'song_composers',
  'song_keys',
  'resources',
  'song_themes',
  'branch_usage',
  'lists',
  'list_items',
] as const;

/** A fingerprint of every seeded table's full contents (all columns, incl. timestamps). */
async function snapshot(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const table of TABLES) {
    const [row] = await sql<{ n: number; digest: string | null }[]>`
      select count(*)::int as n, md5(string_agg(t::text, '|' order by t::text)) as digest
      from ${sql(table)} t`;
    out[table] = `${row!.n}:${row!.digest}`;
  }
  const [auth] = await sql<{ digest: string }[]>`
    select md5(string_agg(concat_ws(',', id, email, banned_until, email_confirmed_at is not null),
                          '|' order by id)) as digest
    from auth.users where id = any(${buildUsers().map((u) => u.id)})`;
  out['auth.users'] = auth!.digest;
  return out;
}

let afterFirst: Record<string, string>;
let afterSecond: Record<string, string>;

const song = songs[0]!;

beforeAll(async () => {
  // Start from no seeded songs/lists so the first run really inserts (and fires DB-02's
  // triggers). Song deletes cascade to keys, resources, composers, themes and usage.
  await sql`delete from lists where id = any(${lists.map((l) => l.id)})`;
  await sql`delete from songs where id = any(${songs.map((s) => s.id)})`;

  await seed(opts);
  afterFirst = await snapshot();

  // Dirty the database the way manual testing would, then reseed.
  await sql`update songs set title = 'Edited by hand' where id = ${song.id}`;
  await sql`delete from song_themes where song_id = ${song.id}`;
  await sql`insert into song_keys (song_id, key) values (${song.id}, 'F#m')`;
  await sql`update users set role = 'member' where id = ${users[0]!.id}`;

  await seed(opts);
  afterSecond = await snapshot();
}, 60_000);

afterAll(async () => {
  await sql.end();
});

describe('seed', () => {
  test('is idempotent: reseeding (even a hand-edited database) restores the same state', () => {
    expect(afterSecond).toEqual(afterFirst);
  });

  test('a run over an already-seeded database changes nothing', async () => {
    await seed(opts);
    expect(await snapshot()).toEqual(afterSecond);
  });

  test('row counts match the fixtures', async () => {
    const counts: Record<string, number> = {};
    for (const table of TABLES) {
      const [row] = await sql<{ n: number }[]>`select count(*)::int as n from ${sql(table)}`;
      counts[table] = row!.n;
    }
    expect(counts).toEqual({
      branches: branches.length,
      users: buildUsers().length,
      composers: composers.length,
      themes: themes.length,
      songs: songs.length,
      song_composers: songs.flatMap((s) => s.composers).length,
      song_keys: songs.flatMap((s) => s.keys).length,
      resources: songs.flatMap((s) => s.resources).length,
      song_themes: songs.flatMap((s) => s.themes).length,
      branch_usage: songs.flatMap((s) => s.usage).length,
      lists: lists.length,
      list_items: listItems.length,
    });
  });

  test('trigger-maintained song columns are populated and match the fixtures', async () => {
    const rows = await sql<
      {
        id: string;
        chorus_line: string | null;
        verse1_line: string | null;
        composer_names: string;
        theme_names: string;
        has_vector: boolean;
        updated_at: Date;
      }[]
    >`select id, chorus_line, verse1_line, composer_names, theme_names,
             search_vector is not null and search_vector <> ''::tsvector as has_vector, updated_at
      from songs`;
    const byId = new Map(rows.map((r) => [r.id, r]));
    for (const song of songs) {
      const row = byId.get(song.id)!;
      expect(row, song.title).toBeDefined();
      expect(row.chorus_line, song.title).toBe(song.chorusLine);
      expect(row.verse1_line, song.title).toBe(song.verse1Line);
      expect(row.composer_names, song.title).toBe(song.composers.map((c) => c.name).join(' '));
      const themeNames = [...new Set(song.themes.map((t) => t.theme.name))].sort();
      expect(row.theme_names.split(' ').filter(Boolean).sort(), song.title).toEqual(
        themeNames.flatMap((n) => n.split(' ')).sort(),
      );
      expect(row.has_vector, song.title).toBe(true);
      expect(row.updated_at.toISOString(), song.title).toBe(new Date(song.updatedAt).toISOString());
    }
  });

  test('themes are searchable through search_vector (SRCH-01 depends on this)', async () => {
    const [row] = await sql<{ titles: string[] }[]>`
      select array_agg(title order by title) as titles from songs
      where ts_filter(search_vector, '{b}') @@ plainto_tsquery('english', 'redemption')`;
    expect(row!.titles).toContain('A Thousand Hallelujahs');
  });

  test('every branch has an active user for every role', async () => {
    const rows = await sql<{ branch_id: string; role: string }[]>`
      select distinct branch_id, role::text from users
      where disabled_at is null and branch_id is not null`;
    const pairs = new Set(rows.map((r) => `${r.branch_id}:${r.role}`));
    for (const b of branches) for (const r of ROLES) expect(pairs).toContain(`${b.id}:${r}`);
  });

  test('fixture users are stored as the fixtures say', async () => {
    const rows = await sql<
      { id: string; email: string; role: string; auth_provider: string; access_status: string }[]
    >`
      select id, email, role::text, auth_provider::text, access_status::text
      from users where id = any(${users.map((u) => u.id)})`;
    expect(rows.sort((a, b) => a.id.localeCompare(b.id))).toEqual(
      users.map((u) => ({
        id: u.id,
        email: u.email,
        role: u.role,
        auth_provider: u.authProvider,
        access_status: u.accessStatus,
      })),
    );
  });

  test('seeded users can sign in with the dev password; disabled users cannot', async () => {
    const anon = createClient(opts.supabaseUrl!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const admin = buildUsers().find((u) => u.role === 'admin' && !u.disabledAt)!;
    const ok = await anon.auth.signInWithPassword({ email: admin.email, password: DEV_PASSWORD });
    expect(ok.error).toBeNull();
    expect(ok.data.user?.id).toBe(admin.id);

    const disabled = users.find((u) => u.disabledAt)!;
    const blocked = await anon.auth.signInWithPassword({
      email: disabled.email,
      password: DEV_PASSWORD,
    });
    expect(blocked.error).not.toBeNull();
  });

  test('refuses a non-local DATABASE_URL or Supabase URL without --force', async () => {
    const before = await snapshot();
    await expect(
      seed({
        ...opts,
        databaseUrl: 'postgresql://postgres:secret@db.example.supabase.co:5432/postgres',
      }),
    ).rejects.toThrow(SeedTargetError);
    await expect(seed({ ...opts, supabaseUrl: 'https://example.supabase.co' })).rejects.toThrow(
      /NEXT_PUBLIC_SUPABASE_URL is not localhost/,
    );
    expect(await snapshot()).toEqual(before);
  });
});
