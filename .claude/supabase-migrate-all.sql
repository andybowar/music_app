-- All music-app migrations (0001-0004) for the Supabase SQL Editor.
-- Equivalent to `pnpm db:migrate` on an empty database: runs each migration in order and
-- records it in drizzle.__drizzle_migrations with the same hash and timestamp drizzle-kit uses,
-- so later `pnpm db:migrate` runs only newer migrations. Runs as one transaction: it applies fully or not at all.
-- Only run this on a project with no app tables yet.

begin;

create schema if not exists drizzle;
create table if not exists drizzle.__drizzle_migrations (id serial primary key, hash text not null, created_at bigint);
do $$ begin if exists (select 1 from drizzle.__drizzle_migrations) then raise exception 'Migrations were already recorded in this database; use pnpm db:migrate instead.'; end if; end $$;

-- ===== 0001_init =====
-- Extensions (contracts/schema.md "Extensions & enums"). drizzle-kit does not emit these;
-- they were added by hand. pg_trgm and unaccent are used by DB-02 search indexes/triggers.
-- The `extensions` schema is created by Supabase (local stack, CI and hosted), so it is not
-- created here.
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;
CREATE TYPE "public"."audit_action" AS ENUM('create', 'update', 'delete');
CREATE TYPE "public"."auth_provider" AS ENUM('google', 'microsoft', 'saml', 'password');
CREATE TYPE "public"."energy_level" AS ENUM('high_praise', 'high_worship', 'mid_worship', 'deep_worship', 'quiet_worship');
CREATE TYPE "public"."list_type" AS ENUM('setlist', 'playlist');
CREATE TYPE "public"."lyric_section" AS ENUM('chorus', 'verse_1', 'verse_2', 'verse_3', 'verse_4', 'verse_5', 'bridge');
CREATE TYPE "public"."pop_member" AS ENUM('none', 'past', 'current');
CREATE TYPE "public"."resource_format" AS ENUM('pdf', 'mp3', 'm4a', 'pro', 'mdb', 'ppt', 'pptx', 'url');
CREATE TYPE "public"."resource_kind" AS ENUM('full_score', 'lead_sheet', 'chord_chart', 'audio', 'video_link', 'instruction_link', 'projection');
CREATE TYPE "public"."role" AS ENUM('member', 'contributor', 'music_leader', 'admin');
CREATE TYPE "public"."usage_level" AS ENUM('high', 'low', 'rare', 'none');
CREATE TYPE "public"."usage_source" AS ENUM('manual', 'derived');
CREATE TABLE "branches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"sso_group" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "branches_name_key" UNIQUE("name"),
	CONSTRAINT "branches_code_key" UNIQUE("code"),
	CONSTRAINT "branches_sso_group_key" UNIQUE("sso_group"),
	CONSTRAINT "branches_code_check" CHECK ("branches"."code" ~ '^[A-Z]{2,3}$')
);
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"branch_id" uuid,
	"role" "role" DEFAULT 'member' NOT NULL,
	"auth_provider" "auth_provider" NOT NULL,
	"sso_subject" text,
	"last_login_at" timestamp with time zone,
	"disabled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_key" UNIQUE("email")
);
CREATE TABLE "composers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"pop_member" "pop_member" DEFAULT 'none' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "song_composers" (
	"song_id" uuid NOT NULL,
	"composer_id" uuid NOT NULL,
	"sort_order" smallint DEFAULT 0 NOT NULL,
	CONSTRAINT "song_composers_pkey" PRIMARY KEY("song_id","composer_id")
);
CREATE TABLE "songs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"alt_titles" text[] DEFAULT '{}' NOT NULL,
	"year" smallint,
	"source_group" text,
	"tempo_bpm" smallint,
	"time_signature" text,
	"energy_level" "energy_level",
	"energy_notes" text,
	"chorus_lyrics" text,
	"verse_1_lyrics" text,
	"verse_2_lyrics" text,
	"verse_3_lyrics" text,
	"verse_4_lyrics" text,
	"verse_5_lyrics" text,
	"bridge_lyrics" text,
	"arrangement" "lyric_section"[] DEFAULT '{}' NOT NULL,
	"chorus_line" text,
	"verse1_line" text,
	"composer_names" text DEFAULT '' NOT NULL,
	"theme_names" text DEFAULT '' NOT NULL,
	"search_vector" "tsvector",
	"added_by_branch_id" uuid,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "songs_title_check" CHECK (length("songs"."title") between 1 and 200),
	CONSTRAINT "songs_year_check" CHECK ("songs"."year" between 1000 and 2100),
	CONSTRAINT "songs_tempo_bpm_check" CHECK ("songs"."tempo_bpm" between 20 and 300),
	CONSTRAINT "songs_time_signature_check" CHECK ("songs"."time_signature" ~ '^\d{1,2}/\d{1,2}$')
);
CREATE TABLE "song_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"song_id" uuid NOT NULL,
	"key" text NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"intro_chord" text,
	"verse_chord" text,
	"chorus_chord" text,
	"bridge_chord" text,
	CONSTRAINT "song_keys_song_id_key_key" UNIQUE("song_id","key"),
	CONSTRAINT "song_keys_key_check" CHECK ("song_keys"."key" ~ '^[A-G](#|b)?m?$')
);
CREATE TABLE "resources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"song_id" uuid NOT NULL,
	"song_key_id" uuid,
	"kind" "resource_kind" NOT NULL,
	"format" "resource_format" NOT NULL,
	"label" text NOT NULL,
	"storage_path" text,
	"url" text,
	"size_bytes" bigint,
	"mime_type" text,
	"uploaded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "resources_check" CHECK (("resources"."storage_path" is null) <> ("resources"."url" is null)),
	CONSTRAINT "resources_check1" CHECK (("resources"."format" = 'url') = ("resources"."url" is not null)),
	CONSTRAINT "resources_check2" CHECK (("resources"."kind" = 'projection') = ("resources"."song_key_id" is null))
);
CREATE TABLE "song_themes" (
	"song_id" uuid NOT NULL,
	"theme_id" uuid NOT NULL,
	"section" "lyric_section" NOT NULL,
	CONSTRAINT "song_themes_pkey" PRIMARY KEY("song_id","theme_id","section")
);
CREATE TABLE "theme_synonyms" (
	"theme_id" uuid NOT NULL,
	"synonym" text NOT NULL,
	CONSTRAINT "theme_synonyms_pkey" PRIMARY KEY("theme_id","synonym"),
	CONSTRAINT "theme_synonyms_synonym_check" CHECK ("theme_synonyms"."synonym" = lower(btrim("theme_synonyms"."synonym")))
);
CREATE TABLE "themes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "themes_name_key" UNIQUE("name"),
	CONSTRAINT "themes_name_check" CHECK ("themes"."name" = lower(btrim("themes"."name")))
);
CREATE TABLE "branch_usage" (
	"song_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"level" "usage_level" NOT NULL,
	"source" "usage_source" DEFAULT 'manual' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "branch_usage_pkey" PRIMARY KEY("song_id","branch_id")
);
CREATE TABLE "list_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"list_id" uuid NOT NULL,
	"song_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"override_key" text,
	"override_bpm" smallint,
	"override_energy" "energy_level",
	"resource_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "list_items_override_key_check" CHECK ("list_items"."override_key" ~ '^[A-G](#|b)?m?$'),
	CONSTRAINT "list_items_override_bpm_check" CHECK ("list_items"."override_bpm" between 20 and 300)
);
CREATE TABLE "lists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "list_type" NOT NULL,
	"name" text NOT NULL,
	"event_date" date,
	"owner_id" uuid NOT NULL,
	"branch_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "lists_name_check" CHECK (length("lists"."name") between 1 and 120),
	CONSTRAINT "lists_check" CHECK ("lists"."type" <> 'setlist' or "lists"."event_date" is not null)
);
CREATE TABLE "shares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"list_id" uuid NOT NULL,
	"token" text NOT NULL,
	"created_by" uuid NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shares_token_key" UNIQUE("token")
);
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"entity" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"action" "audit_action" NOT NULL,
	"diff" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "users" ADD CONSTRAINT "users_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "users" ADD CONSTRAINT "users_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "song_composers" ADD CONSTRAINT "song_composers_song_id_fkey" FOREIGN KEY ("song_id") REFERENCES "public"."songs"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "song_composers" ADD CONSTRAINT "song_composers_composer_id_fkey" FOREIGN KEY ("composer_id") REFERENCES "public"."composers"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "songs" ADD CONSTRAINT "songs_added_by_branch_id_fkey" FOREIGN KEY ("added_by_branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "songs" ADD CONSTRAINT "songs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "songs" ADD CONSTRAINT "songs_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "song_keys" ADD CONSTRAINT "song_keys_song_id_fkey" FOREIGN KEY ("song_id") REFERENCES "public"."songs"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "resources" ADD CONSTRAINT "resources_song_id_fkey" FOREIGN KEY ("song_id") REFERENCES "public"."songs"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "resources" ADD CONSTRAINT "resources_song_key_id_fkey" FOREIGN KEY ("song_key_id") REFERENCES "public"."song_keys"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "resources" ADD CONSTRAINT "resources_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "song_themes" ADD CONSTRAINT "song_themes_song_id_fkey" FOREIGN KEY ("song_id") REFERENCES "public"."songs"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "song_themes" ADD CONSTRAINT "song_themes_theme_id_fkey" FOREIGN KEY ("theme_id") REFERENCES "public"."themes"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "theme_synonyms" ADD CONSTRAINT "theme_synonyms_theme_id_fkey" FOREIGN KEY ("theme_id") REFERENCES "public"."themes"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "themes" ADD CONSTRAINT "themes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "branch_usage" ADD CONSTRAINT "branch_usage_song_id_fkey" FOREIGN KEY ("song_id") REFERENCES "public"."songs"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "branch_usage" ADD CONSTRAINT "branch_usage_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "list_items" ADD CONSTRAINT "list_items_list_id_fkey" FOREIGN KEY ("list_id") REFERENCES "public"."lists"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "list_items" ADD CONSTRAINT "list_items_song_id_fkey" FOREIGN KEY ("song_id") REFERENCES "public"."songs"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "list_items" ADD CONSTRAINT "list_items_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "lists" ADD CONSTRAINT "lists_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "lists" ADD CONSTRAINT "lists_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "shares" ADD CONSTRAINT "shares_list_id_fkey" FOREIGN KEY ("list_id") REFERENCES "public"."lists"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "shares" ADD CONSTRAINT "shares_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
CREATE UNIQUE INDEX "composers_name_uq" ON "composers" USING btree (lower("name"));
CREATE UNIQUE INDEX "song_keys_one_primary" ON "song_keys" USING btree ("song_id") WHERE "song_keys"."is_primary";
insert into drizzle.__drizzle_migrations (hash, created_at) values ('1cec2bc72e12e4a1645c205e3ed68890ab42dc61e34e655ecf8362d6a8933c58', 1793240336167);

-- ===== 0002_search =====
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
insert into drizzle.__drizzle_migrations (hash, created_at) values ('089f4e88c860b3fd39fbe804cce24e15cace1b6761628071ead9bf62212312a9', 1793294438467);

-- ===== 0003_rls =====
-- DB-03 · RLS policies (contracts/permissions.md)
--
-- REQ-AUTH-07: the permission matrix is enforced in Postgres RLS as well as in
--   lib/permissions.ts (`can()`). DB-05 asserts parity.
-- REQ-LIST-08: setlists are readable by every active user; playlists only by
--   their owner (and admins). Public share links are read via the service role.
-- REQ-NF-05: RLS is defense in depth. Server code connects as `postgres`
--   (DATABASE_URL) or `service_role`, both BYPASSRLS, and authorizes with
--   `assertCan` first. These policies bind the `authenticated` and `anon`
--   roles, i.e. any request made with a user's JWT through PostgREST/Storage.
--
-- Rules shared by every policy:
--   * Policies are `to authenticated` only, so `anon` gets zero rows everywhere.
--   * A disabled user (users.disabled_at set) has app_user_role() = null, so
--     every policy is false and they see and change nothing.
--   * Helper calls are wrapped in `(select ...)` so Postgres evaluates them
--     once per statement (initplan) instead of once per row.
--
-- Every function pins `search_path = ''`, so everything is schema-qualified.
-- Statements are re-runnable (create or replace / drop ... if exists).

-- ---------------------------------------------------------------------------
-- Helper functions (contracts/permissions.md "RLS helper functions").
-- SECURITY DEFINER so they can read public.users without recursing into its
-- own RLS policies.
-- ---------------------------------------------------------------------------
create or replace function public.app_user_role()
returns public.role
language sql
stable
security definer
set search_path = ''
as $fn$
  select u.role from public.users u where u.id = auth.uid() and u.disabled_at is null
$fn$;

create or replace function public.app_user_branch()
returns uuid
language sql
stable
security definer
set search_path = ''
as $fn$
  select u.branch_id from public.users u where u.id = auth.uid() and u.disabled_at is null
$fn$;

-- `role` enum order is member < contributor < music_leader < admin, so >= works.
create or replace function public.app_role_at_least(r public.role)
returns boolean
language sql
stable
set search_path = ''
as $fn$
  select coalesce(public.app_user_role() operator(pg_catalog.>=) r, false)
$fn$;

-- Policies only bind `authenticated`. Keep the helpers off the anon API.
revoke execute on function public.app_user_role() from public, anon;
revoke execute on function public.app_user_branch() from public, anon;
revoke execute on function public.app_role_at_least(public.role) from public, anon;
grant execute on function public.app_user_role() to authenticated, service_role;
grant execute on function public.app_user_branch() to authenticated, service_role;
grant execute on function public.app_role_at_least(public.role) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- song:set_added_by is admin-only. The insert policy pins added_by_branch_id
-- to the creator's branch; RLS can't compare old and new rows, so a trigger
-- stops non-admins changing it on update. It only applies to the API roles,
-- so server code (postgres / service_role) is unaffected.
-- ---------------------------------------------------------------------------
create or replace function public.songs_guard_added_by()
returns trigger
language plpgsql
set search_path = ''
as $fn$
begin
  if current_user in ('authenticated', 'anon')
     and new.added_by_branch_id is distinct from old.added_by_branch_id
     and not public.app_role_at_least('admin') then
    raise exception 'only admins may change songs.added_by_branch_id'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$fn$;

drop trigger if exists songs_guard_added_by on public.songs;
create trigger songs_guard_added_by
  before update of added_by_branch_id on public.songs
  for each row execute function public.songs_guard_added_by();

-- ---------------------------------------------------------------------------
-- Enable RLS on every table. TRUNCATE ignores RLS, so take it (and the
-- unused TRIGGER / REFERENCES privileges) away from the API roles.
-- ---------------------------------------------------------------------------
alter table public.branches       enable row level security;
alter table public.users          enable row level security;
alter table public.composers      enable row level security;
alter table public.songs          enable row level security;
alter table public.song_composers enable row level security;
alter table public.song_keys      enable row level security;
alter table public.resources      enable row level security;
alter table public.themes         enable row level security;
alter table public.theme_synonyms enable row level security;
alter table public.song_themes    enable row level security;
alter table public.branch_usage   enable row level security;
alter table public.lists          enable row level security;
alter table public.list_items     enable row level security;
alter table public.shares         enable row level security;
alter table public.audit_log      enable row level security;

revoke truncate, trigger, references on all tables in schema public from anon, authenticated;

-- ---------------------------------------------------------------------------
-- branches: read by any active user; admin:branches writes.
-- ---------------------------------------------------------------------------
drop policy if exists branches_select on public.branches;
create policy branches_select on public.branches for select to authenticated
  using ((select public.app_user_role()) is not null);

drop policy if exists branches_admin_write on public.branches;
create policy branches_admin_write on public.branches for all to authenticated
  using ((select public.app_role_at_least('admin')))
  with check ((select public.app_role_at_least('admin')));

-- ---------------------------------------------------------------------------
-- users: an active user reads their own row; admin:users reads and writes all.
-- (Owner/actor names for other users are resolved by server code.)
-- ---------------------------------------------------------------------------
drop policy if exists users_select on public.users;
create policy users_select on public.users for select to authenticated
  using (
    (id = (select auth.uid()) and (select public.app_user_role()) is not null)
    or (select public.app_role_at_least('admin'))
  );

drop policy if exists users_admin_write on public.users;
create policy users_admin_write on public.users for all to authenticated
  using ((select public.app_role_at_least('admin')))
  with check ((select public.app_role_at_least('admin')));

-- ---------------------------------------------------------------------------
-- songs: song:read (active users; soft-deleted rows only for admins),
-- song:write (contributor+), song:delete soft = setting deleted_at (admin),
-- song:set_added_by (admin; see trigger above). Hard delete: admin.
-- ---------------------------------------------------------------------------
drop policy if exists songs_select on public.songs;
create policy songs_select on public.songs for select to authenticated
  using (
    ((select public.app_user_role()) is not null and deleted_at is null)
    or (select public.app_role_at_least('admin'))
  );

drop policy if exists songs_insert on public.songs;
create policy songs_insert on public.songs for insert to authenticated
  with check (
    (select public.app_role_at_least('admin'))
    or (
      (select public.app_role_at_least('contributor'))
      and deleted_at is null
      and added_by_branch_id is not distinct from (select public.app_user_branch())
    )
  );

drop policy if exists songs_update on public.songs;
create policy songs_update on public.songs for update to authenticated
  using (
    (select public.app_role_at_least('admin'))
    or ((select public.app_role_at_least('contributor')) and deleted_at is null)
  )
  with check (
    (select public.app_role_at_least('admin'))
    or ((select public.app_role_at_least('contributor')) and deleted_at is null)
  );

drop policy if exists songs_delete on public.songs;
create policy songs_delete on public.songs for delete to authenticated
  using ((select public.app_role_at_least('admin')));

-- ---------------------------------------------------------------------------
-- Song children (song:write / resource:write). The `exists` on songs runs
-- under songs' own RLS, so children of a soft-deleted song are hidden from,
-- and read-only for, everyone but admins.
-- ---------------------------------------------------------------------------
drop policy if exists song_composers_select on public.song_composers;
create policy song_composers_select on public.song_composers for select to authenticated
  using (exists (select 1 from public.songs s where s.id = song_id));

drop policy if exists song_composers_write on public.song_composers;
create policy song_composers_write on public.song_composers for all to authenticated
  using (
    (select public.app_role_at_least('contributor'))
    and exists (select 1 from public.songs s where s.id = song_id)
  )
  with check (
    (select public.app_role_at_least('contributor'))
    and exists (select 1 from public.songs s where s.id = song_id)
  );

drop policy if exists song_keys_select on public.song_keys;
create policy song_keys_select on public.song_keys for select to authenticated
  using (exists (select 1 from public.songs s where s.id = song_id));

drop policy if exists song_keys_write on public.song_keys;
create policy song_keys_write on public.song_keys for all to authenticated
  using (
    (select public.app_role_at_least('contributor'))
    and exists (select 1 from public.songs s where s.id = song_id)
  )
  with check (
    (select public.app_role_at_least('contributor'))
    and exists (select 1 from public.songs s where s.id = song_id)
  );

drop policy if exists song_themes_select on public.song_themes;
create policy song_themes_select on public.song_themes for select to authenticated
  using (exists (select 1 from public.songs s where s.id = song_id));

drop policy if exists song_themes_write on public.song_themes;
create policy song_themes_write on public.song_themes for all to authenticated
  using (
    (select public.app_role_at_least('contributor'))
    and exists (select 1 from public.songs s where s.id = song_id)
  )
  with check (
    (select public.app_role_at_least('contributor'))
    and exists (select 1 from public.songs s where s.id = song_id)
  );

-- resource:read (any active user) / resource:write (contributor+).
drop policy if exists resources_select on public.resources;
create policy resources_select on public.resources for select to authenticated
  using (exists (select 1 from public.songs s where s.id = song_id));

drop policy if exists resources_write on public.resources;
create policy resources_write on public.resources for all to authenticated
  using (
    (select public.app_role_at_least('contributor'))
    and exists (select 1 from public.songs s where s.id = song_id)
  )
  with check (
    (select public.app_role_at_least('contributor'))
    and exists (select 1 from public.songs s where s.id = song_id)
  );

-- ---------------------------------------------------------------------------
-- composers: composer:create (contributor+, pop_member left at 'none');
-- composer:merge / set pop_member = update and delete (music_leader+).
-- ---------------------------------------------------------------------------
drop policy if exists composers_select on public.composers;
create policy composers_select on public.composers for select to authenticated
  using ((select public.app_user_role()) is not null);

drop policy if exists composers_insert on public.composers;
create policy composers_insert on public.composers for insert to authenticated
  with check (
    (select public.app_role_at_least('music_leader'))
    or ((select public.app_role_at_least('contributor')) and pop_member = 'none')
  );

drop policy if exists composers_update on public.composers;
create policy composers_update on public.composers for update to authenticated
  using ((select public.app_role_at_least('music_leader')))
  with check ((select public.app_role_at_least('music_leader')));

drop policy if exists composers_delete on public.composers;
create policy composers_delete on public.composers for delete to authenticated
  using ((select public.app_role_at_least('music_leader')));

-- ---------------------------------------------------------------------------
-- themes: theme:create (contributor+); theme:merge = update and delete
-- (music_leader+). theme_synonyms: theme:synonyms (music_leader+).
-- ---------------------------------------------------------------------------
drop policy if exists themes_select on public.themes;
create policy themes_select on public.themes for select to authenticated
  using ((select public.app_user_role()) is not null);

drop policy if exists themes_insert on public.themes;
create policy themes_insert on public.themes for insert to authenticated
  with check ((select public.app_role_at_least('contributor')));

drop policy if exists themes_update on public.themes;
create policy themes_update on public.themes for update to authenticated
  using ((select public.app_role_at_least('music_leader')))
  with check ((select public.app_role_at_least('music_leader')));

drop policy if exists themes_delete on public.themes;
create policy themes_delete on public.themes for delete to authenticated
  using ((select public.app_role_at_least('music_leader')));

drop policy if exists theme_synonyms_select on public.theme_synonyms;
create policy theme_synonyms_select on public.theme_synonyms for select to authenticated
  using ((select public.app_user_role()) is not null);

drop policy if exists theme_synonyms_write on public.theme_synonyms;
create policy theme_synonyms_write on public.theme_synonyms for all to authenticated
  using ((select public.app_role_at_least('music_leader')))
  with check ((select public.app_role_at_least('music_leader')));

-- ---------------------------------------------------------------------------
-- branch_usage: read by any active user; usage:write (contributor+).
-- ---------------------------------------------------------------------------
drop policy if exists branch_usage_select on public.branch_usage;
create policy branch_usage_select on public.branch_usage for select to authenticated
  using ((select public.app_user_role()) is not null);

drop policy if exists branch_usage_write on public.branch_usage;
create policy branch_usage_write on public.branch_usage for all to authenticated
  using ((select public.app_role_at_least('contributor')))
  with check ((select public.app_role_at_least('contributor')));

-- ---------------------------------------------------------------------------
-- lists (REQ-LIST-08).
--   list:read   setlists (not soft-deleted) for any active user; playlists and
--               the owner's own deleted lists for the owner; admin everything.
--   list:create any active user, as owner, stamped with their own branch.
--   list:write  owner; music_leader on a setlist of their branch; admin.
--               Covers rename, soft delete (deleted_at) and hard delete.
-- ---------------------------------------------------------------------------
drop policy if exists lists_select on public.lists;
create policy lists_select on public.lists for select to authenticated
  using (
    (select public.app_role_at_least('admin'))
    or (
      (select public.app_user_role()) is not null
      and (owner_id = (select auth.uid()) or (type = 'setlist' and deleted_at is null))
    )
  );

drop policy if exists lists_insert on public.lists;
create policy lists_insert on public.lists for insert to authenticated
  with check (
    (select public.app_role_at_least('admin'))
    or (
      (select public.app_user_role()) is not null
      and owner_id = (select auth.uid())
      and branch_id is not distinct from (select public.app_user_branch())
    )
  );

drop policy if exists lists_update on public.lists;
create policy lists_update on public.lists for update to authenticated
  using (
    (select public.app_role_at_least('admin'))
    or ((select public.app_user_role()) is not null and owner_id = (select auth.uid()))
    or (
      type = 'setlist'
      and (select public.app_user_role()) = 'music_leader'
      and branch_id = (select public.app_user_branch())
    )
  )
  with check (
    (select public.app_role_at_least('admin'))
    or ((select public.app_user_role()) is not null and owner_id = (select auth.uid()))
    or (
      type = 'setlist'
      and (select public.app_user_role()) = 'music_leader'
      and branch_id = (select public.app_user_branch())
    )
  );

drop policy if exists lists_delete on public.lists;
create policy lists_delete on public.lists for delete to authenticated
  using (
    (select public.app_role_at_least('admin'))
    or ((select public.app_user_role()) is not null and owner_id = (select auth.uid()))
    or (
      type = 'setlist'
      and (select public.app_user_role()) = 'music_leader'
      and branch_id = (select public.app_user_branch())
    )
  );

-- list_items: readable with the list; writable when the list is (list:write).
-- The subqueries on lists run under lists' own select policy.
drop policy if exists list_items_select on public.list_items;
create policy list_items_select on public.list_items for select to authenticated
  using (exists (select 1 from public.lists l where l.id = list_id));

drop policy if exists list_items_write on public.list_items;
create policy list_items_write on public.list_items for all to authenticated
  using (
    exists (
      select 1 from public.lists l
      where l.id = list_id
        and (
          (select public.app_role_at_least('admin'))
          or l.owner_id = (select auth.uid())
          or (
            l.type = 'setlist'
            and (select public.app_user_role()) = 'music_leader'
            and l.branch_id = (select public.app_user_branch())
          )
        )
    )
  )
  with check (
    exists (
      select 1 from public.lists l
      where l.id = list_id
        and (
          (select public.app_role_at_least('admin'))
          or l.owner_id = (select auth.uid())
          or (
            l.type = 'setlist'
            and (select public.app_user_role()) = 'music_leader'
            and l.branch_id = (select public.app_user_branch())
          )
        )
    )
  );

-- shares: share:create / share:revoke when list:write holds. Tokens are only
-- visible to users who can write the list; public reads use the service role.
drop policy if exists shares_select on public.shares;
create policy shares_select on public.shares for select to authenticated
  using (
    exists (
      select 1 from public.lists l
      where l.id = list_id
        and (
          (select public.app_role_at_least('admin'))
          or l.owner_id = (select auth.uid())
          or (
            l.type = 'setlist'
            and (select public.app_user_role()) = 'music_leader'
            and l.branch_id = (select public.app_user_branch())
          )
        )
    )
  );

drop policy if exists shares_insert on public.shares;
create policy shares_insert on public.shares for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and exists (
      select 1 from public.lists l
      where l.id = list_id
        and (
          (select public.app_role_at_least('admin'))
          or l.owner_id = (select auth.uid())
          or (
            l.type = 'setlist'
            and (select public.app_user_role()) = 'music_leader'
            and l.branch_id = (select public.app_user_branch())
          )
        )
    )
  );

