// @vitest-environment node
// Integration (ADM-04): access request emails against local Supabase (`pnpm db:start`) and
// Mailpit on :54324. sign-up → every admin gets "access requested"; approve → the user gets
// "approved"; reject → no email; a failing SMTP server never fails sign-up or approval.
//
// The local stack doesn't publish Mailpit's SMTP port, so the Nodemailer transport is
// replaced by one that hands the message lib/email built (from, recipients, subject, HTML
// and text) to Mailpit's send API. Everything else is real: the Supabase sign-up, the
// database, the templates and lib/email's rendering.
import type { AppUser } from '@/types/domain';

import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('server-only', () => ({}));

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

let actor: AppUser;
vi.mock('@/lib/auth', () => ({ requireUser: async () => actor }));

const MAILPIT = process.env.MAILPIT_URL ?? 'http://127.0.0.1:54324';

interface SentMail {
  from?: string;
  to?: string | string[];
  bcc?: string[];
  subject: string;
  html: string;
  text: string;
}

const smtp = { fail: false };

/** "Name <a@b>" → { Name, Email }. */
function address(value: string): { Name: string; Email: string } {
  const match = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(value);
  return match ? { Name: match[1]!, Email: match[2]! } : { Name: '', Email: value.trim() };
}

vi.mock('nodemailer', () => ({
  createTransport: () => ({
    sendMail: async (mail: SentMail) => {
      if (smtp.fail) throw new Error('connect ECONNREFUSED 127.0.0.1:465');
      const to = typeof mail.to === 'string' ? [mail.to] : (mail.to ?? []);
      const res = await fetch(`${MAILPIT}/api/v1/send`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          From: address(mail.from ?? 'Worship Library <noreply@example.test>'),
          To: to.map(address),
          Bcc: mail.bcc ?? [],
          Subject: mail.subject,
          HTML: mail.html,
          Text: mail.text,
        }),
      });
      if (!res.ok) throw new Error(`Mailpit send failed: ${res.status} ${await res.text()}`);
      return { messageId: 'mailpit' };
    },
  }),
}));

if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY && existsSync('.env.local'))
  process.loadEnvFile('.env.local');
process.env.APP_URL ??= 'http://127.0.0.1:3000';
process.env.CRON_SECRET ??= 'integration-test-cron-secret';
// "Configured" so lib/email really sends; the transport above delivers to Mailpit only.
process.env.SMTP_HOST = '127.0.0.1';
process.env.SMTP_PORT = '1025';
process.env.SMTP_USER = 'adm04-test@example.test';
process.env.SMTP_PASSWORD = 'not-a-real-password';
process.env.EMAIL_FROM = 'Worship Library <adm04-test@example.test>';

const { eq, inArray } = await import('drizzle-orm');
const { auditLog, users } = await import('@/db/schema');
const { getDb } = await import('@/lib/db');
const { createServiceSupabase } = await import('@/lib/supabase/server');
const { signUpWithPassword } = await import('@/features/auth/actions');
const { approveUser, rejectUser } = await import('./server');

const run = randomUUID().slice(0, 8);
const PASSWORD = `pw-${randomUUID()}`;
const created: string[] = [];

interface MailpitAddress {
  Address: string;
}
interface MailpitMessage {
  ID: string;
  Subject: string;
  To: MailpitAddress[];
  Bcc: MailpitAddress[];
  HTML: string;
  Text: string;
}

