// @vitest-environment node
// Integration (DB-02): search triggers + indexes from db/migrations/0002_search.sql.
// Needs local Supabase with migrations applied (`pnpm db:start && pnpm db:migrate`);
// CI's integration job does both. CI sets DATABASE_URL; locally it comes from
// .env.local, which Vitest doesn't load on its own.
import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

import postgres from 'postgres';
import { afterAll, describe, expect, test } from 'vitest';

if (!process.env.DATABASE_URL && existsSync('.env.local')) process.loadEnvFile('.env.local');

const sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });

// Every row this file creates carries a run tag, so cleanup only touches its own rows.
const tag = randomUUID().slice(0, 8);
const songIds: string[] = [];
const composerIds: string[] = [];
const themeIds: string[] = [];

type SongRow = {
  id: string;
  chorus_line: string | null;
  verse1_line: string | null;
  composer_names: string;
  theme_names: string;
  updated_at: Date;
};

async function insertSong(fields: Record<string, unknown> = {}): Promise<SongRow> {
  const [row] = await sql<SongRow[]>`
    insert into songs ${sql({ title: `Test song ${tag}`, ...fields })}
    returning id, chorus_line, verse1_line, composer_names, theme_names, updated_at`;
  songIds.push(row!.id);
  return row!;
}

async function insertComposer(name: string): Promise<string> {
  const [row] = await sql<{ id: string }[]>`
    insert into composers (name) values (${`${name} ${tag}`}) returning id`;
  composerIds.push(row!.id);
  return row!.id;
}

async function insertTheme(name: string): Promise<string> {
  const [row] = await sql<{ id: string }[]>`
    insert into themes (name) values (${`${name}-${tag}`}) returning id`;
  themeIds.push(row!.id);
  return row!.id;
}

async function getSong(id: string): Promise<SongRow> {
  const [row] = await sql<SongRow[]>`
    select id, chorus_line, verse1_line, composer_names, theme_names, updated_at
    from songs where id = ${id}`;
  return row!;
}

/**
 * Whether `term` matches the song's search_vector, optionally restricted to `weights`
 * (e.g. 'b'). Queries both configs, since composers are indexed with 'simple' and
 * everything else with stemmed 'english'.
 */
async function matches(id: string, term: string, weights?: string): Promise<boolean> {
  const [row] = await sql<{ hit: boolean }[]>`
    select (case when ${weights ?? null}::text is null then search_vector
                 else ts_filter(search_vector, ${`{${weights ?? ''}}`}::"char"[]) end)
           @@ (plainto_tsquery('english', ${term}) || plainto_tsquery('simple', ${term})) as hit
    from songs where id = ${id}`;
  return row!.hit;
}

afterAll(async () => {
  // Song deletes cascade to song_composers / song_themes.
  if (songIds.length) await sql`delete from songs where id = any(${songIds})`;
  if (composerIds.length) await sql`delete from composers where id = any(${composerIds})`;
  if (themeIds.length) await sql`delete from themes where id = any(${themeIds})`;
  await sql.end();
});

describe('songs_derive_lines', () => {
  test('sets chorus_line and verse1_line to the first non-empty trimmed line', async () => {
    const song = await insertSong({
      chorus_lyrics: '\n   \n\t  Sing out with joy  \nsecond line',
      verse_1_lyrics: 'First verse line\r\nmore',
    });
    expect(song.chorus_line).toBe('Sing out with joy');
    expect(song.verse1_line).toBe('First verse line');
  });

  test('leaves both lines null when the lyrics are missing or blank', async () => {
    const song = await insertSong({ chorus_lyrics: ' \n\t\n', verse_1_lyrics: null });
    expect(song.chorus_line).toBeNull();
    expect(song.verse1_line).toBeNull();
  });

  test('recomputes on update and bumps updated_at', async () => {
    const song = await insertSong({ chorus_lyrics: 'Old chorus' });
    await sql`update songs set chorus_lyrics = 'New chorus' where id = ${song.id}`;
    const updated = await getSong(song.id);
    expect(updated.chorus_line).toBe('New chorus');
    expect(updated.updated_at.getTime()).toBeGreaterThanOrEqual(song.updated_at.getTime());
  });
});

describe('songs_search_refresh', () => {
  test('indexes title and alt titles at weight A and lyrics at weight D', async () => {
    const song = await insertSong({
      title: `Lighthouse ${tag}`,
      alt_titles: ['Beacon'],
      verse_2_lyrics: 'harbor',
    });
    expect(await matches(song.id, 'lighthouse', 'a')).toBe(true);
    expect(await matches(song.id, 'beacon', 'a')).toBe(true);
    expect(await matches(song.id, 'harbor', 'd')).toBe(true);
    expect(await matches(song.id, 'harbor', 'a')).toBe(false);
  });

  test('strips accents so unaccented queries match', async () => {
    const song = await insertSong({ bridge_lyrics: 'café jubilé' });
    expect(await matches(song.id, 'cafe', 'd')).toBe(true);
  });
});

