// @vitest-environment node
// Integration (ADM-01): admin user actions against the local Supabase stack (DB + Auth admin
// API, Mailpit catches the invite email). Env comes from CI or .env.local. The signed-in admin
// is stubbed; every user this suite creates is deleted afterwards.
import { existsSync } from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';

import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';

import type { AppUser, Role } from '@/types/domain';

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

const { and, eq, inArray, isNull, ne } = await import('drizzle-orm');
const { auditLog, branches, users } = await import('@/db/schema');
const { getDb } = await import('@/lib/db');
const { createServiceSupabase } = await import('@/lib/supabase/server');
const { approveUser, inviteUser, listUsers, rejectUser, updateUser } = await import('./server');

const run = randomUUID().slice(0, 8);
const created: string[] = [];
let adminId = '';
let branchId = '';

async function createUser(
  label: string,
  values: { role?: Role; accessStatus?: 'pending' | 'approved' | 'rejected' } = {},
): Promise<string> {
  const email = `adm01-${label}-${run}@example.test`;
  const { data, error } = await createServiceSupabase().auth.admin.createUser({
    email,
    email_confirm: true,
  });
  if (error) throw error;
  created.push(data.user.id);
  await getDb()
    .insert(users)
    .values({
      id: data.user.id,
      email,
      name: `ADM-01 ${label} ${run}`,
      authProvider: 'google',
      ...values,
    });
  return data.user.id;
}

async function row(id: string) {
  const [r] = await getDb().select().from(users).where(eq(users.id, id));
  if (!r) throw new Error(`user ${id} missing`);
  return r;
}

function signInAs(id: string, role: Role = 'admin') {
  auth.current = {
    id,
    email: `${id}@example.test`,
    name: 'ADM-01 admin',
    branchId: null,
    role,
    authProvider: 'password',
    disabledAt: null,
    accessStatus: 'approved',
  };
}

beforeAll(async () => {
  adminId = await createUser('admin', { role: 'admin', accessStatus: 'approved' });
  const [b] = await getDb()
    .insert(branches)
    .values({
      name: `ADM-01 ${run}`,
      code: [...randomBytes(3)].map((b) => String.fromCharCode(65 + (b % 26))).join(''),
    })
    .returning({ id: branches.id });
  if (!b) throw new Error('branch insert failed');
  branchId = b.id;
});

afterAll(async () => {
  const db = getDb();
  await db.delete(auditLog).where(eq(auditLog.actorId, adminId));
  // Decisions reference the deciding admin, so clear them before deleting anyone.
  if (created.length > 0) {
    await db.update(users).set({ accessDecidedBy: null }).where(inArray(users.id, created));
  }
  const service = createServiceSupabase();
  for (const id of created.reverse()) await service.auth.admin.deleteUser(id);
  await db.delete(branches).where(eq(branches.id, branchId));
  await db.$client.end();
});

beforeEach(() => signInAs(adminId));

describe('listUsers', () => {
  test('filters by access status and includes the branch name', async () => {
    const pending = await createUser('list-pending');
    await getDb().update(users).set({ branchId }).where(eq(users.id, pending));

    const onlyPending = await listUsers({ accessStatus: 'pending' });
    expect(onlyPending.every((u) => u.accessStatus === 'pending')).toBe(true);
    expect(onlyPending.find((u) => u.id === pending)).toMatchObject({
      accessStatus: 'pending',
      branchId,
      branchName: `ADM-01 ${run}`,
      authProvider: 'google',
      createdAt: expect.any(String),
    });

    const all = await listUsers();
    expect(all.map((u) => u.id)).toEqual(expect.arrayContaining([pending, adminId]));
  });
});

describe('inviteUser', () => {
  test('creates an approved account and audits it; a second invite conflicts', async () => {
    const email = `adm01-invite-${run}@example.test`;
    const result = await inviteUser({
      email,
      name: 'Invited Person',
      role: 'contributor',
      branchId,
    });
    if (!result.ok) throw new Error(result.error.message);
    created.push(result.data.id);
    expect(result.data).toMatchObject({
      email,
      role: 'contributor',
      branchId,
      accessStatus: 'approved',
      disabledAt: null,
    });

    const [audit] = await getDb()
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.entityId, result.data.id), eq(auditLog.action, 'create')));
    expect(audit).toMatchObject({ actorId: adminId, entity: 'user' });

    expect(await inviteUser({ email: email.toUpperCase(), name: 'Again' })).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT' },
    });
  });

  test('an unknown branch is a VALIDATION error and creates nothing', async () => {
    const email = `adm01-nobranch-${run}@example.test`;
    const result = await inviteUser({ email, name: 'X', branchId: randomUUID() });
    expect(result).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
    expect(await getDb().select().from(users).where(eq(users.email, email))).toHaveLength(0);
  });
});

