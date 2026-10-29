import { sql } from 'drizzle-orm';
import { bigint, check, foreignKey, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { resourceFormatEnum, resourceKindEnum } from './enums';
import { songKeys } from './keys';
import { songs } from './songs';
import { users } from './users';

export const resources = pgTable(
  'resources',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    songId: uuid('song_id').notNull(),
    /** null only for kind = 'projection' */
    songKeyId: uuid('song_key_id'),
    kind: resourceKindEnum('kind').notNull(),
    format: resourceFormatEnum('format').notNull(),
    label: text('label').notNull(),
    /** 'songs/{song_id}/{song_key_id|common}/{id}.{ext}' */
    storagePath: text('storage_path'),
    url: text('url'),
    sizeBytes: bigint('size_bytes', { mode: 'number' }),
    mimeType: text('mime_type'),
    uploadedBy: uuid('uploaded_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Names match what Postgres gives the contract's unnamed table checks.
    check('resources_check', sql`(${t.storagePath} is null) <> (${t.url} is null)`),
    check('resources_check1', sql`(${t.format} = 'url') = (${t.url} is not null)`),
    check('resources_check2', sql`(${t.kind} = 'projection') = (${t.songKeyId} is null)`),
    foreignKey({
      name: 'resources_song_id_fkey',
      columns: [t.songId],
      foreignColumns: [songs.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'resources_song_key_id_fkey',
      columns: [t.songKeyId],
      foreignColumns: [songKeys.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'resources_uploaded_by_fkey',
      columns: [t.uploadedBy],
      foreignColumns: [users.id],
    }),
  ],
);