drop policy if exists shares_update on public.shares;
create policy shares_update on public.shares for update to authenticated
  using (
    exists (
      select 1 from public.lists l
      where l.id = list_id
        and (
          (select public.app_role_at_least('admin'))
          or l.owner_id = (select auth.uid())
          or (
            l.type = 'setlist'
            and (select public.app_user_role()) = 'music_leader'
            and l.branch_id = (select public.app_user_branch())
          )
        )
    )
  )
  with check (
    exists (
      select 1 from public.lists l
      where l.id = list_id
        and (
          (select public.app_role_at_least('admin'))
          or l.owner_id = (select auth.uid())
          or (
            l.type = 'setlist'
            and (select public.app_user_role()) = 'music_leader'
            and l.branch_id = (select public.app_user_branch())
          )
        )
    )
  );

drop policy if exists shares_delete on public.shares;
create policy shares_delete on public.shares for delete to authenticated
  using (
    exists (
      select 1 from public.lists l
      where l.id = list_id
        and (
          (select public.app_role_at_least('admin'))
          or l.owner_id = (select auth.uid())
          or (
            l.type = 'setlist'
            and (select public.app_user_role()) = 'music_leader'
            and l.branch_id = (select public.app_user_branch())
          )
        )
    )
  );

-- ---------------------------------------------------------------------------
-- audit_log: audit:read (contributor+). Append-only and written by server
-- code (lib/audit.ts), so the API roles get no write policy.
-- ---------------------------------------------------------------------------
drop policy if exists audit_log_select on public.audit_log;
create policy audit_log_select on public.audit_log for select to authenticated
  using ((select public.app_role_at_least('contributor')));

