// @vitest-environment node
// Integration: needs local Supabase (`pnpm db:start`). CI sets the env vars; locally
// they come from .env.local, which Vitest doesn't load on its own.
import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, expect, test, vi } from 'vitest';

vi.mock('server-only', () => ({}));

if (!process.env.DATABASE_URL && existsSync('.env.local')) process.loadEnvFile('.env.local');

const { eq, sql } = await import('drizzle-orm');
const { auditLog, users } = await import('@/db/schema');
const { getDb, withTx } = await import('@/lib/db');
const { recordAudit } = await import('@/lib/audit');

const actorId = randomUUID();

beforeAll(async () => {
  // users.id references auth.users, so the actor needs an auth row first.
  await getDb().execute(
    sql`insert into auth.users (id, email) values (${actorId}, ${`${actorId}@example.test`})`,
  );
  await getDb()
    .insert(users)
    .values({
      id: actorId,
      email: `${actorId}@example.test`,
      name: 'Audit test',
      authProvider: 'password',
    });
});

afterAll(async () => {
  // audit_log.actor_id has no cascade; deleting the auth row cascades to users.
  await getDb().delete(auditLog).where(eq(auditLog.actorId, actorId));
  await getDb().execute(sql`delete from auth.users where id = ${actorId}`);
  await getDb().$client.end();
});

test('recordAudit inside withTx commits one row whose diff keeps both sides', async () => {
  const entityId = randomUUID();

  await withTx((tx) =>
    recordAudit(tx, {
      actorId,
      entity: 'song',
      entityId,
      action: 'create',
      after: { id: entityId, title: 'Test song', createdAt: new Date() },
    }),
  );

  const rows = await getDb().select().from(auditLog).where(eq(auditLog.entityId, entityId));
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ actorId, entity: 'song', action: 'create' });
  expect(rows[0]?.diff).toEqual({ title: { from: null, to: 'Test song' } });
});

test('withTx rolls back the audit row when the callback throws', async () => {
  const entityId = randomUUID();

  await expect(
    withTx(async (tx) => {
      await recordAudit(tx, {
        actorId,
        entity: 'song',
        entityId,
        action: 'delete',
        before: { title: 'x' },
      });
      throw new Error('abort');
    }),
  ).rejects.toThrow('abort');

  const rows = await getDb().select().from(auditLog).where(eq(auditLog.entityId, entityId));
  expect(rows).toHaveLength(0);
});
