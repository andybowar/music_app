// @vitest-environment node
// Integration: sendShareEmail (SHR-03) against local Supabase (`pnpm db:start`). SMTP is not
// configured in tests, so lib/email renders the message and logs it instead of sending.
import type { AppUser } from '@/types/domain';

import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';

vi.mock('server-only', () => ({}));

if (!process.env.DATABASE_URL && existsSync('.env.local')) process.loadEnvFile('.env.local');
// Never send real mail from tests, whatever .env.local says.
process.env.SMTP_USER = '';
process.env.SMTP_PASSWORD = '';

const { and, eq, inArray, sql } = await import('drizzle-orm');
const { auditLog, branches, lists, shares, users } = await import('@/db/schema');
const { getDb } = await import('@/lib/db');

let actor: AppUser;
vi.mock('@/lib/auth', () => ({ requireUser: async () => actor }));

const { sendShareEmail } = await import('./server');

const tag = randomUUID().slice(0, 8);
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const code = () =>
  Array.from({ length: 3 }, () => LETTERS[Math.floor(Math.random() * 26)]).join('');

let branchId: string;
let listId: string;
let otherListId: string;

beforeAll(async () => {
  const [branch] = await getDb()
    .insert(branches)
    .values({ name: `SHR-03 ${tag}`, code: code() })
    .returning({ id: branches.id });
  branchId = branch!.id;

  const id = randomUUID();
  actor = {
    id,
    email: `${id}@example.test`,
    name: `SHR-03 leader ${tag}`,
    branchId,
    role: 'music_leader',
    authProvider: 'password',
    disabledAt: null,
    accessStatus: 'approved',
  };
  await getDb().execute(sql`insert into auth.users (id, email) values (${id}, ${actor.email})`);
  await getDb().insert(users).values({
    id,
    email: actor.email,
    name: actor.name,
    role: actor.role,
    branchId,
    authProvider: 'password',
    accessStatus: 'approved',
  });

  const inserted = await getDb()
    .insert(lists)
    .values([
      { type: 'setlist', name: `SHR-03 A ${tag}`, eventDate: '2030-01-06', ownerId: id, branchId },
      { type: 'playlist', name: `SHR-03 B ${tag}`, ownerId: id, branchId },
    ])
    .returning({ id: lists.id });
  listId = inserted[0]!.id;
  otherListId = inserted[1]!.id;
});

afterAll(async () => {
  if (actor) await getDb().delete(auditLog).where(eq(auditLog.actorId, actor.id));
  if (listId)
    await getDb()
      .delete(lists)
      .where(inArray(lists.id, [listId, otherListId]));
  if (actor) {
    await getDb().delete(users).where(eq(users.id, actor.id));
    await getDb().execute(sql`delete from auth.users where id = ${actor.id}`);
  }
  if (branchId) await getDb().delete(branches).where(eq(branches.id, branchId));
  await getDb().$client.end();
});

describe('sendShareEmail', () => {
  test('gives each email its own never-expiring link and stores no addresses', async () => {
    for (let i = 0; i < 2; i++) {
      expect(await sendShareEmail(listId, ['a@example.test', 'b@example.test'])).toEqual({
        ok: true,
        data: undefined,
      });
    }
    const links = await getDb().select().from(shares).where(eq(shares.listId, listId));
    expect(links).toHaveLength(2);
    for (const link of links) {
      expect(link).toMatchObject({ createdBy: actor.id, expiresAt: null, revokedAt: null });
    }

    const rows = await getDb()
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.actorId, actor.id), eq(auditLog.entity, 'share_email')));
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      entityId: listId,
      action: 'create',
      diff: { recipients: { from: null, to: 2 } },
    });
    expect(JSON.stringify(rows)).not.toContain('@example.test');
  });

  test('still works after earlier links are revoked', async () => {
    await getDb()
      .update(shares)
      .set({ revokedAt: sql`now()` })
      .where(eq(shares.listId, listId));
    expect((await sendShareEmail(listId, ['a@example.test'])).ok).toBe(true);
    const live = await getDb()
      .select()
      .from(shares)
      .where(and(eq(shares.listId, listId), sql`${shares.revokedAt} is null`));
    expect(live).toHaveLength(1);
  });

  test('returns RATE_LIMITED after 10 emails per user per hour, across lists', async () => {
    // 3 sent above; 7 more on another list reach the limit.
    for (let i = 0; i < 7; i++) {
      expect((await sendShareEmail(otherListId, ['a@example.test'])).ok).toBe(true);
    }
    const result = await sendShareEmail(listId, ['a@example.test']);
    expect(result).toMatchObject({ ok: false, error: { code: 'RATE_LIMITED' } });

    // Older sends drop out of the window.
    await getDb()
      .update(auditLog)
      .set({ createdAt: sql`now() - interval '61 minutes'` })
      .where(eq(auditLog.actorId, actor.id));
    expect((await sendShareEmail(listId, ['a@example.test'])).ok).toBe(true);
  });
});
