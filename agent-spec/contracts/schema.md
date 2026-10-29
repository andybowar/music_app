# Contract: Database schema

**Status: FROZEN.** Postgres 15+. Task `DB-01` implements this as Drizzle definitions in `db/schema/*.ts` and generates the initial migration; `DB-02` adds triggers and search indexes; `DB-03` adds RLS. The DDL below is authoritative — Drizzle output must be equivalent.

Conventions: `snake_case` columns, `uuid` PKs (`gen_random_uuid()`), `timestamptz` everywhere, soft delete via `deleted_at` only where noted. Enum values mirror `contracts/types.md`.

## Extensions & enums

Extensions live in Supabase's `extensions` schema, not `public`, so their functions and operator classes are reached through that schema. The `postgres` role, which runs migrations and is the `DATABASE_URL` user, has `extensions` on its `search_path`. PostgREST adds it for API requests via `extra_search_path` in `supabase/config.toml`. DDL that can run with a different or empty `search_path` must schema-qualify, for example `extensions.gin_trgm_ops` in index opclasses, or `extensions.unaccent(...)` in generated columns, index expressions and trigger functions (especially `set search_path = ''` functions).

```sql
create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;

create type role           as enum ('member','contributor','music_leader','admin');
create type auth_provider  as enum ('google','microsoft','saml','password');
create type energy_level   as enum ('high_praise','high_worship','mid_worship','deep_worship','quiet_worship');
create type lyric_section  as enum ('chorus','verse_1','verse_2','verse_3','verse_4','verse_5','bridge');
create type usage_level    as enum ('high','low','rare','none');
create type usage_source   as enum ('manual','derived');
create type pop_member     as enum ('none','past','current');
create type resource_kind  as enum ('full_score','lead_sheet','chord_chart','audio','video_link','instruction_link','projection');
create type resource_format as enum ('pdf','mp3','m4a','pro','mdb','ppt','pptx','url');
create type list_type      as enum ('setlist','playlist');
create type audit_action   as enum ('create','update','delete');
```

## Tables

```sql
create table branches (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,                 -- 'Servant', 'Portland', 'CO Springs', 'Rockford'
  code        text not null unique check (code ~ '^[A-Z]{2,3}$'),  -- 'SV','OR','CO','RF' (shown in song row)
  sso_group   text unique,                          -- IdP group name mapping users to this branch
  created_at  timestamptz not null default now()
);

create table users (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text not null unique,
  name          text not null,
  branch_id     uuid references branches(id),
  role          role not null default 'member',
  auth_provider auth_provider not null,
  sso_subject   text,
  last_login_at timestamptz,
  disabled_at   timestamptz,
  created_at    timestamptz not null default now()
);

create table composers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  pop_member  pop_member not null default 'none',
  created_at  timestamptz not null default now()
);
create unique index composers_name_uq on composers (lower(name));

create table songs (
  id               uuid primary key default gen_random_uuid(),
  -- identity
  title            text not null check (length(title) between 1 and 200),
  alt_titles       text[] not null default '{}',
  year             smallint check (year between 1000 and 2100),
  source_group     text,
  -- musical
  tempo_bpm        smallint check (tempo_bpm between 20 and 300),
  time_signature   text check (time_signature ~ '^\d{1,2}/\d{1,2}$'),
  energy_level     energy_level,
  energy_notes     text,
  -- lyrics: complete song, chorus + up to 5 verses + bridge
  chorus_lyrics    text,
  verse_1_lyrics   text,
  verse_2_lyrics   text,
  verse_3_lyrics   text,
  verse_4_lyrics   text,
  verse_5_lyrics   text,
  bridge_lyrics    text,
  arrangement      lyric_section[] not null default '{}',   -- e.g. {verse_1,chorus,verse_2,chorus,bridge,chorus}
  -- derived (maintained by triggers in DB-02; never written by app code)
  chorus_line      text,         -- first non-empty line of chorus_lyrics
  verse1_line      text,         -- first non-empty line of verse_1_lyrics
  composer_names   text not null default '',   -- denormalized, space-joined
  theme_names      text not null default '',   -- denormalized, space-joined
  search_vector    tsvector,
  -- audit
  added_by_branch_id uuid references branches(id),
  created_by       uuid references users(id),
  updated_by       uuid references users(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz
);

create table song_composers (
  song_id     uuid not null references songs(id) on delete cascade,
  composer_id uuid not null references composers(id) on delete restrict,
  sort_order  smallint not null default 0,
  primary key (song_id, composer_id)
);

create table song_keys (
  id            uuid primary key default gen_random_uuid(),
  song_id       uuid not null references songs(id) on delete cascade,
  key           text not null check (key ~ '^[A-G](#|b)?m?$'),
  is_primary    boolean not null default false,
  intro_chord   text,     -- null → UI shows 'X'
  verse_chord   text,
  chorus_chord  text,
  bridge_chord  text,
  unique (song_id, key)
);
create unique index song_keys_one_primary on song_keys (song_id) where is_primary;

create table resources (
  id            uuid primary key default gen_random_uuid(),
  song_id       uuid not null references songs(id) on delete cascade,
  song_key_id   uuid references song_keys(id) on delete cascade,   -- null only for kind='projection'
  kind          resource_kind not null,
  format        resource_format not null,
  label         text not null,
  storage_path  text,          -- 'songs/{song_id}/{song_key_id|common}/{id}.{ext}'
  url           text,
  size_bytes    bigint,
  mime_type     text,
  uploaded_by   uuid references users(id),
  created_at    timestamptz not null default now(),
  check ((storage_path is null) <> (url is null)),
  check ((format = 'url') = (url is not null)),
  check ((kind = 'projection') = (song_key_id is null))
);

create table themes (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique check (name = lower(btrim(name))),
  created_by  uuid references users(id),
  created_at  timestamptz not null default now()
);

create table theme_synonyms (            -- used in Phase 5 (H-02); created now to avoid later migrations
  theme_id    uuid not null references themes(id) on delete cascade,
  synonym     text not null check (synonym = lower(btrim(synonym))),
  primary key (theme_id, synonym)
);

create table song_themes (
  song_id     uuid not null references songs(id) on delete cascade,
  theme_id    uuid not null references themes(id) on delete cascade,
  section     lyric_section not null,
  primary key (song_id, theme_id, section)
);

create table branch_usage (
  song_id     uuid not null references songs(id) on delete cascade,
  branch_id   uuid not null references branches(id) on delete cascade,
  level       usage_level not null,
  source      usage_source not null default 'manual',
  updated_at  timestamptz not null default now(),
  primary key (song_id, branch_id)
);

create table lists (
  id          uuid primary key default gen_random_uuid(),
  type        list_type not null,
  name        text not null check (length(name) between 1 and 120),
  event_date  date,
  owner_id    uuid not null references users(id),
  branch_id   uuid references branches(id),      -- owner's branch at creation
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  check (type <> 'setlist' or event_date is not null)
);

create table list_items (
  id              uuid primary key default gen_random_uuid(),
  list_id         uuid not null references lists(id) on delete cascade,
  song_id         uuid not null references songs(id) on delete restrict,
  position        integer not null,                  -- 0-based, contiguous after reorder
  override_key    text check (override_key ~ '^[A-G](#|b)?m?$'),
  override_bpm    smallint check (override_bpm between 20 and 300),
  override_energy energy_level,
  resource_id     uuid references resources(id) on delete set null,   -- playlist audio choice
  notes           text,
  created_at      timestamptz not null default now()
);

create table shares (
  id          uuid primary key default gen_random_uuid(),
  list_id     uuid not null references lists(id) on delete cascade,
  token       text not null unique,                 -- 32 random bytes, base64url
  created_by  uuid not null references users(id),
  expires_at  timestamptz,
  revoked_at  timestamptz,
  created_at  timestamptz not null default now()
);

create table audit_log (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references users(id),
  entity      text not null,             -- 'song','song_key','resource','branch_usage','song_themes',...
  entity_id   uuid not null,
  action      audit_action not null,
  diff        jsonb not null default '{}',
  created_at  timestamptz not null default now()
);
```

