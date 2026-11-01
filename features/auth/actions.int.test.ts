// @vitest-environment node
// Integration: needs the local Supabase stack (`pnpm db:start`) with Mailpit on :54324.
// Env comes from CI or .env.local (Vitest doesn't load it on its own). Creates its own
// throwaway users through the admin API and deletes them afterwards.
import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('server-only', () => ({}));

// An in-memory cookie jar standing in for the browser between requests.
const jar = new Map<string, string>();
vi.mock('next/headers', () => ({
  cookies: async () => ({
    getAll: () => [...jar].map(([name, value]) => ({ name, value })),
    set: (name: string, value: string, options?: { maxAge?: number }) => {
      if (!value || options?.maxAge === 0) jar.delete(name);
      else jar.set(name, value);
    },
  }),
}));

if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY && existsSync('.env.local'))
  process.loadEnvFile('.env.local');
process.env.APP_URL ??= 'http://127.0.0.1:3000';
process.env.CRON_SECRET ??= 'integration-test-cron-secret';

const { eq } = await import('drizzle-orm');
const { users } = await import('@/db/schema');
const { getDb } = await import('@/lib/db');
const { createServerSupabase, createServiceSupabase } = await import('@/lib/supabase/server');
const {
  confirmPasswordReset,
  requestPasswordReset,
  signInWithPassword,
  signOut,
  signUpWithPassword,
} = await import('./actions');

const MAILPIT = process.env.MAILPIT_URL ?? 'http://127.0.0.1:54324';
const PASSWORD = `pw-${randomUUID()}`;
const run = randomUUID().slice(0, 8);
const created: string[] = [];

async function createUser(label: string, opts: { disabled?: boolean } = {}) {
  const email = `auth01-${label}-${run}@example.test`;
  const { data, error } = await createServiceSupabase().auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error) throw error;
  created.push(data.user.id);
  await getDb()
    .insert(users)
    .values({
      id: data.user.id,
      email,
      name: `AUTH-01 ${label}`,
      authProvider: 'password',
      disabledAt: opts.disabled ? new Date() : null,
    });
  return { id: data.user.id, email };
}

const hasSession = () => [...jar.keys()].some((name) => /^sb-.+-auth-token(\.\d+)?$/.test(name));

async function currentUserId() {
  const { data } = await (await createServerSupabase()).auth.getUser();
  return data.user?.id ?? null;
}

const GENERIC = {
  ok: false,
  error: { code: 'UNAUTHENTICATED', message: 'Incorrect email or password.' },
};

let active: { id: string; email: string };
let disabled: { id: string; email: string };

beforeAll(async () => {
  active = await createUser('active');
  disabled = await createUser('disabled', { disabled: true });
});

afterAll(async () => {
  const admin = createServiceSupabase();
  for (const id of created) await admin.auth.admin.deleteUser(id); // cascades to public.users
  await getDb().$client.end();
});

beforeEach(() => jar.clear());

describe('password sign-in', () => {
  test('correct password starts a session and records the login', async () => {
    expect(await signInWithPassword(active.email.toUpperCase(), PASSWORD)).toEqual({
      ok: true,
      data: undefined,
    });
    expect(hasSession()).toBe(true);
    expect(await currentUserId()).toBe(active.id);

    const [row] = await getDb().select().from(users).where(eq(users.id, active.id));
    expect(row?.lastLoginAt).toBeInstanceOf(Date);
  });

  test('wrong password and unknown email get the identical generic error', async () => {
    expect(await signInWithPassword(active.email, 'wrong-password')).toEqual(GENERIC);
    expect(await signInWithPassword(`nobody-${run}@example.test`, PASSWORD)).toEqual(GENERIC);
    expect(hasSession()).toBe(false);
  });

  test('disabled user is refused and left without a session', async () => {
    expect(await signInWithPassword(disabled.email, PASSWORD)).toEqual(GENERIC);
    expect(hasSession()).toBe(false);
  });

  test('sign-out ends the session', async () => {
    await signInWithPassword(active.email, PASSWORD);
    expect(await currentUserId()).toBe(active.id);

    expect(await signOut()).toEqual({ ok: true, data: undefined });
    expect(hasSession()).toBe(false);
    expect(await currentUserId()).toBeNull();
  });
});

