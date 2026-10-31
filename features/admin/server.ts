'use server';

/**
 * Admin › Users (contracts/api.md; REQ-AUTH-03, REQ-AUTH-07, REQ-AUTH-08).
 *
 * - `listUsers`      read helper: every user (or one access status) with branch name.
 * - `listBranchOptions` read helper for the branch selects.
 * - `inviteUser`     Supabase admin invite; the new account is `approved` at once.
 * - `updateUser`     role / branch / disable. The last active admin can't be demoted or
 *                    disabled, and an admin can't disable themselves.
 * - `approveUser` / `rejectUser` decide an access request, recording who decided and when.
 *                    An admin can't decide their own request; rejected users can be approved
 *                    later.
 *
 * Every function needs `admin:users`. Mutations write an audit entry (entity `user`).
 */

import 'server-only';

import { and, asc, eq, isNull, ne, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';

import { branches, users } from '@/db/schema';
import { ActionError, withAction } from '@/lib/action';
import { recordAudit } from '@/lib/audit';
import { requireUser } from '@/lib/auth';
import { getDb, withTx, type DB, type Tx } from '@/lib/db';
import { env } from '@/lib/env';
import { assertCan } from '@/lib/permissions';
import { createServiceSupabase } from '@/lib/supabase/server';
import {
  ACCESS_STATUSES,
  ROLES,
  type AccessStatus,
  type AuthProvider,
  type Branch,
  type ISODateTime,
  type Role,
  type UUID,
} from '@/types/domain';

/** One row of the Admin › Users table. */
export interface AdminUser {
  id: UUID;
  email: string;
  name: string;
  /** For a pending SSO user, the branch suggested by their IdP group mapping. */
  branchId: UUID | null;
  branchName: string | null;
  role: Role;
  authProvider: AuthProvider;
  accessStatus: AccessStatus;
  disabledAt: ISODateTime | null;
  /** When the account (or access request) was created. */
  createdAt: ISODateTime;
}

export type BranchOption = Pick<Branch, 'id' | 'name' | 'code'>;

const uuid = z.guid();
const branchIdSchema = uuid.nullable();

const listSchema = z.object({ accessStatus: z.enum(ACCESS_STATUSES).optional() }).optional();

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address').max(254),
  name: z.string().trim().min(1, 'Enter a name').max(120),
  role: z.enum(ROLES).default('member'),
  branchId: branchIdSchema.default(null),
});

const updateSchema = z
  .object({ role: z.enum(ROLES), branchId: branchIdSchema, disabled: z.boolean() })
  .partial()
  .strict();

const approveSchema = z.object({ role: z.enum(ROLES).default('member'), branchId: branchIdSchema });

const LAST_ADMIN_MSG = 'There must be at least one active admin. Make someone else an admin first.';

const userColumns = {
  id: users.id,
  email: users.email,
  name: users.name,
  branchId: users.branchId,
  branchName: branches.name,
  role: users.role,
  authProvider: users.authProvider,
  accessStatus: users.accessStatus,
  disabledAt: users.disabledAt,
  createdAt: users.createdAt,
};

type UserRow = {
  [K in keyof typeof userColumns]: K extends 'branchName'
    ? string | null
    : (typeof users.$inferSelect)[Exclude<K, 'branchName'>];
};

