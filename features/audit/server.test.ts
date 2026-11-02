// @vitest-environment node
// Unit: the checks that run before any DB work. DB paths are in server.int.test.ts.
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AppUser, Role } from '@/types/domain';

vi.mock('server-only', () => ({}));

const requireUser = vi.fn<() => Promise<AppUser>>();
vi.mock('@/lib/auth', () => ({ requireUser: () => requireUser() }));

const select = vi.fn(() => {
  throw new Error('no DB in unit tests');
});
vi.mock('@/lib/db', () => ({ db: { select: () => select() } }));

const { getAuditTrail } = await import('./server');
const { loadAuditTrail } = await import('./actions');

const SONG = '11111111-1111-4111-8111-111111111111';

const userWith = (role: Role): AppUser => ({
  id: '22222222-2222-4222-8222-222222222222',
  email: 'u@example.test',
  name: 'U',
  branchId: null,
  role,
  authProvider: 'password',
  disabledAt: null,
  accessStatus: 'approved',
});

beforeEach(() => {
  requireUser.mockReset();
  select.mockClear();
});

describe('getAuditTrail', () => {
  it('is forbidden for members', async () => {
    requireUser.mockResolvedValue(userWith('member'));
    await expect(getAuditTrail('song', SONG)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(select).not.toHaveBeenCalled();
  });

  it('returns [] for a malformed id or an entity outside song history', async () => {
    requireUser.mockResolvedValue(userWith('contributor'));
    await expect(getAuditTrail('song', 'not-a-uuid')).resolves.toEqual([]);
    await expect(getAuditTrail('', SONG)).resolves.toEqual([]);
    await expect(getAuditTrail('user', SONG)).resolves.toEqual([]);
    await expect(getAuditTrail('branch', SONG)).resolves.toEqual([]);
    expect(select).not.toHaveBeenCalled();
  });
});

describe('loadAuditTrail', () => {
  it('returns errors as an ActionResult', async () => {
    requireUser.mockResolvedValue(userWith('member'));
    const result = await loadAuditTrail('song', SONG);
    expect(result).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
  });

  it('wraps the trail', async () => {
    requireUser.mockResolvedValue(userWith('admin'));
    await expect(loadAuditTrail('user', SONG)).resolves.toEqual({ ok: true, data: [] });
  });
});
