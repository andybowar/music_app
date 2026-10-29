-- DB-02 · Search triggers + indexes (contracts/schema.md "Triggers (DB-02)", "Indexes (DB-02)")
--
-- REQ-SRCH-02: free-text search across individually toggleable fields
--   (title + alternate titles, themes, composer, lyrics) via ts_filter on
--   songs.search_vector, weighted A/B/C/D respectively.
-- REQ-SRCH-06: typo-tolerant title matching via a trigram index.
--
-- Trigger-maintained columns (app code never writes them):
--   chorus_line, verse1_line - first non-empty trimmed line of the lyric field
--   composer_names           - space-joined composer names, in song order
--   theme_names              - space-joined distinct theme names
--   search_vector            - weighted tsvector, rebuilt on every songs write
--
-- Every function pins `search_path = ''`, so tables are qualified as public.*
-- and extension functions as extensions.* (Supabase keeps extensions there).
-- Statements are re-runnable (or replace / if exists / if not exists).

-- ---------------------------------------------------------------------------
-- First non-empty line of a multi-line text, trimmed of spaces and tabs.
-- ---------------------------------------------------------------------------
create or replace function public.first_nonempty_line(lyrics text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $fn$
  select nullif(pg_catalog.btrim(line, E' \t'), '')
  from pg_catalog.regexp_split_to_table(lyrics, E'\r\n|\r|\n') with ordinality as l(line, n)
  where pg_catalog.btrim(line, E' \t') <> ''
  order by n
  limit 1
$fn$;

-- ---------------------------------------------------------------------------
-- songs BEFORE INSERT/UPDATE. Postgres fires same-timing triggers in name
-- order, so songs_derive_lines runs before songs_search_refresh.
-- ---------------------------------------------------------------------------
create or replace function public.songs_derive_lines()
returns trigger
language plpgsql
set search_path = ''
as $fn$
begin
  new.chorus_line := public.first_nonempty_line(new.chorus_lyrics);
  new.verse1_line := public.first_nonempty_line(new.verse_1_lyrics);
  if tg_op = 'UPDATE' then
    new.updated_at := pg_catalog.now();
  end if;
  return new;
end;
$fn$;

-- unaccent is only STABLE, so it's used here and never in an index expression.
create or replace function public.songs_search_refresh()
returns trigger
language plpgsql
set search_path = ''
as $fn$
begin
  new.search_vector :=
    pg_catalog.setweight(pg_catalog.to_tsvector('pg_catalog.english', extensions.unaccent(
      coalesce(new.title, '') || ' ' || pg_catalog.array_to_string(new.alt_titles, ' '))), 'A') ||
    pg_catalog.setweight(pg_catalog.to_tsvector('pg_catalog.english', extensions.unaccent(
      coalesce(new.theme_names, ''))), 'B') ||
    pg_catalog.setweight(pg_catalog.to_tsvector('pg_catalog.simple', extensions.unaccent(
      coalesce(new.composer_names, ''))), 'C') ||
    pg_catalog.setweight(pg_catalog.to_tsvector('pg_catalog.english', extensions.unaccent(
      pg_catalog.concat_ws(' ', new.chorus_lyrics, new.verse_1_lyrics, new.verse_2_lyrics,
        new.verse_3_lyrics, new.verse_4_lyrics, new.verse_5_lyrics, new.bridge_lyrics))), 'D');
  return new;
end;
$fn$;

drop trigger if exists songs_derive_lines on public.songs;
create trigger songs_derive_lines
  before insert or update on public.songs
  for each row execute function public.songs_derive_lines();

drop trigger if exists songs_search_refresh on public.songs;
create trigger songs_search_refresh
  before insert or update on public.songs
  for each row execute function public.songs_search_refresh();

-- ---------------------------------------------------------------------------
-- Denormalized names. Each recompute UPDATEs songs, which fires
-- songs_search_refresh and so rebuilds search_vector with the new names.
-- ---------------------------------------------------------------------------
create or replace function public.recompute_song_composer_names(target uuid)
returns void
language sql
set search_path = ''
as $fn$
  update public.songs s
     set composer_names = coalesce((
       select pg_catalog.string_agg(c.name, ' ' order by sc.sort_order, c.name)
       from public.song_composers sc
       join public.composers c on c.id = sc.composer_id
       where sc.song_id = target
     ), '')
   where s.id = target
$fn$;

create or replace function public.recompute_song_theme_names(target uuid)
returns void
language sql
set search_path = ''
as $fn$
  update public.songs s
     set theme_names = coalesce((
       select pg_catalog.string_agg(distinct t.name, ' ' order by t.name)
       from public.song_themes st
       join public.themes t on t.id = st.theme_id
       where st.song_id = target
     ), '')
   where s.id = target
$fn$;

-- AFTER row triggers on the join tables. An UPDATE that moves a row to another
-- song recomputes both songs.
create or replace function public.song_composers_denorm()
returns trigger
language plpgsql
set search_path = ''
as $fn$
begin
  if tg_op <> 'DELETE' then
    perform public.recompute_song_composer_names(new.song_id);
  end if;
  if tg_op = 'DELETE' or old.song_id <> new.song_id then
    perform public.recompute_song_composer_names(old.song_id);
  end if;
  return null;
end;
$fn$;

create or replace function public.song_themes_denorm()
returns trigger
language plpgsql
set search_path = ''
as $fn$
begin
  if tg_op <> 'DELETE' then
    perform public.recompute_song_theme_names(new.song_id);
  end if;
  if tg_op = 'DELETE' or old.song_id <> new.song_id then
    perform public.recompute_song_theme_names(old.song_id);
  end if;
  return null;
end;
$fn$;

create or replace function public.composers_rename()
returns trigger
language plpgsql
set search_path = ''
as $fn$
begin
  perform public.recompute_song_composer_names(sc.song_id)
  from (select distinct song_id from public.song_composers where composer_id = new.id) sc;
  return null;
end;
$fn$;

drop trigger if exists song_composers_denorm on public.song_composers;
create trigger song_composers_denorm
  after insert or update or delete on public.song_composers
  for each row execute function public.song_composers_denorm();

drop trigger if exists song_themes_denorm on public.song_themes;
create trigger song_themes_denorm
  after insert or update or delete on public.song_themes
  for each row execute function public.song_themes_denorm();

drop trigger if exists composers_rename on public.composers;
create trigger composers_rename
  after update of name on public.composers
  for each row when (old.name is distinct from new.name)
  execute function public.composers_rename();

-- ---------------------------------------------------------------------------
-- Indexes (exactly the contract's list).
-- ---------------------------------------------------------------------------
create index if not exists songs_search_gin    on public.songs using gin (search_vector);
create index if not exists songs_title_trgm    on public.songs using gin (lower(title) extensions.gin_trgm_ops);
create index if not exists songs_created_at    on public.songs (created_at desc, title);
create index if not exists songs_energy        on public.songs (energy_level);
create index if not exists songs_year          on public.songs (year);
create index if not exists song_keys_key       on public.song_keys (key);
create index if not exists song_keys_chords    on public.song_keys (song_id)
  include (chorus_chord, verse_chord, bridge_chord) where is_primary;
create index if not exists song_themes_theme   on public.song_themes (theme_id);
create index if not exists list_items_list_pos on public.list_items (list_id, position);
create index if not exists lists_owner         on public.lists (owner_id) where deleted_at is null;
create index if not exists lists_branch_date   on public.lists (branch_id, event_date) where deleted_at is null;
create index if not exists audit_entity        on public.audit_log (entity, entity_id, created_at desc);

-- Backfill derived columns for rows that existed before these triggers.
update public.songs set title = title;
