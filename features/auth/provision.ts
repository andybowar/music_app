/**
 * SSO user provisioning (contracts/api.md; REQ-AUTH-03, REQ-AUTH-04, REQ-AUTH-05, REQ-AUTH-06).
 *
 * `provisionUser` runs in `/auth/callback` after Supabase has exchanged the OIDC
 * code for a session. It makes sure the signed-in identity has an active row in
 * `public.users`, and throws an `ActionError` when it must not be let in:
 *
 * - **Existing account** (admin invite, earlier SSO login, or a password account
 *   Supabase linked to this identity by verified email): records the provider,
 *   subject and login time. A branch is filled in from the IdP groups only when
 *   the account has none; an admin-assigned branch or role is never overwritten.
 * - **Disabled account** (`disabled_at` set): rejected with `FORBIDDEN`.
 * - **New identity** whose IdP groups map to a branch (`branches.sso_group`): a
 *   `member` of that branch is created.
 * - **New identity with no mapped group**: rejected with `FORBIDDEN`, because
 *   there is no public signup (REQ-AUTH-03). An admin can invite them instead.
 * - **Email already used by another account** that Supabase did not link (the
 *   email was not verified by the IdP): rejected with `CONFLICT`.
 *
 * Writes go through Drizzle as the `DATABASE_URL` role (`postgres`), which owns
 * the tables and so is not subject to the RLS policies in `0003_rls.sql`. That is
 * required: a not-yet-provisioned user has no role and could not insert their own
 * row through RLS.
 */

import 'server-only';

import type { User } from '@supabase/supabase-js';
import type { AppUser, AuthProvider, UUID } from '@/types/domain';

import { eq } from 'drizzle-orm';

import { branches, users } from '@/db/schema';
import { ActionError } from '@/lib/action';
import { withTx, type Tx } from '@/lib/db';

/** The OIDC providers AUTH-02 supports, as named in the app and in Supabase. */
export const OIDC_PROVIDERS = { google: 'google', microsoft: 'azure' } as const;
export type OidcProvider = keyof typeof OIDC_PROVIDERS;

export const NO_ACCOUNT_MESSAGE =
  'Your organization account is not linked to a branch yet. Ask an administrator to invite you.';
export const DISABLED_MESSAGE = 'This account has been disabled. Contact an administrator.';
export const EMAIL_CONFLICT_MESSAGE =
  'An account with this email already exists. Sign in with your password instead.';
export const UNSUPPORTED_MESSAGE = 'This sign-in method is not supported.';

type UserRow = typeof users.$inferSelect;

// ----- Pure helpers (exported for unit tests) -------------------------------------

/** Supabase provider name (`identity.provider`) → our `auth_provider` value. */
export function toAuthProvider(supabaseProvider: string | undefined): OidcProvider | null {
  if (supabaseProvider === OIDC_PROVIDERS.google) return 'google';
  if (supabaseProvider === OIDC_PROVIDERS.microsoft) return 'microsoft';
  return null;
}

export interface OidcIdentity {
  provider: OidcProvider;
  /** The IdP's stable subject identifier (`sub`). */
  subject: string;
}

/**
 * The OIDC identity used for this sign-in: of the user's Google/Microsoft
 * identities, the one signed in most recently. `null` if there is none (e.g. a
 * password-only or SAML user reached the OIDC callback).
 */
export function currentOidcIdentity(user: Pick<User, 'identities'>): OidcIdentity | null {
  let best: { identity: OidcIdentity; at: number } | null = null;
  for (const identity of user.identities ?? []) {
    const provider = toAuthProvider(identity.provider);
    if (!provider) continue;
    const sub = identity.identity_data?.sub;
    const subject = typeof sub === 'string' && sub ? sub : identity.id;
    if (!subject) continue;
    const at = Date.parse(identity.last_sign_in_at ?? identity.updated_at ?? '') || 0;
    if (!best || at > best.at) best = { identity: { provider, subject }, at };
  }
  return best?.identity ?? null;
}

function stringList(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string');
}

/**
 * IdP group names carried on the Supabase user. Supabase copies ID-token claims
 * into `user_metadata` (non-standard claims such as Entra ID's `groups` land in
 * `custom_claims`); `app_metadata.groups` lets an admin hook set them too. Google
 * OIDC sends no groups, so Google users rely on an existing account.
 * Trimmed, de-duplicated, order kept.
 */
