// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

// Mocked per-request session client.
const auth = { getUser: vi.fn(), signOut: vi.fn() };
vi.mock('@/lib/supabase/server', () => ({ createServerSupabase: vi.fn(async () => ({ auth })) }));

import type { users } from '@/db/schema';
type UserRow = (typeof users)['$inferSelect'];

// Minimal Drizzle stand-in: select().from().where().limit() → one row.
const dbState = { row: undefined as UserRow | undefined };
const db = {
  select: vi.fn(() => ({
    from: () => ({
      where: () => ({
        limit: async () => (dbState.row ? [dbState.row] : []),
      }),
    }),
  })),
};
vi.mock('@/lib/db', () => ({ getDb: () => db, withTx: vi.fn() }));

// No app-profile / env access is needed; lib/env is not imported here, but stub it to be safe.
vi.mock('@/lib/env', () => ({ env: {} }));

const { accessForRow, getUser, requireRole, requireUser } = await import('./auth');

const USER_ID = '00000000-0000-4000-8000-000000000001';

function rowOver(partial: Partial<UserRow> = {}): UserRow {
  return {
    id: USER_ID,
    email: 'member@example.test',
    name: 'Test Member',
    branchId: null,
    role: 'member',
    authProvider: 'google',
    ssoSubject: null,
    lastLoginAt: null,
    disabledAt: null,
    accessStatus: 'approved',
    accessDecidedBy: null,
    accessDecidedAt: null,
    createdAt: new Date('2020-01-01'),
    ...partial,
  };
}

function signedIn(user: { id: string } | null): void {
  auth.getUser.mockResolvedValue({ data: { user }, error: null });
}

beforeEach(() => {
  vi.clearAllMocks();
  dbState.row = rowOver();
  signedIn({ id: USER_ID });
  auth.signOut.mockResolvedValue({ error: null });
});

// ----- accessForRow ----------------------------------------------------------------

describe('accessForRow', () => {
  it('returns null for no row', () => {
    expect(accessForRow(null)).toBeNull();
    expect(accessForRow(undefined)).toBeNull();
  });

  it('returns null when disabled (REQ-AUTH-06)', () => {
    expect(accessForRow(rowOver({ disabledAt: new Date() }))).toBeNull();
  });

  it('returns the AppUser for an active row regardless of access status', () => {
    const user = accessForRow(rowOver({ accessStatus: 'pending' }));
    expect(user).toMatchObject({ id: USER_ID, accessStatus: 'pending' });
  });
});

// ----- getUser ---------------------------------------------------------------------

describe('getUser', () => {
  it('returns null when signed out', async () => {
    signedIn(null);
    expect(await getUser()).toBeNull();
  });

  it('returns null on a session error', async () => {
    auth.getUser.mockResolvedValue({ data: { user: null }, error: new Error('boom') });
    expect(await getUser()).toBeNull();
  });

  it('returns the AppUser for an approved user', async () => {
    expect(await getUser()).toMatchObject({ id: USER_ID, accessStatus: 'approved' });
  });

  it('returns the AppUser for a pending user (any access status)', async () => {
    dbState.row = rowOver({ accessStatus: 'pending' });
    expect(await getUser()).toMatchObject({ accessStatus: 'pending' });
  });

  it('returns null when the user has no app row', async () => {
    dbState.row = undefined;
    expect(await getUser()).toBeNull();
  });

  it('signs out a disabled user on the next request (REQ-AUTH-06)', async () => {
    dbState.row = rowOver({ disabledAt: new Date() });
    expect(await getUser()).toBeNull();
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });
});

// ----- requireUser -----------------------------------------------------------------

describe('requireUser', () => {
  it('returns the user when approved', async () => {
    expect(await requireUser()).toMatchObject({ id: USER_ID, accessStatus: 'approved' });
  });

  it('throws UNAUTHENTICATED when signed out', async () => {
    signedIn(null);
    await expect(requireUser()).rejects.toMatchObject({
      name: 'ActionError',
      code: 'UNAUTHENTICATED',
    });
  });

  it('throws UNAUTHENTICATED when disabled', async () => {
    dbState.row = rowOver({ disabledAt: new Date() });
    await expect(requireUser()).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('throws FORBIDDEN for a pending user (REQ-AUTH-08)', async () => {
    dbState.row = rowOver({ accessStatus: 'pending' });
    await expect(requireUser()).rejects.toMatchObject({
      name: 'ActionError',
      code: 'FORBIDDEN',
    });
  });

  it('throws FORBIDDEN for a rejected user (REQ-AUTH-08)', async () => {
    dbState.row = rowOver({ accessStatus: 'rejected' });
    await expect(requireUser()).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('maps the throw through withAction into an ActionResult', async () => {
    const { withAction } = await import('@/lib/action');
    const { setSentryCapture } = await import('@/lib/action');
    setSentryCapture(vi.fn());
    dbState.row = rowOver({ accessStatus: 'pending' });
    const result = await withAction(async () => {
      await requireUser();
      return 'never';
    })();
    expect(result).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
  });
});

// ----- requireRole -----------------------------------------------------------------

describe('requireRole', () => {
  it('lets a member through requireRole("member")', async () => {
    expect(await requireRole('member')).toMatchObject({ role: 'member' });
  });

  it('rejects a member for a higher role', async () => {
    dbState.row = rowOver({ role: 'member' });
    await expect(requireRole('contributor')).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('lets a music_leader through requireRole("contributor")', async () => {
    dbState.row = rowOver({ role: 'music_leader' });
    expect(await requireRole('contributor')).toMatchObject({ role: 'music_leader' });
  });

  it('lets an admin through any role', async () => {
    dbState.row = rowOver({ role: 'admin' });
    expect(await requireRole('music_leader')).toMatchObject({ role: 'admin' });
  });

  it('requires approval first (a pending user never satisfies any role)', async () => {
    dbState.row = rowOver({ role: 'admin', accessStatus: 'pending' });
    await expect(requireRole('admin')).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
