/**
 * Session guard + role check (contracts/api.md "Core libs"; REQ-AUTH-06, REQ-AUTH-08).
 *
 * Every protected route and server action learns "who am I" through three guards. They
 * read the Supabase session (per-request, from the auth cookies) and the `users` row, then
 * decide access:
 *
 * - `getUser()` — the signed-in `AppUser` **whatever their access status**, or `null`.
 *   `null` also means "signed out", "no app profile yet", or "disabled" (REQ-AUTH-06,
 *   the next request signs them out).
 * - `requireUser()` — approved users only. Throws `UNAUTHENTICATED` when there is no usable
 *   session (signed out / no profile / disabled) and `FORBIDDEN` for pending/rejected users
 *   (REQ-AUTH-08). Server actions call this first; `withAction` turns the throw into an
 *   `ActionResult` so the caller never sees a raw error. A page converts the throw into a
 *   redirect (UNAUTHENTICATED → `/login?next=…`, FORBIDDEN → `/account-status`).
 * - `requireRole(role)` — `requireUser` plus a minimum-role check (`member < contributor <
 *   music_leader < admin`; admin satisfies every request).
 *
 * DB access is through `lib/db.ts` (the `DATABASE_URL` role, so RLS does not apply here — the
 * guard *is* the authorization for "am I allowed in at all").
 */

import 'server-only';

import { eq } from 'drizzle-orm';

import { users } from '@/db/schema';
import { ActionError } from '@/lib/action';
import { getDb } from '@/lib/db';
import { createServerSupabase } from '@/lib/supabase/server';
import type { AppUser, AuthProvider, Role } from '@/types/domain';

const NO_SESSION_MSG = 'You must be signed in to continue.';
const ACCESS_PENDING_MSG =
  'Your account is not approved yet. Check back after an administrator reviews it.';
const ACCESS_REJECTED_MSG = 'Your account request was not approved. Contact an administrator.';
const ROLE_DENIED_MSG = 'You do not have the role required for that action.';

/** Mirrors the Postgres `role` enum order: member < contributor < music_leader < admin. */
const ROLE_RANK: Record<Role, number> = { member: 0, contributor: 1, music_leader: 2, admin: 3 };

// ----- Pure routing helper (also used by middleware; unit-tested) -----------------------

/**
 * The signed-in `(app)` route families. `middleware` uses this (with its `matcher`) to send
 * unauthenticated requests to `/login`; the layout uses it implicitly by calling `requireUser`.
 * Everything else — the `(auth)` routes, `/account-status`, public `/share/[token]`, `/api/*`,
 * and static assets — is not protected here.
 */
const PROTECTED_APP_PREFIXES = [
  '/library',
  '/songs',
  '/lists',
  '/branches',
  '/quick',
  '/admin',
] as const;

/** True when `pathname` is under a protected `(app)` route family. */
export function isProtectedAppRoute(pathname: string): boolean {
  return PROTECTED_APP_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

// ----- AppUser hydration & access decisions ----------------------------------------------

type UserRow = typeof users.$inferSelect;

function toAppUser(row: UserRow): AppUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    branchId: row.branchId,
    role: row.role,
    authProvider: row.authProvider as AuthProvider,
    disabledAt: row.disabledAt ? row.disabledAt.toISOString() : null,
    accessStatus: row.accessStatus,
  };
}

/**
 * Decide access for a signed-in user's row. Pure and exported for tests:
 *   - no row / no session → `null`
 *   - `disabled_at` set   → `null` (the caller signs the session out; REQ-AUTH-06)
 *   - otherwise           → the `AppUser`, carrying whatever `accessStatus` it has
 */
export function accessForRow(row: UserRow | null | undefined): AppUser | null {
  if (!row) return null;
  if (row.disabledAt) return null;
  return toAppUser(row);
}

// ----- Guards ----------------------------------------------------------------------------

/**
 * The signed-in `AppUser` whatever their access status, or `null`. Returns `null` when the
 * request is signed out or has no app profile. A disabled user is signed out on this request
 * (REQ-AUTH-06); the access decision itself — disabled → null and row → AppUser — is delegated to
 * `accessForRow`, so there is a single source of truth for it.
 */
export async function getUser(): Promise<AppUser | null> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;

  const [row] = await getDb().select().from(users).where(eq(users.id, data.user.id)).limit(1);

  if (row?.disabledAt) {
    // REQ-AUTH-06: a disabled user must not keep using an existing session. Delegating the
    // decision to accessForRow keeps the "disabled → null" rule in one place.
    await supabase.auth.signOut({ scope: 'local' });
  }
  return accessForRow(row);
}

/**
 * An approved `AppUser`, or a thrown error. `UNAUTHENTICATED` when there is no usable session
 * (signed out / no profile / disabled); `FORBIDDEN` when the account is pending or rejected
 * (REQ-AUTH-08).
 */
export async function requireUser(): Promise<AppUser> {
  const user = await getUser();
  if (!user) throw new ActionError('UNAUTHENTICATED', NO_SESSION_MSG);
  if (user.accessStatus !== 'approved') {
    throw new ActionError(
      'FORBIDDEN',
      user.accessStatus === 'pending' ? ACCESS_PENDING_MSG : ACCESS_REJECTED_MSG,
    );
  }
  return user;
}

/**
 * An approved `AppUser` whose role is at least `role`. `admin` satisfies every request.
 * Mirrors the minimum-role checks in `lib/permissions.ts`; redeclared here because this guard
 * owns the "may enter the app" decision, independent of the per-action matrix.
 */
export async function requireRole(role: Role): Promise<AppUser> {
  const user = await requireUser();
  if (ROLE_RANK[user.role] < ROLE_RANK[role]) throw new ActionError('FORBIDDEN', ROLE_DENIED_MSG);
  return user;
}

// Keep the public surface minimal: the three guards above are the contract. `isProtectedAppRoute`
// and `accessForRow` are exported purely so `middleware` and the tests can share them without
// duplicating the access decision.
