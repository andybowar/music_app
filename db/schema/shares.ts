import { foreignKey, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { lists } from './lists';
import { users } from './users';

export const shares = pgTable(
  'shares',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    listId: uuid('list_id').notNull(),
    /** 32 random bytes, base64url. */
    token: text('token').notNull().unique('shares_token_key'),
    createdBy: uuid('created_by').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: 'shares_list_id_fkey',
      columns: [t.listId],
      foreignColumns: [lists.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'shares_created_by_fkey',
      columns: [t.createdBy],
      foreignColumns: [users.id],
    }),
  ],
);