-- ---------------------------------------------------------------------------
-- Storage: private bucket `resources` (contracts/schema.md "Storage").
-- Read: any active user. Write (upload / replace / delete): contributor+.
-- The server issues signed URLs with the service role; these policies cover
-- direct Storage API calls made with a user's JWT. Creating the bucket here
-- keeps local and CI stacks in line with hosted projects (OPS-01); it's a
-- no-op where the bucket already exists.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('resources', 'resources', false)
on conflict (id) do nothing;

drop policy if exists resources_bucket_select on storage.objects;
create policy resources_bucket_select on storage.objects for select to authenticated
  using (bucket_id = 'resources' and (select public.app_user_role()) is not null);

drop policy if exists resources_bucket_insert on storage.objects;
create policy resources_bucket_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'resources' and (select public.app_role_at_least('contributor')));

drop policy if exists resources_bucket_update on storage.objects;
create policy resources_bucket_update on storage.objects for update to authenticated
  using (bucket_id = 'resources' and (select public.app_role_at_least('contributor')))
  with check (bucket_id = 'resources' and (select public.app_role_at_least('contributor')));

drop policy if exists resources_bucket_delete on storage.objects;
create policy resources_bucket_delete on storage.objects for delete to authenticated
  using (bucket_id = 'resources' and (select public.app_role_at_least('contributor')));
