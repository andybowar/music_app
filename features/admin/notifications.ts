/**
 * Access request emails (ADM-04, REQ-AUTH-08; CR OWNER-access-approval).
 *
 * - `notifyAccessRequested(user)` emails every approved, active admin when a new account
 *   starts `pending` (password sign-up or first SSO sign-in), with the requester's name,
 *   email, provider, suggested branch and a link to the access requests in Admin › Users.
 *   Admins are BCC'd on one message, so none sees the others' addresses.
 * - `notifyAccessApproved(user)` tells an approved user they can sign in, linking `/login`.
 * - Rejections send nothing; `/account-status` explains them.
 *
 * Neither function throws. A failed lookup or send is reported (`reportError`) and the
 * result is `false`, so sign-up and approval never fail because of email. Without SMTP
 * configured lib/email logs the message instead of sending it (dev, CI, tests).
 *
 * Not a server action module: these run inside other server code only.
 */

import 'server-only';

import type { AppUser } from '@/types/domain';

import { createElement } from 'react';

import { and, eq, isNull, ne } from 'drizzle-orm';

import { branches, users } from '@/db/schema';
import { getDb } from '@/lib/db';
import { sendEmail } from '@/lib/email';
import { env } from '@/lib/env';
import { log, reportError } from '@/lib/log';
import { ACCESS_APPROVED_SUBJECT, AccessApproved } from '@/emails/AccessApproved';
import { accessRequestedSubject, AccessRequested } from '@/emails/AccessRequested';

/** Where admins review requests: Admin › Users opens on the requests tab while any are pending. */
export const ACCESS_REQUESTS_PATH = '/admin/users';
export const LOGIN_PATH = '/login';

export type RequesterInfo = Pick<AppUser, 'id' | 'email' | 'name' | 'authProvider' | 'branchId'>;
export type ApprovedInfo = Pick<AppUser, 'email' | 'name'>;

const appUrl = (path: string) => new URL(path, env.APP_URL).toString();

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

async function branchName(branchId: string | null): Promise<string | null> {
  if (!branchId) return null;
  const [row] = await getDb()
    .select({ name: branches.name, code: branches.code })
    .from(branches)
    .where(eq(branches.id, branchId))
    .limit(1);
  return row ? `${row.name} (${row.code})` : null;
}

/**
 * Tell the admins about a new pending account. Resolves `true` when a message went out,
 * `false` when it was only logged, there is no admin to tell, or anything failed.
 */
export async function notifyAccessRequested(user: RequesterInfo): Promise<boolean> {
  try {
    const [to, branch] = await Promise.all([adminEmails(user.id), branchName(user.branchId)]);
    if (to.length === 0) {
      log.warn('access request email not sent: no active admin', { userId: user.id });
      return false;
    }
    const { delivered } = await sendEmail({
      bcc: to,
      subject: accessRequestedSubject(user),
      react: createElement(AccessRequested, {
        requester: user,
        branchName: branch,
        url: appUrl(ACCESS_REQUESTS_PATH),
      }),
    });
    return delivered;
  } catch (error) {
    reportError(error, { handler: 'notifyAccessRequested', userId: user.id });
    return false;
  }
}

/**
 * Tell a user their account was approved. Resolves `true` when the message went out,
 * `false` when it was only logged or failed.
 */
export async function notifyAccessApproved(user: ApprovedInfo): Promise<boolean> {
  try {
    const { delivered } = await sendEmail({
      to: user.email,
      subject: ACCESS_APPROVED_SUBJECT,
      react: createElement(AccessApproved, { name: user.name, url: appUrl(LOGIN_PATH) }),
    });
    return delivered;
  } catch (error) {
    reportError(error, { handler: 'notifyAccessApproved' });
    return false;
  }
}