async function search(query: string): Promise<Array<{ ID: string }>> {
  const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(query)}`);
  return ((await res.json()) as { messages: Array<{ ID: string }> }).messages;
}

async function waitForEmail(query: string): Promise<MailpitMessage> {
  for (let i = 0; i < 40; i++) {
    const id = (await search(query))[0]?.ID;
    if (id)
      return (await (await fetch(`${MAILPIT}/api/v1/message/${id}`)).json()) as MailpitMessage;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`No email matching ${query} arrived in Mailpit`);
}

const addresses = (list: MailpitAddress[] | null) => (list ?? []).map((a) => a.Address);

async function pendingUser(label: string): Promise<{ id: string; email: string; name: string }> {
  const email = `adm04-${label}-${run}@example.test`;
  const name = `ADM-04 ${label} ${run}`;
  expect(await signUpWithPassword({ name, email, password: PASSWORD })).toEqual({
    ok: true,
    data: undefined,
  });
  const [row] = await getDb().select().from(users).where(eq(users.email, email));
  if (!row) throw new Error('sign-up created no row');
  created.push(row.id);
  expect(row.accessStatus).toBe('pending');
  return { id: row.id, email, name };
}

beforeAll(async () => {
  const email = `adm04-admin-${run}@example.test`;
  const { data, error } = await createServiceSupabase().auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error) throw error;
  created.push(data.user.id);
  actor = {
    id: data.user.id,
    email,
    name: `ADM-04 admin ${run}`,
    branchId: null,
    role: 'admin',
    authProvider: 'password',
    disabledAt: null,
    accessStatus: 'approved',
  };
  await getDb().insert(users).values({
    id: actor.id,
    email,
    name: actor.name,
    role: 'admin',
    authProvider: 'password',
    accessStatus: 'approved',
  });
});

afterAll(async () => {
  const db = getDb();
  if (actor) await db.delete(auditLog).where(eq(auditLog.actorId, actor.id));
  // Decisions reference the deciding admin, so clear them before deleting anyone.
  if (created.length > 0) {
    await db.update(users).set({ accessDecidedBy: null }).where(inArray(users.id, created));
  }
  const admin = createServiceSupabase();
  for (const id of created) {
    const { error } = await admin.auth.admin.deleteUser(id); // cascades to public.users
    if (error) throw error;
  }
  await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(run)}`, { method: 'DELETE' });
  await getDb().$client.end();
});

beforeEach(() => {
  jar.clear();
  smtp.fail = false;
});

describe('access request emails', () => {
  test('sign-up emails every admin; approval emails the user', async () => {
    const requester = await pendingUser('approve');

    const request = await waitForEmail(`subject:"Access request from ${requester.name}"`);
    const bcc = addresses(request.Bcc);
    expect(bcc).toContain(actor.email);
    expect(addresses(request.To)).not.toContain(actor.email); // admins are BCC'd
    expect(bcc).not.toContain(requester.email);
    expect(request.Text).toContain(requester.email);
    expect(request.Text).toContain('Email and password');
    expect(request.Text).toContain('None. Choose one when you approve.');
    expect(request.HTML).toContain(new URL('/admin/users', process.env.APP_URL).toString());

    expect(await approveUser(requester.id, { role: 'member', branchId: null })).toEqual({
      ok: true,
      data: undefined,
    });
    const approved = await waitForEmail(
      `to:"${requester.email}" subject:"Your Worship Library account is ready"`,
    );
    expect(approved.Text).toContain(`Hi ${requester.name},`);
    expect(approved.HTML).toContain(new URL('/login', process.env.APP_URL).toString());
  });

  test('rejection sends no email', async () => {
    const requester = await pendingUser('reject');
    await waitForEmail(`subject:"Access request from ${requester.name}"`);

    expect(await rejectUser(requester.id)).toEqual({ ok: true, data: undefined });
    await new Promise((r) => setTimeout(r, 1000));
    expect(await search(`to:"${requester.email}"`)).toHaveLength(0);
  });

  test('a failing SMTP server fails neither sign-up nor approval', async () => {
    smtp.fail = true;
    const requester = await pendingUser('smtp-down');

    expect(await approveUser(requester.id, { role: 'member', branchId: null })).toEqual({
      ok: true,
      data: undefined,
    });
    const [row] = await getDb()
      .select({ accessStatus: users.accessStatus, decidedBy: users.accessDecidedBy })
      .from(users)
      .where(eq(users.id, requester.id));
    expect(row).toEqual({ accessStatus: 'approved', decidedBy: actor.id });
    expect(await search(`smtp-down-${run}`)).toHaveLength(0);
  });
});