insert into drizzle.__drizzle_migrations (hash, created_at) values ('8dab2d40fe6331fe51c58999ed598f51e9e17788fe998293230342c7f2f97203', 1793294800367);

-- ===== 0004_access_status =====
-- DB-07 · User access status (approval) (contracts/schema.md, contracts/permissions.md)
--
-- REQ-AUTH-03: anyone can request an account; new accounts start 'pending' and
--   see no data until an admin approves them. Invited accounts are approved
--   when created (the inviting code sets access_status = 'approved').
-- REQ-AUTH-08: admins approve or reject pending accounts; pending and rejected
--   users can read only their own users row (for the account-status page).
--
-- Every user that exists before this migration is backfilled 'approved'.
--
-- Enforcement: app_user_role() and app_user_branch() now return null unless
-- the caller is approved (and not disabled). Every DB-03 policy goes through
-- these helpers, so pending and rejected users get nothing from any table,
-- exactly like disabled users. users_select is the one exception: it lets any
-- non-disabled user read their own row without going through the helpers.

create type public.access_status as enum ('pending', 'approved', 'rejected');
-- Add with default 'approved' so existing rows are backfilled, then switch the
-- default to 'pending' for every row created from now on.
alter table public.users
  add column access_status public.access_status not null default 'approved',
  add column access_decided_by uuid,
  add column access_decided_at timestamp with time zone;