function toAdminUser(row: UserRow): AdminUser {
  return {
    ...row,
    authProvider: row.authProvider as AuthProvider,
    disabledAt: row.disabledAt ? row.disabledAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

async function selectUsers(db: Tx | DB, where?: SQL): Promise<AdminUser[]> {
  const rows = await db
    .select(userColumns)
    .from(users)
    .leftJoin(branches, eq(branches.id, users.branchId))
    .where(where)
    .orderBy(asc(users.name), asc(users.email));
  return rows.map(toAdminUser);
}

async function requireAdmin() {
  const user = await requireUser();
  assertCan(user, 'admin:users');
  return user;
}

async function assertBranchExists(tx: Tx, branchId: string | null): Promise<void> {
  if (branchId === null) return;
  const [row] = await tx
    .select({ id: branches.id })
    .from(branches)
    .where(eq(branches.id, branchId));
  if (!row) {
    throw new ActionError('VALIDATION', 'That branch no longer exists.', {
      branchId: ['Pick a branch from the list'],
    });
  }
}

/** The target row, locked for the rest of the transaction. */
async function lockUser(tx: Tx, id: string) {
  const [row] = await tx.select().from(users).where(eq(users.id, id)).for('update');
  if (!row) throw new ActionError('NOT_FOUND', 'That user no longer exists.');
  return row;
}

/**
 * Throws when `targetId` is the only approved, enabled admin. Locks every such row first, so two
 * admins demoting each other at the same moment can't both succeed.
 */
async function assertNotLastAdmin(tx: Tx, targetId: string): Promise<void> {
  const active = await tx
    .select({ id: users.id })
    .from(users)
    .where(
      and(eq(users.role, 'admin'), eq(users.accessStatus, 'approved'), isNull(users.disabledAt)),
    )
    .for('update');
  if (!active.some((r) => r.id !== targetId)) throw new ActionError('CONFLICT', LAST_ADMIN_MSG);
}

type AuditFields = Pick<
  typeof users.$inferSelect,
  'role' | 'branchId' | 'disabledAt' | 'accessStatus'
>;

function auditSnapshot(row: AuditFields) {
  return {
    role: row.role,
    branchId: row.branchId,
    disabledAt: row.disabledAt ? row.disabledAt.toISOString() : null,
    accessStatus: row.accessStatus,
  };
}

// ----- Read helpers ----------------------------------------------------------------------

/** All users, or only those with `accessStatus`, sorted by name. Needs `admin:users`. */
export async function listUsers(
  filter: { accessStatus?: AccessStatus } = {},
): Promise<AdminUser[]> {
  await requireAdmin();
  const input = listSchema.parse(filter);
  const where = input?.accessStatus ? eq(users.accessStatus, input.accessStatus) : undefined;
  return selectUsers(getDb(), where);
}

/** Branches for the role/branch selects, by name. Needs `admin:users`. */
export async function listBranchOptions(): Promise<BranchOption[]> {
  await requireAdmin();
  return getDb()
    .select({ id: branches.id, name: branches.name, code: branches.code })
    .from(branches)
    .orderBy(asc(branches.name));
}

// ----- Actions ---------------------------------------------------------------------------

/**
 * Invite someone by email (Supabase admin invite). The account is created `approved` with the
 * chosen role and branch. The email links to `/login`; from there they sign in with SSO for the
 * same address (linked by AUTH-06) or set a password through "Forgot password".
 */
export const inviteUser = withAction(
  async (input: {
    email: string;
    name: string;
    role?: Role;
    branchId?: string | null;
  }): Promise<AdminUser> => {
    const admin = await requireAdmin();
    const data = inviteSchema.parse(input);

    const db = getDb();
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(sql`lower(${users.email})`, data.email));
    if (existing) {
      throw new ActionError('CONFLICT', 'Someone with that email already has an account.', {
        email: ['This email already has an account'],
      });
    }
    await withTx((tx) => assertBranchExists(tx, data.branchId));

    const { data: invited, error } = await createServiceSupabase().auth.admin.inviteUserByEmail(
      data.email,
      { data: { name: data.name }, redirectTo: new URL('/login', env.APP_URL).toString() },
    );
    if (error || !invited.user) {
      if (error?.code === 'email_exists') {
        throw new ActionError('CONFLICT', 'Someone with that email already has an account.', {
          email: ['This email already has an account'],
        });
      }
      throw error ?? new Error('Invite returned no user');
    }
    const id = invited.user.id;

    try {
      return await insertInvited(admin.id, id, data);
    } catch (insertError) {
      // Don't leave an auth account without an app profile behind.
      await createServiceSupabase().auth.admin.deleteUser(id);
      throw insertError;
    }
  },
);

async function insertInvited(
  actorId: string,
  id: string,
  data: z.output<typeof inviteSchema>,
): Promise<AdminUser> {
  return withTx(async (tx) => {
    const [row] = await tx
      .insert(users)
      .values({
        id,
        email: data.email,
        name: data.name,
        role: data.role,
        branchId: data.branchId,
        authProvider: 'password',
        accessStatus: 'approved',
      })
      .returning();
    if (!row) throw new Error('user insert returned no row');
    await recordAudit(tx, {
      actorId,
      entity: 'user',
      entityId: id,
      action: 'create',
      after: { email: row.email, name: row.name, ...auditSnapshot(row) },
    });
    const [created] = await selectUsers(tx, eq(users.id, id));
    if (!created) throw new Error('invited user vanished');
    return created;
  });
}

/** Change a user's role or branch, or disable / re-enable them. */
export const updateUser = withAction(
  async (id: string, patch: { role?: Role; branchId?: string | null; disabled?: boolean }) => {
    const admin = await requireAdmin();
    const userId = uuid.parse(id);
    const data = updateSchema.parse(patch);

    if (data.disabled === true && userId === admin.id) {
      throw new ActionError('FORBIDDEN', "You can't disable your own account.");
    }

    await withTx(async (tx) => {
      const before = await lockUser(tx, userId);
      if (data.branchId !== undefined) await assertBranchExists(tx, data.branchId);

      const losesAdmin =
        before.role === 'admin' &&
        before.accessStatus === 'approved' &&
        before.disabledAt === null &&
        ((data.role !== undefined && data.role !== 'admin') || data.disabled === true);
      if (losesAdmin) await assertNotLastAdmin(tx, userId);

      const disabledAt =
        data.disabled === undefined
          ? before.disabledAt
          : data.disabled
            ? (before.disabledAt ?? new Date())
            : null;
      const [after] = await tx
        .update(users)
        .set({
          role: data.role ?? before.role,
          branchId: data.branchId === undefined ? before.branchId : data.branchId,
          disabledAt,
        })
        .where(eq(users.id, userId))
        .returning();
      if (!after) throw new ActionError('NOT_FOUND', 'That user no longer exists.');

      await recordAudit(tx, {
        actorId: admin.id,
        entity: 'user',
        entityId: userId,
        action: 'update',
        before: auditSnapshot(before),
        after: auditSnapshot(after),
      });
    });
  },
);

/** Shared body of approve/reject: lock, check, set the decision, audit. */
async function decide(
  id: string,
  decision: 'approved' | 'rejected',
  input?: unknown,
): Promise<void> {
  const admin = await requireAdmin();
  const userId = uuid.parse(id);
  const fields: { role?: Role; branchId?: string | null } =
    decision === 'approved' ? approveSchema.parse(input) : {};
  if (userId === admin.id) {
    throw new ActionError('FORBIDDEN', "You can't approve or reject your own account.");
  }

  await withTx(async (tx) => {
    const before = await lockUser(tx, userId);
    if (decision === 'approved' && before.accessStatus === 'approved') {
      throw new ActionError('CONFLICT', 'That account is already approved.');
    }
    if (decision === 'rejected' && before.accessStatus !== 'pending') {
      throw new ActionError(
        'CONFLICT',
        before.accessStatus === 'rejected'
          ? 'That request was already rejected.'
          : 'That account is already approved. Disable it instead.',
      );
    }
    if (fields.branchId !== undefined) await assertBranchExists(tx, fields.branchId);

    const [after] = await tx
      .update(users)
      .set({
        accessStatus: decision,
        accessDecidedBy: admin.id,
        accessDecidedAt: new Date(),
        ...(fields.role !== undefined ? { role: fields.role } : {}),
        ...(fields.branchId !== undefined ? { branchId: fields.branchId } : {}),
      })
      .where(and(eq(users.id, userId), ne(users.accessStatus, decision)))
      .returning();
    if (!after) throw new ActionError('CONFLICT', 'That request changed. Refresh and try again.');

    await recordAudit(tx, {
      actorId: admin.id,
      entity: 'user',
      entityId: userId,
      action: 'update',
      before: auditSnapshot(before),
      after: auditSnapshot(after),
    });
  });
}

/** Approve a pending (or previously rejected) account with a role and branch. */
export const approveUser = withAction(
  async (id: string, input: { role?: Role; branchId: string | null }): Promise<void> => {
    await decide(id, 'approved', input);
  },
);

/** Reject a pending access request. The user only sees `/account-status` until approved. */
export const rejectUser = withAction(async (id: string): Promise<void> => {
  await decide(id, 'rejected');
});
