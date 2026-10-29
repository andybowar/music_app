import { sql } from 'drizzle-orm';
import {
  check,
  customType,
  foreignKey,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { branches } from './branches';
import { energyLevelEnum, lyricSectionEnum, popMemberEnum } from './enums';
import { users } from './users';

const tsvector = customType<{ data: string }>({
  dataType: () => 'tsvector',
});

export const composers = pgTable(
  'composers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    popMember: popMemberEnum('pop_member').notNull().default('none'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('composers_name_uq').on(sql`lower(${t.name})`)],
);

export const songs = pgTable(
  'songs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // identity
    title: text('title').notNull(),
    altTitles: text('alt_titles')
      .array()
      .notNull()
      .default(sql`'{}'`),
    year: smallint('year'),
    sourceGroup: text('source_group'),
    // musical
    tempoBpm: smallint('tempo_bpm'),
    timeSignature: text('time_signature'),
    energyLevel: energyLevelEnum('energy_level'),
    energyNotes: text('energy_notes'),
    // lyrics: chorus + up to 5 verses + bridge
    chorusLyrics: text('chorus_lyrics'),
    verse1Lyrics: text('verse_1_lyrics'),
    verse2Lyrics: text('verse_2_lyrics'),
    verse3Lyrics: text('verse_3_lyrics'),
    verse4Lyrics: text('verse_4_lyrics'),
    verse5Lyrics: text('verse_5_lyrics'),
    bridgeLyrics: text('bridge_lyrics'),
    /** Sections as sung, repeats allowed, e.g. {verse_1,chorus,verse_2,chorus,bridge,chorus} */
    arrangement: lyricSectionEnum('arrangement')
      .array()
      .notNull()
      .default(sql`'{}'`),
    // derived: maintained by DB-02 triggers, never written by app code
    chorusLine: text('chorus_line'),
    verse1Line: text('verse1_line'),
    composerNames: text('composer_names').notNull().default(''),
    themeNames: text('theme_names').notNull().default(''),
    searchVector: tsvector('search_vector'),
    // audit
    addedByBranchId: uuid('added_by_branch_id'),
    createdBy: uuid('created_by'),
    updatedBy: uuid('updated_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    check('songs_title_check', sql`length(${t.title}) between 1 and 200`),
    check('songs_year_check', sql`${t.year} between 1000 and 2100`),
    check('songs_tempo_bpm_check', sql`${t.tempoBpm} between 20 and 300`),
    check('songs_time_signature_check', sql`${t.timeSignature} ~ '^\\d{1,2}/\\d{1,2}$'`),
    foreignKey({
      name: 'songs_added_by_branch_id_fkey',
      columns: [t.addedByBranchId],
      foreignColumns: [branches.id],
    }),
    foreignKey({
      name: 'songs_created_by_fkey',
      columns: [t.createdBy],
      foreignColumns: [users.id],
    }),
    foreignKey({
      name: 'songs_updated_by_fkey',
      columns: [t.updatedBy],
      foreignColumns: [users.id],
    }),
  ],
);

export const songComposers = pgTable(
  'song_composers',
  {
    songId: uuid('song_id').notNull(),
    composerId: uuid('composer_id').notNull(),
    sortOrder: smallint('sort_order').notNull().default(0),
  },
  (t) => [
    primaryKey({ name: 'song_composers_pkey', columns: [t.songId, t.composerId] }),
    foreignKey({
      name: 'song_composers_song_id_fkey',
      columns: [t.songId],
      foreignColumns: [songs.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'song_composers_composer_id_fkey',
      columns: [t.composerId],
      foreignColumns: [composers.id],
    }).onDelete('restrict'),
  ],
);
