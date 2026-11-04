import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { BUG_REPORT_STATUSES } from '@/features/bugs/types';
import { users } from './users';

// ADM-08 (REQ-ADM-03): bug reports from any approved user. RLS (own rows or admin; images
// insertable by the report's creator within 24 h) and the updated_at trigger live in
// 0008_bug_reports.sql. Images use ADM-06's private `admin-attachments` bucket under bugs/.
// The enum is declared here rather than in ./enums: its values are feature-local
// (features/bugs/types.ts), not part of types/domain.ts.

export const bugReportStatusEnum = pgEnum('bug_report_status', BUG_REPORT_STATUSES);

export const bugReports = pgTable(
  'bug_reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    title: text('title').notNull(),
    description: text('description').notNull(),
    expected: text('expected'),
    pagePath: text('page_path'),
    userAgent: text('user_agent'),
    /** e.g. '390x844' */
    viewport: text('viewport'),
    /** VERCEL_GIT_COMMIT_SHA or null */
    appVersion: text('app_version'),
    status: bugReportStatusEnum('status').notNull().default('new'),
    /** Shown to the reporter. */
    adminNote: text('admin_note'),
    createdBy: uuid('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('bug_reports_title_check', sql`char_length(${t.title}) between 1 and 200`),
    check('bug_reports_description_check', sql`char_length(${t.description}) between 1 and 10000`),
    check('bug_reports_expected_check', sql`char_length(${t.expected}) <= 2000`),
    check(
      'bug_reports_page_path_check',
      sql`${t.pagePath} ~ '^/' and char_length(${t.pagePath}) <= 2000`,
    ),
    check('bug_reports_user_agent_check', sql`char_length(${t.userAgent}) <= 1000`),
    check('bug_reports_viewport_check', sql`char_length(${t.viewport}) <= 40`),
    check('bug_reports_admin_note_check', sql`char_length(${t.adminNote}) <= 2000`),
    foreignKey({
      name: 'bug_reports_created_by_fkey',
      columns: [t.createdBy],
      foreignColumns: [users.id],
    }),
    // "My reports" and the per-user hourly rate limit.
    index('bug_reports_created_by').on(t.createdBy, t.createdAt.desc()),
  ],
);

/** Screenshots; at most 5 per report (enforced server-side). */
export const bugReportImages = pgTable(
  'bug_report_images',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reportId: uuid('report_id').notNull(),
    /** 'bugs/{report_id}/{id}.{ext}' in bucket admin-attachments */
    storagePath: text('storage_path').notNull().unique('bug_report_images_storage_path_key'),
    fileName: text('file_name').notNull(),
    mimeType: text('mime_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    createdBy: uuid('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      'bug_report_images_mime_type_check',
      sql`${t.mimeType} in ('image/png','image/jpeg','image/webp','image/gif')`,
    ),
    check('bug_report_images_size_bytes_check', sql`${t.sizeBytes} between 1 and 10485760`),
    foreignKey({
      name: 'bug_report_images_report_id_fkey',
      columns: [t.reportId],
      foreignColumns: [bugReports.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'bug_report_images_created_by_fkey',
      columns: [t.createdBy],
      foreignColumns: [users.id],
    }),
    index('bug_report_images_report').on(t.reportId),
  ],
);