describe('approveUser / rejectUser', () => {
  test('approve sets role, branch and the decision, with an audit entry', async () => {
    const id = await createUser('approve');
    expect(await approveUser(id, { role: 'music_leader', branchId })).toEqual({
      ok: true,
      data: undefined,
    });
    const r = await row(id);
    expect(r).toMatchObject({
      accessStatus: 'approved',
      role: 'music_leader',
      branchId,
      accessDecidedBy: adminId,
    });
    expect(r.accessDecidedAt).toBeInstanceOf(Date);

    const audits = await getDb().select().from(auditLog).where(eq(auditLog.entityId, id));
    expect(audits[0]?.diff).toMatchObject({ accessStatus: { from: 'pending', to: 'approved' } });

    expect(await approveUser(id, { branchId: null })).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT' },
    });
  });

  test('reject records the decision; rejected users can be approved later', async () => {
    const id = await createUser('reject');
    expect(await rejectUser(id)).toEqual({ ok: true, data: undefined });
    expect(await row(id)).toMatchObject({ accessStatus: 'rejected', accessDecidedBy: adminId });
    expect(await rejectUser(id)).toMatchObject({ ok: false, error: { code: 'CONFLICT' } });

    expect(await approveUser(id, { branchId: null })).toEqual({ ok: true, data: undefined });
    expect(await row(id)).toMatchObject({ accessStatus: 'approved', role: 'member' });
  });

  test('unknown user is NOT_FOUND', async () => {
    expect(await rejectUser(randomUUID())).toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND' },
    });
  });
});

describe('updateUser', () => {
  test('changes role and branch, disables and re-enables', async () => {
    const id = await createUser('update', { accessStatus: 'approved' });
    expect(await updateUser(id, { role: 'contributor', branchId })).toEqual({
      ok: true,
      data: undefined,
    });
    expect(await row(id)).toMatchObject({ role: 'contributor', branchId, disabledAt: null });

    expect((await updateUser(id, { disabled: true })).ok).toBe(true);
    expect((await row(id)).disabledAt).toBeInstanceOf(Date);
    expect((await updateUser(id, { disabled: false })).ok).toBe(true);
    expect((await row(id)).disabledAt).toBeNull();
  });

  describe('last admin', () => {
    // Other suites (and the seed) may have active admins; park them for these tests.
    let parked: string[] = [];

    beforeAll(async () => {
      const others = await getDb()
        .update(users)
        .set({ disabledAt: new Date() })
        .where(
          and(
            eq(users.role, 'admin'),
            eq(users.accessStatus, 'approved'),
            isNull(users.disabledAt),
            ne(users.id, adminId),
          ),
        )
        .returning({ id: users.id });
      parked = others.map((o) => o.id);
    });

    afterAll(async () => {
      if (parked.length > 0) {
        await getDb().update(users).set({ disabledAt: null }).where(inArray(users.id, parked));
      }
    });

    test("the only admin can't be demoted", async () => {
      expect(await updateUser(adminId, { role: 'member' })).toMatchObject({
        ok: false,
        error: { code: 'CONFLICT' },
      });
      expect((await row(adminId)).role).toBe('admin');
    });

    test('with a second admin, either can be demoted or disabled', async () => {
      const second = await createUser('second-admin', { role: 'admin', accessStatus: 'approved' });
      expect((await updateUser(second, { disabled: true })).ok).toBe(true);
      // Now `adminId` is the only active admin again.
      expect(await updateUser(adminId, { role: 'member' })).toMatchObject({
        ok: false,
        error: { code: 'CONFLICT' },
      });
      expect((await updateUser(second, { disabled: false })).ok).toBe(true);
      expect((await updateUser(second, { role: 'music_leader' })).ok).toBe(true);
      expect((await row(second)).role).toBe('music_leader');
    });
  });
});
