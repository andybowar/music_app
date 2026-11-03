import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { FEATURE_REQUEST_KINDS, FEATURE_REQUEST_STATUSES } from '@/features/admin/backlog/types';
import { users } from './users';

// ADM-06 (REQ-ADM-01/02): the admin-only backlog. RLS (all operations need
// app_role_at_least('admin')) and the `admin-attachments` bucket live in 0006_admin_backlog.sql.
// The enums are declared here rather than in ./enums: their values are feature-local
// (features/admin/backlog/types.ts), not part of types/domain.ts.

export const featureRequestKindEnum = pgEnum('feature_request_kind', FEATURE_REQUEST_KINDS);
export const featureRequestStatusEnum = pgEnum('feature_request_status', FEATURE_REQUEST_STATUSES);

export const adminTodos = pgTable(
  'admin_todos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    title: text('title').notNull(),
    notes: text('notes'),
    doneAt: timestamp('done_at', { withTimezone: true }),
    doneBy: uuid('done_by'),
    createdBy: uuid('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('admin_todos_title_check', sql`char_length(${t.title}) between 1 and 200`),
    check('admin_todos_notes_check', sql`char_length(${t.notes}) <= 2000`),
    foreignKey({
      name: 'admin_todos_done_by_fkey',
      columns: [t.doneBy],
      foreignColumns: [users.id],
    }),
    foreignKey({
      name: 'admin_todos_created_by_fkey',
      columns: [t.createdBy],
      foreignColumns: [users.id],
    }),
  ],
);

export const featureRequests = pgTable(
  'feature_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: featureRequestKindEnum('kind').notNull().default('enhancement'),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    status: featureRequestStatusEnum('status').notNull().default('new'),
    createdBy: uuid('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('feature_requests_title_check', sql`char_length(${t.title}) between 1 and 200`),
    check('feature_requests_description_check', sql`char_length(${t.description}) <= 10000`),
    foreignKey({
      name: 'feature_requests_created_by_fkey',
      columns: [t.createdBy],
      foreignColumns: [users.id],
    }),
  ],
);

/** Wireframes; at most 5 per request (enforced server-side). */
export const featureRequestImages = pgTable(
  'feature_request_images',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    requestId: uuid('request_id').notNull(),
    /** 'requests/{request_id}/{id}.{ext}' in bucket admin-attachments */
    storagePath: text('storage_path').notNull().unique('feature_request_images_storage_path_key'),
    fileName: text('file_name').notNull(),
    mimeType: text('mime_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    createdBy: uuid('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      'feature_request_images_mime_type_check',
      sql`${t.mimeType} in ('image/png','image/jpeg','image/webp','image/gif')`,
    ),
    check('feature_request_images_size_bytes_check', sql`${t.sizeBytes} between 1 and 10485760`),
    foreignKey({
      name: 'feature_request_images_request_id_fkey',
      columns: [t.requestId],
      foreignColumns: [featureRequests.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'feature_request_images_created_by_fkey',
      columns: [t.createdBy],
      foreignColumns: [users.id],
    }),
  ],
);
