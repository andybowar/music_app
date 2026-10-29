import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  pgTable,
  text,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { songs } from './songs';

export const songKeys = pgTable(
  'song_keys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    songId: uuid('song_id').notNull(),
    key: text('key').notNull(),
    isPrimary: boolean('is_primary').notNull().default(false),
    /** null → UI shows 'X' (MISSING_CHORD) */
    introChord: text('intro_chord'),
    verseChord: text('verse_chord'),
    chorusChord: text('chorus_chord'),
    bridgeChord: text('bridge_chord'),
  },
  (t) => [
    check('song_keys_key_check', sql`${t.key} ~ '^[A-G](#|b)?m?$'`),
    unique('song_keys_song_id_key_key').on(t.songId, t.key),
    uniqueIndex('song_keys_one_primary')
      .on(t.songId)
      .where(sql`${t.isPrimary}`),
    foreignKey({
      name: 'song_keys_song_id_fkey',
      columns: [t.songId],
      foreignColumns: [songs.id],
    }).onDelete('cascade'),
  ],
);