describe('self sign-up (AUTH-07)', () => {
  const OK = { ok: true, data: undefined };

  test('creates a pending account, leaves no session, and the user can sign in', async () => {
    const email = `auth07-new-${run}@example.test`;
    expect(await signUpWithPassword({ name: 'AUTH-07 New', email, password: PASSWORD })).toEqual(
      OK,
    );
    expect(hasSession()).toBe(false);

    const [row] = await getDb().select().from(users).where(eq(users.email, email));
    expect(row).toMatchObject({
      name: 'AUTH-07 New',
      authProvider: 'password',
      accessStatus: 'pending',
      branchId: null,
      role: 'member',
    });
    created.push(row!.id);

    // Signing in works (the guard sends them to /account-status); status is unchanged.
    expect(await signInWithPassword(email, PASSWORD)).toEqual(OK);
    expect(await currentUserId()).toBe(row!.id);
    const [after] = await getDb().select().from(users).where(eq(users.id, row!.id));
    expect(after!.accessStatus).toBe('pending');
  });

  test('an existing email gets the same response and its account is untouched', async () => {
    const before = (await getDb().select().from(users).where(eq(users.id, active.id)))[0]!;
    const result = await signUpWithPassword({
      name: 'Someone else',
      email: active.email.toUpperCase(),
      password: `other-${randomUUID()}`,
    });
    expect(result).toEqual(OK);
    expect(hasSession()).toBe(false);

    const after = await getDb().select().from(users).where(eq(users.email, active.email));
    expect(after).toEqual([before]);
    // The original password still works; the new one doesn't.
    expect(await signInWithPassword(active.email, PASSWORD)).toEqual(OK);
  });
});

describe('password reset', () => {
  async function waitForEmail(to: string) {
    const query = encodeURIComponent(`to:"${to}"`);
    for (let i = 0; i < 40; i++) {
      const res = await fetch(`${MAILPIT}/api/v1/search?query=${query}`);
      const body = (await res.json()) as { messages: Array<{ ID: string }> };
      const id = body.messages[0]?.ID;
      if (id) {
        const message = (await (await fetch(`${MAILPIT}/api/v1/message/${id}`)).json()) as {
          ID: string;
          Subject: string;
          HTML: string;
          Text: string;
        };
        return message;
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error(`No email for ${to} arrived in Mailpit`);
  }

  afterAll(async () => {
    // Remove the emails this run produced.
    const query = encodeURIComponent(`to:"${run}"`);
    await fetch(`${MAILPIT}/api/v1/search?query=${query}`, { method: 'DELETE' });
  });

  test('unknown email gets the same success response, and no email', async () => {
    const email = `nobody-${run}@example.test`;
    expect(await requestPasswordReset(email)).toEqual({ ok: true, data: undefined });
    await new Promise((r) => setTimeout(r, 1000));
    const query = encodeURIComponent(`to:"${email}"`);
    const body = (await (await fetch(`${MAILPIT}/api/v1/search?query=${query}`)).json()) as {
      messages: unknown[];
    };
    expect(body.messages).toHaveLength(0);
  });

  test('reset email arrives, its link leads to /reset/confirm, and the new password works', async () => {
    const user = await createUser('reset');
    expect(await requestPasswordReset(user.email)).toEqual({ ok: true, data: undefined });

    const message = await waitForEmail(user.email);
    const link = /href="([^"]+\/auth\/v1\/verify[^"]+)"/.exec(message.HTML)?.[1];
    expect(link, 'reset link in email').toBeTruthy();

    // Follow the link like a browser would: Supabase verifies it and redirects back to the app.
    const verify = await fetch(link!.replaceAll('&amp;', '&'), { redirect: 'manual' });
    const location = new URL(verify.headers.get('location') ?? '');
    expect(`${location.origin}${location.pathname}`).toBe(
      new URL('/reset/confirm', process.env.APP_URL).toString(),
    );
    const code = location.searchParams.get('code');
    expect(code, 'PKCE code in redirect').toBeTruthy();

    const newPassword = `new-${randomUUID()}`;
    expect(await confirmPasswordReset(code!, newPassword)).toEqual({ ok: true, data: undefined });
    expect(await currentUserId()).toBe(user.id);

    // The code is single-use.
    jar.clear();
    expect(await confirmPasswordReset(code!, `other-${randomUUID()}`)).toMatchObject({
      ok: false,
      error: { code: 'UNAUTHENTICATED' },
    });

    expect(await signInWithPassword(user.email, PASSWORD)).toEqual(GENERIC);
    expect(await signInWithPassword(user.email, newPassword)).toEqual({
      ok: true,
      data: undefined,
    });
  });
});
