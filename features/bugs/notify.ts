/**
 * "New bug report" email to admins (ADM-08), sent the way ADM-04's `notifyAccessRequested`
 * is: every approved, active admin other than the reporter, BCC'd on one message.
 *
 * Never throws. A failed lookup or send is reported (`reportError`) and the result is
 * `false`, so filing a report never fails because of email. Without SMTP configured
 * lib/email logs the message instead of sending it.
 *
 * Not a server action module: it runs inside `createBugReport` only.
 */

import 'server-only';

import { createElement } from 'react';

import { and, eq, isNull, ne } from 'drizzle-orm';

import { users } from '@/db/schema';
import { getDb } from '@/lib/db';
import { sendEmail } from '@/lib/email';
import { env } from '@/lib/env';
import { log, reportError } from '@/lib/log';

import { BugReported, bugReportedSubject } from './emails/BugReported';
import { bugHref } from './types';

export interface BugNotice {
  id: string;
  title: string;
  pagePath: string | null;
  reporter: { id: string; name: string; email: string };
}

/** Emails of every approved, active admin other than `exceptId`, de-duplicated. */
async function adminEmails(exceptId: string): Promise<string[]> {
  const rows = await getDb()
    .select({ email: users.email })
    .from(users)
    .where(
      and(
        eq(users.role, 'admin'),
        eq(users.accessStatus, 'approved'),
        isNull(users.disabledAt),
        ne(users.id, exceptId),
      ),
    );
  return [...new Set(rows.map((r) => r.email.trim().toLowerCase()).filter(Boolean))];
}

/** Tell the admins about a new report. `true` when a message went out. */
export async function notifyBugReported(notice: BugNotice): Promise<boolean> {
  try {
    const to = await adminEmails(notice.reporter.id);
    if (to.length === 0) {
      log.warn('bug report email not sent: no other active admin', { reportId: notice.id });
      return false;
    }
    const { delivered } = await sendEmail({
      bcc: to,
      subject: bugReportedSubject(notice.title),
      react: createElement(BugReported, {
        title: notice.title,
        reporter: notice.reporter,
        pagePath: notice.pagePath,
        url: new URL(bugHref(notice.id, true), env.APP_URL).toString(),
      }),
    });
    return delivered;
  } catch (error) {
    reportError(error, { handler: 'notifyBugReported', reportId: notice.id });
    return false;
  }
}
