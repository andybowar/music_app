-- Extensions (contracts/schema.md "Extensions & enums"). drizzle-kit does not emit these;
-- they were added by hand. pg_trgm and unaccent are used by DB-02 search indexes/triggers.
-- The `extensions` schema is created by Supabase (local stack, CI and hosted), so it is not
-- created here.
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;--> statement-breakpoint
CREATE TYPE "public"."audit_action" AS ENUM('create', 'update', 'delete');--> statement-breakpoint
CREATE TYPE "public"."auth_provider" AS ENUM('google', 'microsoft', 'saml', 'password');--> statement-breakpoint
CREATE TYPE "public"."energy_level" AS ENUM('high_praise', 'high_worship', 'mid_worship', 'deep_worship', 'quiet_worship');--> statement-breakpoint
CREATE TYPE "public"."list_type" AS ENUM('setlist', 'playlist');--> statement-breakpoint
CREATE TYPE "public"."lyric_section" AS ENUM('chorus', 'verse_1', 'verse_2', 'verse_3', 'verse_4', 'verse_5', 'bridge');--> statement-breakpoint
CREATE TYPE "public"."pop_member" AS ENUM('none', 'past', 'current');--> statement-breakpoint
CREATE TYPE "public"."resource_format" AS ENUM('pdf', 'mp3', 'm4a', 'pro', 'mdb', 'ppt', 'pptx', 'url');--> statement-breakpoint
CREATE TYPE "public"."resource_kind" AS ENUM('full_score', 'lead_sheet', 'chord_chart', 'audio', 'video_link', 'instruction_link', 'projection');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('member', 'contributor', 'music_leader', 'admin');--> statement-breakpoint
CREATE TYPE "public"."usage_level" AS ENUM('high', 'low', 'rare', 'none');--> statement-breakpoint
CREATE TYPE "public"."usage_source" AS ENUM('manual', 'derived');--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
CREATE TABLE "composers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"pop_member" "pop_member" DEFAULT 'none' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "song_composers" (
	"song_id" uuid NOT NULL,
	"composer_id" uuid NOT NULL,
	"sort_order" smallint DEFAULT 0 NOT NULL,
	CONSTRAINT "song_composers_pkey" PRIMARY KEY("song_id","composer_id")
);
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
CREATE TABLE "song_themes" (
	"song_id" uuid NOT NULL,
	"theme_id" uuid NOT NULL,
	"section" "lyric_section" NOT NULL,
	CONSTRAINT "song_themes_pkey" PRIMARY KEY("song_id","theme_id","section")
);
--> statement-breakpoint
CREATE TABLE "theme_synonyms" (
	"theme_id" uuid NOT NULL,
	"synonym" text NOT NULL,
	CONSTRAINT "theme_synonyms_pkey" PRIMARY KEY("theme_id","synonym"),
	CONSTRAINT "theme_synonyms_synonym_check" CHECK ("theme_synonyms"."synonym" = lower(btrim("theme_synonyms"."synonym")))
);
--> statement-breakpoint
CREATE TABLE "themes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "themes_name_key" UNIQUE("name"),
	CONSTRAINT "themes_name_check" CHECK ("themes"."name" = lower(btrim("themes"."name")))
);
--> statement-breakpoint
CREATE TABLE "branch_usage" (
	"song_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"level" "usage_level" NOT NULL,
	"source" "usage_source" DEFAULT 'manual' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "branch_usage_pkey" PRIMARY KEY("song_id","branch_id")
);
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"entity" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"action" "audit_action" NOT NULL,
	"diff" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "song_composers" ADD CONSTRAINT "song_composers_song_id_fkey" FOREIGN KEY ("song_id") REFERENCES "public"."songs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "song_composers" ADD CONSTRAINT "song_composers_composer_id_fkey" FOREIGN KEY ("composer_id") REFERENCES "public"."composers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "songs" ADD CONSTRAINT "songs_added_by_branch_id_fkey" FOREIGN KEY ("added_by_branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "songs" ADD CONSTRAINT "songs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "songs" ADD CONSTRAINT "songs_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "song_keys" ADD CONSTRAINT "song_keys_song_id_fkey" FOREIGN KEY ("song_id") REFERENCES "public"."songs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_song_id_fkey" FOREIGN KEY ("song_id") REFERENCES "public"."songs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_song_key_id_fkey" FOREIGN KEY ("song_key_id") REFERENCES "public"."song_keys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "song_themes" ADD CONSTRAINT "song_themes_song_id_fkey" FOREIGN KEY ("song_id") REFERENCES "public"."songs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "song_themes" ADD CONSTRAINT "song_themes_theme_id_fkey" FOREIGN KEY ("theme_id") REFERENCES "public"."themes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "theme_synonyms" ADD CONSTRAINT "theme_synonyms_theme_id_fkey" FOREIGN KEY ("theme_id") REFERENCES "public"."themes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "themes" ADD CONSTRAINT "themes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branch_usage" ADD CONSTRAINT "branch_usage_song_id_fkey" FOREIGN KEY ("song_id") REFERENCES "public"."songs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branch_usage" ADD CONSTRAINT "branch_usage_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_items" ADD CONSTRAINT "list_items_list_id_fkey" FOREIGN KEY ("list_id") REFERENCES "public"."lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_items" ADD CONSTRAINT "list_items_song_id_fkey" FOREIGN KEY ("song_id") REFERENCES "public"."songs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_items" ADD CONSTRAINT "list_items_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lists" ADD CONSTRAINT "lists_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lists" ADD CONSTRAINT "lists_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shares" ADD CONSTRAINT "shares_list_id_fkey" FOREIGN KEY ("list_id") REFERENCES "public"."lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shares" ADD CONSTRAINT "shares_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "composers_name_uq" ON "composers" USING btree (lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "song_keys_one_primary" ON "song_keys" USING btree ("song_id") WHERE "song_keys"."is_primary";