describe('song_composers_denorm', () => {
  test('adding, reordering and removing composers updates composer_names and the vector', async () => {
    const song = await insertSong();
    const ada = await insertComposer('Ada');
    const bo = await insertComposer('Bo');

    await sql`insert into song_composers (song_id, composer_id, sort_order) values
      (${song.id}, ${bo}, 1), (${song.id}, ${ada}, 0)`;
    expect((await getSong(song.id)).composer_names).toBe(`Ada ${tag} Bo ${tag}`);
    expect(await matches(song.id, 'ada', 'c')).toBe(true);

    await sql`delete from song_composers where song_id = ${song.id} and composer_id = ${ada}`;
    expect((await getSong(song.id)).composer_names).toBe(`Bo ${tag}`);
    expect(await matches(song.id, 'ada', 'c')).toBe(false);
  });

  test('moving a composer row to another song recomputes both songs', async () => {
    const from = await insertSong();
    const to = await insertSong();
    const cy = await insertComposer('Cy');
    await sql`insert into song_composers (song_id, composer_id) values (${from.id}, ${cy})`;

    await sql`update song_composers set song_id = ${to.id} where song_id = ${from.id}`;
    expect((await getSong(from.id)).composer_names).toBe('');
    expect((await getSong(to.id)).composer_names).toBe(`Cy ${tag}`);
  });
});

describe('composers_rename', () => {
  test('renaming a composer updates every linked song', async () => {
    const one = await insertSong();
    const two = await insertSong();
    const di = await insertComposer('Di');
    await sql`insert into song_composers (song_id, composer_id) values
      (${one.id}, ${di}), (${two.id}, ${di})`;

    await sql`update composers set name = ${`Dina ${tag}`} where id = ${di}`;
    for (const id of [one.id, two.id]) {
      expect((await getSong(id)).composer_names).toBe(`Dina ${tag}`);
      expect(await matches(id, 'dina', 'c')).toBe(true);
    }
  });
});

describe('song_themes_denorm', () => {
  test('adding and removing themes updates theme_names (distinct, sorted) and the vector', async () => {
    const song = await insertSong();
    const hope = await insertTheme('hope');
    const grace = await insertTheme('grace');

    // The same theme in two sections appears once.
    await sql`insert into song_themes (song_id, theme_id, section) values
      (${song.id}, ${hope}, 'chorus'), (${song.id}, ${hope}, 'verse_1'),
      (${song.id}, ${grace}, 'bridge')`;
    expect((await getSong(song.id)).theme_names).toBe(`grace-${tag} hope-${tag}`);

    await sql`delete from song_themes where song_id = ${song.id} and theme_id = ${grace}`;
    expect((await getSong(song.id)).theme_names).toBe(`hope-${tag}`);
    expect(await matches(song.id, 'grace', 'b')).toBe(false);
  });

  test("ts_filter(search_vector, '{b}') matches only theme terms", async () => {
    // "anchor" appears only as a theme; "harvest" appears in every other field.
    const song = await insertSong({
      title: `Harvest ${tag}`,
      alt_titles: ['harvest'],
      chorus_lyrics: 'harvest',
    });
    const harvestComposer = await insertComposer('Harvest');
    await sql`insert into song_composers (song_id, composer_id) values (${song.id}, ${harvestComposer})`;
    const anchor = await insertTheme('anchor');
    await sql`insert into song_themes (song_id, theme_id, section) values (${song.id}, ${anchor}, 'chorus')`;

    expect(await matches(song.id, 'anchor', 'b')).toBe(true);
    expect(await matches(song.id, 'harvest', 'b')).toBe(false);
    expect(await matches(song.id, 'harvest')).toBe(true);
  });
});

describe('indexes', () => {
  test('creates every index from the contract', async () => {
    const expected = [
      'songs_search_gin',
      'songs_title_trgm',
      'songs_created_at',
      'songs_energy',
      'songs_year',
      'song_keys_key',
      'song_keys_chords',
      'song_themes_theme',
      'list_items_list_pos',
      'lists_owner',
      'lists_branch_date',
      'audit_entity',
    ];
    const rows = await sql<{ indexname: string }[]>`
      select indexname from pg_indexes
      where schemaname = 'public' and indexname = any(${expected})`;
    expect(rows.map((r) => r.indexname).sort()).toEqual([...expected].sort());
  });

  test('trigram similarity finds a misspelled title', async () => {
    const song = await insertSong({ title: `Wonderful merciful ${tag}` });
    const [row] = await sql<{ hit: boolean }[]>`
      select extensions.similarity(lower(title), ${`wonderfull mercifull ${tag}`}) > 0.5 as hit
      from songs where id = ${song.id}`;
    expect(row!.hit).toBe(true);
  });
});
