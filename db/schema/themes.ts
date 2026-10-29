import { sql } from 'drizzle-orm';
import { check, foreignKey, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { lyricSectionEnum } from './enums';
import { songs } from './songs';
import { users } from './users';

export const themes = pgTable(
  'themes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull().unique('themes_name_key'),
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('themes_name_check', sql`${t.name} = lower(btrim(${t.name}))`),
    foreignKey({
      name: 'themes_created_by_fkey',
      columns: [t.createdBy],
      foreignColumns: [users.id],
    }),
  ],
);

/** Used in Phase 5 (H-02); created now to avoid a later migration. */
export const themeSynonyms = pgTable(
  'theme_synonyms',
  {
    themeId: uuid('theme_id').notNull(),
    synonym: text('synonym').notNull(),
  },
  (t) => [
    check('theme_synonyms_synonym_check', sql`${t.synonym} = lower(btrim(${t.synonym}))`),
    primaryKey({ name: 'theme_synonyms_pkey', columns: [t.themeId, t.synonym] }),
    foreignKey({
      name: 'theme_synonyms_theme_id_fkey',
      columns: [t.themeId],
      foreignColumns: [themes.id],
    }).onDelete('cascade'),
  ],
);

export const songThemes = pgTable(
  'song_themes',
  {
    songId: uuid('song_id').notNull(),
    themeId: uuid('theme_id').notNull(),
    section: lyricSectionEnum('section').notNull(),
  },
  (t) => [
    primaryKey({ name: 'song_themes_pkey', columns: [t.songId, t.themeId, t.section] }),
    foreignKey({
      name: 'song_themes_song_id_fkey',
      columns: [t.songId],
      foreignColumns: [songs.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'song_themes_theme_id_fkey',
      columns: [t.themeId],
      foreignColumns: [themes.id],
    }).onDelete('cascade'),
  ],
);
