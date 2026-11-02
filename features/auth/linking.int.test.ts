// @vitest-environment node
// Integration (AUTH-06): account linking and deprovisioning against the local Supabase stack
// (`pnpm db:start`, migrated). Creates throwaway password users through the admin API, signs
// them in with a real password session where a test needs one, and deletes them afterwards.
// The OIDC identity is synthesized on the auth user object, as Supabase would present it after
// linking: no real Google sign-in is involved.
import type { User } from '@supabase/supabase-js';

import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

import { afterAll, describe, expect, test, vi } from 'vitest';

vi.mock('server-only', () => ({}));

if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY && existsSync('.env.local'))
  process.loadEnvFile('.env.local');
process.env.APP_URL ||= 'http://127.0.0.1:3000';
process.env.CRON_SECRET ||= 'integration-test-cron-secret';

const { createClient } = await import('@supabase/supabase-js');
const { eq, inArray, sql } = await import('drizzle-orm');
const { users } = await import('@/db/schema');
const { getDb } = await import('@/lib/db');
const { createServiceSupabase } = await import('@/lib/supabase/server');
const { DISABLED_MESSAGE, EMAIL_CONFLICT_MESSAGE, provisionUser } = await import('./provision');
const { revokeUserSessions } = await import('./linking');

const run = randomUUID().slice(0, 8);
const PASSWORD = `pw-${randomUUID()}`;
const createdAuthUsers: string[] = [];

type Status = 'pending' | 'approved' | 'rejected';

/** A password account: an auth user plus its `users` row. */
async function createPasswordUser(
  label: string,
  values: { accessStatus?: Status; disabledAt?: Date } = {},
): Promise<User> {
  const email = `auth06-${label}-${run}@example.test`;
  const { data, error } = await createServiceSupabase().auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error) throw error;
  createdAuthUsers.push(data.user.id);
  await getDb()
    .insert(users)
    .values({
      id: data.user.id,
      email,
      name: `AUTH-06 ${label}`,
      authProvider: 'password',
      ...values,
    });
  return data.user;
}

/** The auth user as Supabase returns it once a Google identity is linked to it. */
function withGoogle(user: User, data: { email?: string; email_verified?: unknown } = {}): User {
  const subject = `g-${user.id}`;
  return {
    ...user,
    identities: [
      ...(user.identities ?? []),
      {
        id: subject,
        identity_id: randomUUID(),
        user_id: user.id,
        provider: 'google',
        identity_data: { sub: subject, email: user.email, email_verified: true, ...data },
        last_sign_in_at: new Date().toISOString(),
      },
    ],
  };
}

async function rowFor(id: string) {
  const [row] = await getDb().select().from(users).where(eq(users.id, id));
  return row;
}

async function accountsWithEmail(email: string) {
  return getDb()
    .select({ id: users.id })
    .from(users)
    .where(eq(sql`lower(${users.email})`, email.toLowerCase()));
}

async function sessionCount(userId: string): Promise<number> {
  const rows = await getDb().execute<{ n: number }>(
    sql`select count(*)::int as n from auth.sessions where auth.sessions.user_id = ${userId}`,
  );
  return rows[0]!.n;
}

/** A real password session for `email` (a fresh, non-persisting anon client). */
async function signIn(email: string) {
  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
  );
  const { data, error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  return { client, session: data.session };
}

/** True when Supabase no longer honours the session's access token or refresh token. */
async function expectSessionDead(
  client: Awaited<ReturnType<typeof signIn>>['client'],
  session: Awaited<ReturnType<typeof signIn>>['session'],
) {
  const { data: current, error: userError } = await client.auth.getUser(session.access_token);
  expect(current.user).toBeNull();
  expect(userError).not.toBeNull();
  const { data: refreshed, error: refreshError } = await client.auth.refreshSession({
    refresh_token: session.refresh_token,
  });
  expect(refreshed.session).toBeNull();
  expect(refreshError).not.toBeNull();
}

afterAll(async () => {
  const db = getDb();
  if (createdAuthUsers.length) await db.delete(users).where(inArray(users.id, createdAuthUsers));
  const admin = createServiceSupabase();
  for (const id of createdAuthUsers) await admin.auth.admin.deleteUser(id);
  await db.$client.end();
});

