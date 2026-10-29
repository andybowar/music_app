// @vitest-environment node
// Integration: `provisionUser` against the local Supabase database (`pnpm db:start`,
// migrated). Creates throwaway auth users (admin API) and a throwaway branch, and
// deletes them afterwards. The OIDC identity is synthesized on the auth user
// object: no real Google/Microsoft sign-in is involved.
import type { User } from '@supabase/supabase-js';

import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';

vi.mock('server-only', () => ({}));

if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY && existsSync('.env.local'))
  process.loadEnvFile('.env.local');
process.env.APP_URL ||= 'http://127.0.0.1:3000';
process.env.CRON_SECRET ||= 'integration-test-cron-secret';

const { eq, inArray } = await import('drizzle-orm');
const { branches, users } = await import('@/db/schema');
const { getDb } = await import('@/lib/db');
const { createServiceSupabase } = await import('@/lib/supabase/server');
const { DISABLED_MESSAGE, EMAIL_CONFLICT_MESSAGE, NO_ACCOUNT_MESSAGE, provisionUser } =
  await import('./provision');

const run = randomUUID().slice(0, 8);
const GROUP = `auth02-group-${run}`;
const createdAuthUsers: string[] = [];
let branchId: string;

async function createAuthUser(label: string): Promise<User> {
  const { data, error } = await createServiceSupabase().auth.admin.createUser({
    email: `auth02-${label}-${run}@example.test`,
    email_confirm: true,
    user_metadata: { full_name: `AUTH-02 ${label}` },
  });
  if (error) throw error;
  createdAuthUsers.push(data.user.id);
  return data.user;
}

/** The auth user as it looks after signing in with Microsoft (synthetic identity). */
function asMicrosoftLogin(user: User, subject = `sub-${user.id}`): User {
  return {
    ...user,
    identities: [
      {
        id: subject,
        identity_id: randomUUID(),
        user_id: user.id,
        provider: 'azure',
        identity_data: { sub: subject, email: user.email },
        last_sign_in_at: new Date().toISOString(),
      },
    ],
  };
}

async function rowFor(id: string) {
  const [row] = await getDb().select().from(users).where(eq(users.id, id));
  return row;
}

beforeAll(async () => {
  // A 3-letter code unlikely to clash with seeded branches; retry once on a clash.
  const code = () =>
    Array.from({ length: 3 }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join(
      '',
    );
  for (let attempt = 0; ; attempt++) {
    try {
      const [b] = await getDb()
        .insert(branches)
        .values({ name: `AUTH-02 test ${run}`, code: code(), ssoGroup: GROUP })
        .returning({ id: branches.id });
      branchId = b!.id;
      break;
    } catch (error) {
      if (attempt >= 3) throw error;
    }
  }
});

afterAll(async () => {
  const db = getDb();
  if (createdAuthUsers.length) await db.delete(users).where(inArray(users.id, createdAuthUsers));
  if (branchId) await db.delete(branches).where(eq(branches.id, branchId));
  const admin = createServiceSupabase();
  for (const id of createdAuthUsers) await admin.auth.admin.deleteUser(id);
  await db.$client.end();
});

describe('provisionUser (database)', () => {
  test('first login creates a member of the mapped branch; a repeat login updates it', async () => {
    const authUser = await createAuthUser('first');
    expect(await rowFor(authUser.id)).toBeUndefined();

    const before = Date.now();
    const created = await provisionUser(asMicrosoftLogin(authUser, 'sub-1'), [
      'unrelated',
      GROUP.toUpperCase(),
    ]);
    expect(created).toEqual({
      id: authUser.id,
      email: authUser.email,
      name: 'AUTH-02 first',
      branchId,
      role: 'member',
      authProvider: 'microsoft',
      disabledAt: null,
    });
    const row = await rowFor(authUser.id);
    expect(row).toMatchObject({ ssoSubject: 'sub-1', branchId, role: 'member' });
    expect(row!.lastLoginAt!.getTime()).toBeGreaterThanOrEqual(before - 1000);

    // An admin renames them and promotes them; a later login must not undo that.
    await getDb()
      .update(users)
      .set({ name: 'Renamed', role: 'contributor' })
      .where(eq(users.id, authUser.id));
    const firstLogin = row!.lastLoginAt!.getTime();
    await new Promise((r) => setTimeout(r, 20));

    const again = await provisionUser(asMicrosoftLogin(authUser, 'sub-1b'), []);
    expect(again).toMatchObject({ name: 'Renamed', role: 'contributor', branchId });
    const updated = await rowFor(authUser.id);
    expect(updated!.ssoSubject).toBe('sub-1b');
    expect(updated!.lastLoginAt!.getTime()).toBeGreaterThan(firstLogin);
    const count = await getDb()
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, authUser.id));
    expect(count).toHaveLength(1);
  });

  test('a new identity whose groups map to no branch is rejected and not created', async () => {
    const authUser = await createAuthUser('unmapped');
    await expect(
      provisionUser(asMicrosoftLogin(authUser), [`not-a-branch-${run}`]),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', message: NO_ACCOUNT_MESSAGE });
    await expect(provisionUser(asMicrosoftLogin(authUser), [])).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(await rowFor(authUser.id)).toBeUndefined();
  });

  test('an invited user with an unmapped group signs in with branch null', async () => {
    const authUser = await createAuthUser('invited');
    await getDb().insert(users).values({
      id: authUser.id,
      email: authUser.email!,
      name: 'Invited',
      authProvider: 'password',
    });

    const user = await provisionUser(asMicrosoftLogin(authUser, 'sub-inv'), [`unknown-${run}`]);
    expect(user).toMatchObject({ branchId: null, role: 'member', authProvider: 'microsoft' });
    expect(await rowFor(authUser.id)).toMatchObject({ branchId: null, ssoSubject: 'sub-inv' });

    // Once their IdP group is mapped, the next login fills the branch in.
    await provisionUser(asMicrosoftLogin(authUser, 'sub-inv'), [GROUP]);
    expect((await rowFor(authUser.id))!.branchId).toBe(branchId);
  });

  test('a disabled user is rejected and their row is left untouched', async () => {
    const authUser = await createAuthUser('disabled');
    const disabledAt = new Date('2026-05-01T00:00:00Z');
    await getDb().insert(users).values({
      id: authUser.id,
      email: authUser.email!,
      name: 'Disabled',
      authProvider: 'password',
      disabledAt,
    });

    await expect(provisionUser(asMicrosoftLogin(authUser), [GROUP])).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: DISABLED_MESSAGE,
    });
    expect(await rowFor(authUser.id)).toMatchObject({
      authProvider: 'password',
      ssoSubject: null,
      lastLoginAt: null,
      branchId: null,
      disabledAt,
    });
  });

  test('an email already used by a different account is a conflict', async () => {
    const newcomer = await createAuthUser('newcomer');
    const other = await createAuthUser('other');
    await getDb().insert(users).values({
      id: other.id,
      email: newcomer.email!,
      name: 'Holder of the email',
      authProvider: 'password',
    });

    await expect(provisionUser(asMicrosoftLogin(newcomer), [GROUP])).rejects.toMatchObject({
      code: 'CONFLICT',
      message: EMAIL_CONFLICT_MESSAGE,
    });
    expect(await rowFor(newcomer.id)).toBeUndefined();
  });
});
