import { customType, foreignKey, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { lists } from './lists';
import { users } from './users';

/** Postgres `bytea`, read and written as a Node `Buffer`. */
const bytea = customType<{ data: Buffer }>({
  dataType() {
    return 'bytea';
  },
});

export const shares = pgTable(
  'shares',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    listId: uuid('list_id').notNull(),
    /**
     * Deprecated (CR SHR-01, SHR-05): the raw token, kept only so the build that was live
     * before 0009 keeps working during the deploy. New rows leave it null; a later migration
     * drops it. Never select it.
     */
    token: text('token').unique('shares_token_key'),
    /** sha256 of the token (32 random bytes, base64url). The token itself is never stored. */
    tokenHash: bytea('token_hash').notNull().unique('shares_token_hash_key'),
    /** First 6 characters of the token, for display only. */
    tokenPrefix: text('token_prefix').notNull(),
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
