// @vitest-environment node
// Integration (ADM-02): branch actions in features/admin/server.ts against the local Supabase DB.
// Env comes from CI or .env.local. The signed-in admin is stubbed; every row this suite creates
// is deleted afterwards. (Kept in ADM-02's own folder; server.ts is a touched file.)
import { existsSync } from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';

import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';

import type { AppUser } from '@/types/domain';

vi.mock('server-only', () => ({}));

const auth = vi.hoisted(() => ({ current: null as AppUser | null }));
vi.mock('@/lib/auth', () => ({
  requireUser: async () => {
    if (!auth.current) throw new Error('no user stubbed');
    return auth.current;
  },
}));

if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY && existsSync('.env.local'))
  process.loadEnvFile('.env.local');
process.env.APP_URL ??= 'http://127.0.0.1:3000';
process.env.CRON_SECRET ??= 'integration-test-cron-secret';

const { and, eq, inArray } = await import('drizzle-orm');
const { auditLog, branches, users } = await import('@/db/schema');
const { getDb } = await import('@/lib/db');
const { createServiceSupabase } = await import('@/lib/supabase/server');
const { deleteBranch, listBranches, upsertBranch } = await import('@/features/admin/server');

const run = randomUUID().slice(0, 8);
const createdBranches: string[] = [];
let adminId = '';

/** A random 3-letter code; collisions with the seed's SV/OR/CO/RF are vanishingly rare. */
const randomCode = () =>
  [...randomBytes(3)].map((b) => String.fromCharCode(65 + (b % 26))).join('');

async function create(label: string, ssoGroup: string | null = null) {
  const result = await upsertBranch({
    name: `ADM-02 ${label} ${run}`,
    code: randomCode(),
    ssoGroup,
  });
  if (!result.ok) throw new Error(result.error.message);
  createdBranches.push(result.data.id);
  return result.data;
}

beforeAll(async () => {
  const email = `adm02-admin-${run}@example.test`;
  const { data, error } = await createServiceSupabase().auth.admin.createUser({
    email,
    email_confirm: true,
  });
  if (error) throw error;
  adminId = data.user.id;
  await getDb()
    .insert(users)
    .values({
      id: adminId,
      email,
      name: `ADM-02 admin ${run}`,
      authProvider: 'password',
      role: 'admin',
      accessStatus: 'approved',
    });
});

afterAll(async () => {
  const db = getDb();
  await db.delete(auditLog).where(eq(auditLog.actorId, adminId));
  await db.update(users).set({ branchId: null }).where(eq(users.id, adminId));
  await createServiceSupabase().auth.admin.deleteUser(adminId);
  if (createdBranches.length > 0) {
    await db.delete(branches).where(inArray(branches.id, createdBranches));
  }
  await db.$client.end();
});

beforeEach(() => {
  auth.current = {
    id: adminId,
    email: `${adminId}@example.test`,
    name: 'ADM-02 admin',
    branchId: null,
    role: 'admin',
    authProvider: 'password',
    disabledAt: null,
    accessStatus: 'approved',
  };
});

describe('upsertBranch', () => {
  test('creates (upper-casing the code) and updates, auditing both', async () => {
    const code = randomCode();
    const created = await upsertBranch({
      name: `ADM-02 create ${run}`,
      code: code.toLowerCase(),
      ssoGroup: `adm02-${run}`,
    });
    if (!created.ok) throw new Error(created.error.message);
    createdBranches.push(created.data.id);
    expect(created.data).toMatchObject({
      code,
      ssoGroup: `adm02-${run}`,
      references: { users: 0, songs: 0, lists: 0, usage: 0 },
    });

    const updated = await upsertBranch({
      id: created.data.id,
      name: `ADM-02 renamed ${run}`,
      code,
      ssoGroup: null,
    });
    expect(updated).toMatchObject({
      ok: true,
      data: { name: `ADM-02 renamed ${run}`, ssoGroup: null },
    });

    const audits = await getDb()
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.entity, 'branch'), eq(auditLog.entityId, created.data.id)));
    expect(audits.map((a) => a.action).sort()).toEqual(['create', 'update']);
    expect(audits.find((a) => a.action === 'update')?.diff).toMatchObject({
      name: { from: `ADM-02 create ${run}`, to: `ADM-02 renamed ${run}` },
      ssoGroup: { from: `adm02-${run}`, to: null },
    });
  });

  test('a taken name, code or SSO group is CONFLICT with an inline field error', async () => {
    const a = await create('taken-a', `adm02-taken-${run}`);
    const b = await create('taken-b');

    const result = await upsertBranch({
      id: b.id,
      name: a.name.toUpperCase(),
      code: a.code,
      ssoGroup: a.ssoGroup,
    });
    expect(result).toMatchObject({
      ok: false,
      error: {
        code: 'CONFLICT',
        fieldErrors: {
          name: [expect.any(String)],
          code: [expect.any(String)],
          ssoGroup: [expect.any(String)],
        },
      },
    });
    const [unchanged] = await getDb().select().from(branches).where(eq(branches.id, b.id));
    expect(unchanged).toMatchObject({ name: b.name, code: b.code });

    // Saving a branch with its own values isn't a clash.
    expect((await upsertBranch({ ...a, id: a.id })).ok).toBe(true);
  });

  test('an unknown id is NOT_FOUND', async () => {
    expect(
      await upsertBranch({ id: randomUUID(), name: `ADM-02 ghost ${run}`, code: randomCode() }),
    ).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
  });
});

describe('listBranches', () => {
  test('includes reference counts', async () => {
    const used = await create('used');
    await getDb().update(users).set({ branchId: used.id }).where(eq(users.id, adminId));
    const listed = await listBranches();
    expect(listed.find((b) => b.id === used.id)?.references).toEqual({
      users: 1,
      songs: 0,
      lists: 0,
      usage: 0,
    });
    await getDb().update(users).set({ branchId: null }).where(eq(users.id, adminId));
  });
});

describe('deleteBranch', () => {
  test('refuses a referenced branch, deletes an unreferenced one, and audits it', async () => {
    const branch = await create('delete');
    await getDb().update(users).set({ branchId: branch.id }).where(eq(users.id, adminId));
    expect(await deleteBranch(branch.id)).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT' },
    });

    await getDb().update(users).set({ branchId: null }).where(eq(users.id, adminId));
    expect(await deleteBranch(branch.id)).toEqual({ ok: true, data: undefined });
    expect(await getDb().select().from(branches).where(eq(branches.id, branch.id))).toHaveLength(0);
    const [audit] = await getDb()
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.entityId, branch.id), eq(auditLog.action, 'delete')));
    expect(audit).toMatchObject({ entity: 'branch', actorId: adminId });

    expect(await deleteBranch(branch.id)).toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND' },
    });
  });
});