describe('account linking (REQ-AUTH-05)', () => {
  test('a verified Google identity links to the password account and keeps its status', async () => {
    for (const status of ['pending', 'rejected', 'approved'] as const) {
      const authUser = await createPasswordUser(`link-${status}`, { accessStatus: status });

      const linked = await provisionUser(withGoogle(authUser), []);
      expect(linked).toMatchObject({
        id: authUser.id,
        authProvider: 'google',
        accessStatus: status, // linking never approves (or un-rejects) an account
      });
      expect(await rowFor(authUser.id)).toMatchObject({
        ssoSubject: `g-${authUser.id}`,
        accessStatus: status,
        accessDecidedAt: null,
      });
      // One person, one account.
      expect(await accountsWithEmail(authUser.email!)).toEqual([{ id: authUser.id }]);

      // Signing in again through the now-linked identity is unchanged.
      await expect(provisionUser(withGoogle(authUser), [])).resolves.toMatchObject({
        accessStatus: status,
      });
    }
  });

  test('an unverified IdP email never takes over an existing account', async () => {
    for (const [label, claim] of [
      ['unverified', { email_verified: false }],
      ['unclaimed', { email_verified: undefined }],
      ['other-email', { email: `mallory-${run}@example.test` }],
    ] as const) {
      const authUser = await createPasswordUser(`takeover-${label}`, { accessStatus: 'approved' });
      const before = await rowFor(authUser.id);

      await expect(provisionUser(withGoogle(authUser, claim), [])).rejects.toMatchObject({
        code: 'CONFLICT',
        message: EMAIL_CONFLICT_MESSAGE,
      });
      expect(await rowFor(authUser.id)).toEqual(before);
    }
  });

  test('an identity Supabase did not link never creates a second account', async () => {
    const holder = await createPasswordUser('holder', { accessStatus: 'approved' });
    // A separate auth user (Supabase didn't link: the IdP email wasn't verified) presenting
    // the holder's address in another case.
    const { data, error } = await createServiceSupabase().auth.admin.createUser({
      email: `auth06-newcomer-${run}@example.test`,
      email_confirm: true,
    });
    if (error) throw error;
    createdAuthUsers.push(data.user.id);
    const newcomer = withGoogle({ ...data.user, email: holder.email!.toUpperCase() });

    await expect(provisionUser(newcomer, [])).rejects.toMatchObject({
      code: 'CONFLICT',
      message: EMAIL_CONFLICT_MESSAGE,
    });
    expect(await rowFor(data.user.id)).toBeUndefined();
    expect(await accountsWithEmail(holder.email!)).toEqual([{ id: holder.id }]);
  });
});

describe('deprovisioning (REQ-AUTH-06)', () => {
  test('revokeUserSessions ends every session the user holds, and only theirs', async () => {
    const target = await createPasswordUser('revoke', { accessStatus: 'approved' });
    const bystander = await createPasswordUser('bystander', { accessStatus: 'approved' });
    const first = await signIn(target.email!);
    const second = await signIn(target.email!);
    const other = await signIn(bystander.email!);
    expect(await sessionCount(target.id)).toBe(2);

    await expect(revokeUserSessions(getDb(), target.id)).resolves.toBe(2);
    expect(await sessionCount(target.id)).toBe(0);
    await expectSessionDead(first.client, first.session);
    await expectSessionDead(second.client, second.session);

    // Someone else's session is untouched.
    expect(await sessionCount(bystander.id)).toBe(1);
    const { data } = await other.client.auth.getUser(other.session.access_token);
    expect(data.user?.id).toBe(bystander.id);

    // Nothing left to revoke.
    await expect(revokeUserSessions(getDb(), target.id)).resolves.toBe(0);
  });

  test('a disabled user is refused SSO sign-in and their live sessions are revoked', async () => {
    const authUser = await createPasswordUser('disabled', { accessStatus: 'approved' });
    const live = await signIn(authUser.email!);
    const disabledAt = new Date();
    await getDb().update(users).set({ disabledAt }).where(eq(users.id, authUser.id));

    await expect(provisionUser(withGoogle(authUser), [])).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: DISABLED_MESSAGE,
    });
    expect(await rowFor(authUser.id)).toMatchObject({
      authProvider: 'password',
      ssoSubject: null,
      disabledAt,
    });
    expect(await sessionCount(authUser.id)).toBe(0);
    await expectSessionDead(live.client, live.session);
  });
});
