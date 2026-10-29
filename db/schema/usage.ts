import { foreignKey, pgTable, primaryKey, timestamp, uuid } from 'drizzle-orm/pg-core';
import { branches } from './branches';
import { usageLevelEnum, usageSourceEnum } from './enums';
import { songs } from './songs';

export const branchUsage = pgTable(
  'branch_usage',
  {
    songId: uuid('song_id').notNull(),
    branchId: uuid('branch_id').notNull(),
    level: usageLevelEnum('level').notNull(),
    source: usageSourceEnum('source').notNull().default('manual'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ name: 'branch_usage_pkey', columns: [t.songId, t.branchId] }),
    foreignKey({
      name: 'branch_usage_song_id_fkey',
      columns: [t.songId],
      foreignColumns: [songs.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'branch_usage_branch_id_fkey',
      columns: [t.branchId],
      foreignColumns: [branches.id],
    }).onDelete('cascade'),
  ],
);
