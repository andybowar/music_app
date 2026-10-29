import { foreignKey, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { authUsers } from 'drizzle-orm/supabase';
import { branches } from './branches';
import { authProviderEnum, roleEnum } from './enums';

// `authUsers` (Supabase's auth.users) is referenced but deliberately not
// re-exported, so drizzle-kit never tries to create or alter the auth schema.

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey(),
    email: text('email').notNull().unique('users_email_key'),
    name: text('name').notNull(),
    branchId: uuid('branch_id'),
    role: roleEnum('role').notNull().default('member'),
    authProvider: authProviderEnum('auth_provider').notNull(),
    ssoSubject: text('sso_subject'),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    disabledAt: timestamp('disabled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({ name: 'users_id_fkey', columns: [t.id], foreignColumns: [authUsers.id] }).onDelete(
      'cascade',
    ),
    foreignKey({
      name: 'users_branch_id_fkey',
      columns: [t.branchId],
      foreignColumns: [branches.id],
    }),
  ],
);