## Indexes (DB-02)

```sql
create index songs_search_gin     on songs using gin (search_vector);
create index songs_title_trgm     on songs using gin (lower(title) gin_trgm_ops);
create index songs_created_at     on songs (created_at desc, title);
create index songs_energy         on songs (energy_level);
create index songs_year           on songs (year);
create index song_keys_key        on song_keys (key);
create index song_keys_chords     on song_keys (song_id) include (chorus_chord, verse_chord, bridge_chord) where is_primary;
create index song_themes_theme    on song_themes (theme_id);
create index list_items_list_pos  on list_items (list_id, position);
create index lists_owner          on lists (owner_id) where deleted_at is null;
create index lists_branch_date    on lists (branch_id, event_date) where deleted_at is null;
create index audit_entity         on audit_log (entity, entity_id, created_at desc);
```

## Triggers (DB-02)

| Trigger | On | Behavior |
|---|---|---|
| `songs_derive_lines` | `songs` BEFORE INSERT/UPDATE | Set `chorus_line`, `verse1_line` = first non-empty trimmed line of the respective lyrics; set `updated_at = now()` on update |
| `songs_search_refresh` | `songs` BEFORE INSERT/UPDATE | Rebuild `search_vector` (see weights) |
| `song_composers_denorm` | `song_composers` AFTER INSERT/UPDATE/DELETE | Recompute `songs.composer_names` for affected song (forces search refresh) |
| `song_themes_denorm` | `song_themes` AFTER INSERT/UPDATE/DELETE | Recompute `songs.theme_names` for affected song |
| `composers_rename` | `composers` AFTER UPDATE OF name | Recompute `composer_names` for all linked songs |

### search_vector weights (used by field toggles via `ts_filter`)

| Weight | Field toggle | Source |
|---|---|---|
| A | `title` | `title` + `alt_titles` |
| B | `themes` | `theme_names` |
| C | `composer` | `composer_names` |
| D | `lyrics` | all 7 lyric columns |

Use config `english` with `unaccent`. Example:
```sql
new.search_vector :=
  setweight(to_tsvector('english', unaccent(coalesce(new.title,'') || ' ' || array_to_string(new.alt_titles,' '))), 'A') ||
  setweight(to_tsvector('english', unaccent(new.theme_names)), 'B') ||
  setweight(to_tsvector('simple',  unaccent(new.composer_names)), 'C') ||
  setweight(to_tsvector('english', unaccent(concat_ws(' ', new.chorus_lyrics, new.verse_1_lyrics, new.verse_2_lyrics,
     new.verse_3_lyrics, new.verse_4_lyrics, new.verse_5_lyrics, new.bridge_lyrics))), 'D');
```

## Storage

- Bucket `resources`, **private**.
- Path: `songs/{song_id}/{song_key_id or 'common'}/{resource_id}.{ext}`.
- Upload flow: server issues signed upload URL → client PUTs file → server finalizes `resources` row (verifies object exists and size).
- Read: server issues signed URL, TTL `SIGNED_URL_TTL_SECONDS`.
