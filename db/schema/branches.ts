import { sql } from 'drizzle-orm';
import { check, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const branches = pgTable(
  'branches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** 'Servant', 'Portland', 'CO Springs', 'Rockford' */
    name: text('name').notNull().unique('branches_name_key'),
    /** 'SV', 'OR', 'CO', 'RF' (shown in the song row) */
    code: text('code').notNull().unique('branches_code_key'),
    /** IdP group name mapping users to this branch */
    ssoGroup: text('sso_group').unique('branches_sso_group_key'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check('branches_code_check', sql`${t.code} ~ '^[A-Z]{2,3}$'`)],
);
