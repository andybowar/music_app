import { sql } from 'drizzle-orm';
import {
  check,
  date,
  foreignKey,
  integer,
  pgTable,
  smallint,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { branches } from './branches';
import { energyLevelEnum, listTypeEnum } from './enums';
import { resources } from './resources';
import { songs } from './songs';
import { users } from './users';

export const lists = pgTable(
  'lists',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    type: listTypeEnum('type').notNull(),
    name: text('name').notNull(),
    /** Plain date, no time zone (AGENTS.md §7). */
    eventDate: date('event_date', { mode: 'string' }),
    ownerId: uuid('owner_id').notNull(),
    /** Owner's branch at creation. */
    branchId: uuid('branch_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    check('lists_name_check', sql`length(${t.name}) between 1 and 120`),
    check('lists_check', sql`${t.type} <> 'setlist' or ${t.eventDate} is not null`),
    foreignKey({ name: 'lists_owner_id_fkey', columns: [t.ownerId], foreignColumns: [users.id] }),
    foreignKey({
      name: 'lists_branch_id_fkey',
      columns: [t.branchId],
      foreignColumns: [branches.id],
    }),
  ],
);

export const listItems = pgTable(
  'list_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    listId: uuid('list_id').notNull(),
    songId: uuid('song_id').notNull(),
    /** 0-based, contiguous after reorder. */
    position: integer('position').notNull(),
    overrideKey: text('override_key'),
    overrideBpm: smallint('override_bpm'),
    overrideEnergy: energyLevelEnum('override_energy'),
    /** Playlist audio choice. */
    resourceId: uuid('resource_id'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('list_items_override_key_check', sql`${t.overrideKey} ~ '^[A-G](#|b)?m?$'`),
    check('list_items_override_bpm_check', sql`${t.overrideBpm} between 20 and 300`),
    foreignKey({
      name: 'list_items_list_id_fkey',
      columns: [t.listId],
      foreignColumns: [lists.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'list_items_song_id_fkey',
      columns: [t.songId],
      foreignColumns: [songs.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'list_items_resource_id_fkey',
      columns: [t.resourceId],
      foreignColumns: [resources.id],
    }).onDelete('set null'),
  ],
);