export function idpGroupsFromUser(user: Pick<User, 'user_metadata' | 'app_metadata'>): string[] {
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const custom = (meta.custom_claims ?? {}) as Record<string, unknown>;
  const app = (user.app_metadata ?? {}) as Record<string, unknown>;
  const all = [
    ...stringList(meta.groups),
    ...stringList(custom.groups),
    ...stringList(app.groups),
  ].map((g) => g.trim());
  return [...new Set(all.filter(Boolean))];
}

/**
 * The branch for a set of IdP groups: the first group (in IdP order) that equals
 * a branch's `sso_group`, compared case-insensitively. `null` when none match.
 */
export function branchForGroups(
  idpGroups: readonly string[],
  candidates: ReadonlyArray<{ id: UUID; ssoGroup: string | null }>,
): UUID | null {
  const byGroup = new Map<string, UUID>();
  for (const b of candidates) {
    if (b.ssoGroup) byGroup.set(b.ssoGroup.trim().toLowerCase(), b.id);
  }
  for (const group of idpGroups) {
    const id = byGroup.get(group.trim().toLowerCase());
    if (id) return id;
  }
  return null;
}

/** Display name for a new user: IdP name claims, else the email's local part. */
export function displayNameFor(user: Pick<User, 'user_metadata'>, email: string): string {
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  for (const key of ['full_name', 'name'] as const) {
    const value = meta[key];
    if (typeof value === 'string' && value.trim()) return value.trim().slice(0, 200);
  }
  return email.split('@')[0] || email;
}

function toAppUser(row: UserRow): AppUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    branchId: row.branchId,
    role: row.role,
    authProvider: row.authProvider as AuthProvider,
    disabledAt: row.disabledAt ? row.disabledAt.toISOString() : null,
  };
}

// ----- Provisioning ---------------------------------------------------------------

async function mappedBranch(tx: Tx, idpGroups: readonly string[]): Promise<UUID | null> {
  if (idpGroups.length === 0) return null;
  const rows = await tx.select({ id: branches.id, ssoGroup: branches.ssoGroup }).from(branches);
  return branchForGroups(idpGroups, rows);
}

/**
 * Create or update the `users` row for a user who just signed in with OIDC.
 * Returns the active account; throws `ActionError` (FORBIDDEN / CONFLICT /
 * UNAUTHENTICATED) when the user must not be signed in. The caller signs out.
 */
export async function provisionUser(authUser: User, idpGroups: string[]): Promise<AppUser> {
  const identity = currentOidcIdentity(authUser);
  if (!identity) throw new ActionError('UNAUTHENTICATED', UNSUPPORTED_MESSAGE);
  const email = authUser.email?.trim().toLowerCase();
  if (!email) throw new ActionError('UNAUTHENTICATED', NO_ACCOUNT_MESSAGE);
  const now = new Date();

  return withTx(async (tx) => {
    const [existing] = await tx
      .select()
      .from(users)
      .where(eq(users.id, authUser.id))
      .for('update')
      .limit(1);

    if (existing) {
      if (existing.disabledAt) throw new ActionError('FORBIDDEN', DISABLED_MESSAGE);
      const branchId = existing.branchId ?? (await mappedBranch(tx, idpGroups));
      const [updated] = await tx
        .update(users)
        .set({
          authProvider: identity.provider,
          ssoSubject: identity.subject,
          lastLoginAt: now,
          branchId,
        })
        .where(eq(users.id, authUser.id))
        .returning();
      return toAppUser(updated!);
    }

    const [sameEmail] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    if (sameEmail) throw new ActionError('CONFLICT', EMAIL_CONFLICT_MESSAGE);

    const branchId = await mappedBranch(tx, idpGroups);
    if (!branchId) throw new ActionError('FORBIDDEN', NO_ACCOUNT_MESSAGE);

    const [created] = await tx
      .insert(users)
      .values({
        id: authUser.id,
        email,
        name: displayNameFor(authUser, email),
        branchId,
        role: 'member',
        authProvider: identity.provider,
        ssoSubject: identity.subject,
        lastLoginAt: now,
      })
      .returning();
    return toAppUser(created!);
  });
}