alter table public.users alter column access_status set default 'pending';
alter table public.users
  add constraint users_access_decided_by_fkey
  foreign key (access_decided_by) references public.users (id)
  on delete no action on update no action;
-- ---------------------------------------------------------------------------
-- RLS helpers (contracts/permissions.md "RLS helper functions"). Same
-- signatures as 0003, so existing grants and dependent policies are kept.
-- ---------------------------------------------------------------------------
create or replace function public.app_user_role()
returns public.role
language sql
stable
security definer
set search_path = ''
as $fn$
  select u.role from public.users u
  where u.id = auth.uid() and u.disabled_at is null and u.access_status = 'approved'
$fn$;
create or replace function public.app_user_branch()
returns uuid
language sql
stable
security definer
set search_path = ''
as $fn$
  select u.branch_id from public.users u
  where u.id = auth.uid() and u.disabled_at is null and u.access_status = 'approved'
$fn$;
-- ---------------------------------------------------------------------------
-- users: any non-disabled user (approved, pending or rejected) reads their own
-- row; admin:users reads all. Checks the row's own columns rather than
-- app_user_role(), which is null for pending and rejected users.
-- ---------------------------------------------------------------------------
drop policy if exists users_select on public.users;
create policy users_select on public.users for select to authenticated
  using (
    (id = (select auth.uid()) and disabled_at is null)
    or (select public.app_role_at_least('admin'))
  );
insert into drizzle.__drizzle_migrations (hash, created_at) values ('ef719d92aff147a2d3a8c577efe264bbaece8d6d60e2aaef68c7bbc957801b73', 1793360376949);

commit;
