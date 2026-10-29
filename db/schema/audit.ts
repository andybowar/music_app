import { sql } from 'drizzle-orm';
import { foreignKey, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { auditActionEnum } from './enums';
import { users } from './users';

export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    actorId: uuid('actor_id'),
    /** 'song', 'song_key', 'resource', 'branch_usage', 'song_themes', ... */
    entity: text('entity').notNull(),
    entityId: uuid('entity_id').notNull(),
    action: auditActionEnum('action').notNull(),
    diff: jsonb('diff')
      .$type<Record<string, { from: unknown; to: unknown }>>()
      .notNull()
      .default(sql`'{}'`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: 'audit_log_actor_id_fkey',
      columns: [t.actorId],
      foreignColumns: [users.id],
    }),
  ],
);
