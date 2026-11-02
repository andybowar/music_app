/**
 * Account linking + deprovisioning (REQ-AUTH-03, REQ-AUTH-05, REQ-AUTH-06; AUTH-06).
 *
 * **Linking (REQ-AUTH-05).** Supabase Auth links an OIDC identity to an existing auth user
 * when the IdP reports the email as verified and it matches that user's email (automatic
 * identity linking; manual linking stays off in `supabase/config.toml`). The callback then
 * sees the existing auth id, and `provisionUser` (`./provision`) asks `resolveSsoAccount`
 * which `users` row the sign-in belongs to:
 *
 * - **Same auth id, row exists** → that account. Its access status, role and branch are
 *   kept: linking never approves a pending or rejected account.
 *   - Disabled → `disabled` (rejected; every session is revoked).
 *   - The identity is not the one already recorded on the row (a *new* link), and the IdP
 *     didn't vouch for the account's email (`email_verified !== true` or another address)
 *     → `unverified`. Supabase should never link such an identity; this is defence in depth
 *     so an unverified IdP email can't take over an existing account.
 * - **No row for the auth id, but another account has the email** (compared
 *   case-insensitively) → `email_taken`. Supabase didn't link the identity (the IdP email
 *   wasn't verified), so this is someone else's account: never a takeover, never a second
 *   account with the same address.
 * - **Neither** → `new`: the caller creates a pending account (REQ-AUTH-03, AUTH-07).
 *
 * **Deprovisioning (REQ-AUTH-06).** A disabled user is turned away by `middleware.ts`
 * (RLS hides their own row), `requireUser`, RLS (`app_user_role()` is null) and both sign-in
 * paths. `revokeUserSessions` also ends every Supabase session they hold, the admin
 * equivalent of a global sign-out (`auth.admin.signOut` needs the user's own JWT, which an
 * admin doesn't have). Deleting `auth.sessions` cascades to `auth.refresh_tokens`, so no
 * session can be refreshed, and Supabase answers `getUser()` for a live access token with
 * `session_not_found`, so the next request is signed out.
 *
 * `provisionUser` revokes them when a disabled user tries SSO; the admin "disable" action
 * should call it in the transaction that sets `disabled_at` (change request
 * `agent-spec/change-requests/AUTH-06-deprovisioning.md`, ADM-01 owns that action).
 *
 * This is a server-only library, not a `'use server'` module: nothing here may be callable
 * from the browser. Writes go through Drizzle as the `DATABASE_URL` role, which can write
 * the `auth` schema.
 */

import 'server-only';

import type { User, UserIdentity } from '@supabase/supabase-js';

import { eq, sql } from 'drizzle-orm';

import { users } from '@/db/schema';
import type { DB, Tx } from '@/lib/db';
import type { AuthProvider } from '@/types/domain';

type UserRow = typeof users.$inferSelect;

// ----- Pure helpers (exported for unit tests) -------------------------------------

/** The identity being linked: the OIDC identity of this sign-in, as `provisionUser` sees it. */
export interface LinkIdentity {
  /** Our `auth_provider` value (`google` / `microsoft`). */
  provider: AuthProvider;
  /** Supabase's provider name (`google` / `azure`). */
  supabaseProvider: string;
  /** The IdP's stable subject identifier (`sub`). */
  subject: string;
}

/** The Supabase identity record behind `identity`, matched on provider and subject. */
export function findIdentity(
  authUser: Pick<User, 'identities'>,
  identity: Pick<LinkIdentity, 'supabaseProvider' | 'subject'>,
): UserIdentity | null {
  for (const candidate of authUser.identities ?? []) {
    if (candidate.provider !== identity.supabaseProvider) continue;
    const sub = candidate.identity_data?.sub;
    const subject = typeof sub === 'string' && sub ? sub : candidate.id;
    if (subject === identity.subject) return candidate;
  }
  return null;
}

/**
 * True only when the IdP itself marked `email` as verified for this identity: the identity's
 * `email_verified` claim is `true` and its `email` equals `email` (case-insensitive). A missing
 * claim counts as unverified.
 */
export function identityVouchesFor(identity: UserIdentity | null, email: string): boolean {
  const data = (identity?.identity_data ?? {}) as Record<string, unknown>;
  const verified = data.email_verified === true || data.email_verified === 'true';
  const claimed = typeof data.email === 'string' ? data.email.trim().toLowerCase() : '';
  return verified && claimed !== '' && claimed === email.trim().toLowerCase();
}

/** True when `row` already records this identity, i.e. the sign-in is not a new link. */
export function isLinkedTo(
  row: Pick<UserRow, 'authProvider' | 'ssoSubject'>,
  identity: Pick<LinkIdentity, 'provider' | 'subject'>,
): boolean {
  return row.authProvider === identity.provider && row.ssoSubject === identity.subject;
}

// ----- Linking --------------------------------------------------------------------

export type AccountLink =
  /** The signed-in auth user's own account; may sign in (status unchanged). */
  | { kind: 'existing'; row: UserRow }
  /** The account is disabled: reject (REQ-AUTH-06). */
  | { kind: 'disabled'; row: UserRow }
  /** A new link the IdP didn't verify the email for: reject, never take over. */
  | { kind: 'unverified' }
  /** No account for this auth user, and another account has the email: reject. */
  | { kind: 'email_taken' }
  /** Nobody has this auth id or email: create a pending account. */
  | { kind: 'new' };

/**
 * Decide which account an OIDC sign-in belongs to (see the module comment). Locks the
 * signed-in user's row (`FOR UPDATE`) so a concurrent admin change can't interleave.
 */
export async function resolveSsoAccount(
  tx: Tx,
  authUser: Pick<User, 'id' | 'identities'>,
  email: string,
  identity: LinkIdentity,
): Promise<AccountLink> {
  const [row] = await tx
    .select()
    .from(users)
    .where(eq(users.id, authUser.id))
    .for('update')
    .limit(1);

  if (row) {
    if (row.disabledAt) return { kind: 'disabled', row };
    if (
      !isLinkedTo(row, identity) &&
      !identityVouchesFor(findIdentity(authUser, identity), row.email)
    ) {
      return { kind: 'unverified' };
    }
    return { kind: 'existing', row };
  }

  const [sameEmail] = await tx
    .select({ id: users.id })
    .from(users)
    .where(eq(sql`lower(${users.email})`, email.trim().toLowerCase()))
    .limit(1);
  return sameEmail ? { kind: 'email_taken' } : { kind: 'new' };
}

// ----- Deprovisioning ---------------------------------------------------------------

/**
 * End every Supabase session `userId` holds (all devices). Refresh tokens go with their
 * sessions (`on delete cascade`). Returns how many sessions were revoked. Call it inside the
 * transaction that disables the user so both commit together.
 */
export async function revokeUserSessions(db: DB | Tx, userId: string): Promise<number> {
  const rows = await db.execute<{ id: string }>(
    sql`delete from auth.sessions where auth.sessions.user_id = ${userId} returning auth.sessions.id`,
  );
  return rows.length;
}
