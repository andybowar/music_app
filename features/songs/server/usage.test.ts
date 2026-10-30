// @vitest-environment node
// Unit: the checks that run before any DB work. DB paths are in usage.int.test.ts.
import type { AppUser, Role } from '@/types/domain';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ActionError } from '@/lib/action';

vi.mock('server-only', () => ({}));

const requireUser = vi.fn<() => Promise<AppUser>>();
vi.mock('@/lib/auth', () => ({ requireUser: () => requireUser() }));

const withTx = vi.fn();
vi.mock('@/lib/db', () => ({ withTx: (...args: unknown[]) => withTx(...args) }));
vi.mock('@/lib/audit', () => ({ recordAudit: vi.fn() }));

const { setBranchUsage } = await import('./usage');

const SONG = '11111111-1111-4111-8111-111111111111';
const BR_A = '22222222-2222-4222-8222-222222222222';
const BR_B = '33333333-3333-4333-8333-333333333333';

function userWith(role: Role): AppUser {
  return {
    id: '44444444-4444-4444-8444-444444444444',
    email: 'x@example.test',
    name: 'Test',
    branchId: null,
    role,
    authProvider: 'password',
    disabledAt: null,
    accessStatus: 'approved',
  };
}

const valid = [{ branchId: BR_A, level: 'high' as const }];

beforeEach(() => {
  requireUser.mockReset();
  withTx.mockReset();
  withTx.mockResolvedValue(undefined);
  requireUser.mockResolvedValue(userWith('contributor'));
});

describe('setBranchUsage', () => {
  it('passes requireUser failures through', async () => {
    requireUser.mockRejectedValue(new ActionError('UNAUTHENTICATED', 'Sign in.'));
    const result = await setBranchUsage(SONG, valid);
    expect(result).toEqual({ ok: false, error: { code: 'UNAUTHENTICATED', message: 'Sign in.' } });
    expect(withTx).not.toHaveBeenCalled();
  });

  it('denies a member before any DB work', async () => {
    requireUser.mockResolvedValue(userWith('member'));
    const result = await setBranchUsage(SONG, valid);
    // Code is FORBIDDEN once CR LIB-07-assertcan-actionerror lands; INTERNAL until then.
    expect(result.ok).toBe(false);
    expect(withTx).not.toHaveBeenCalled();
  });

  it.each(['contributor', 'music_leader', 'admin'] as const)('allows a %s', async (role) => {
    requireUser.mockResolvedValue(userWith(role));
    const result = await setBranchUsage(SONG, valid);
    expect(result).toEqual({ ok: true, data: undefined });
    expect(withTx).toHaveBeenCalledOnce();
  });

  it('accepts an empty list (clears all manual rows)', async () => {
    const result = await setBranchUsage(SONG, []);
    expect(result.ok).toBe(true);
    expect(withTx).toHaveBeenCalledOnce();
  });

  it('rejects a bad song id with VALIDATION on songId', async () => {
    const result = await setBranchUsage('nope', valid);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('VALIDATION');
      expect(result.error.fieldErrors).toHaveProperty('songId');
    }
    expect(withTx).not.toHaveBeenCalled();
  });

  it.each([
    ['an unknown level', [{ branchId: BR_A, level: 'often' }], '0.level'],
    ['a bad branch id', [{ branchId: 'x', level: 'low' }], '0.branchId'],
    [
      'a duplicate branch',
      [
        { branchId: BR_A, level: 'low' },
        { branchId: BR_B, level: 'rare' },
        { branchId: BR_A, level: 'high' },
      ],
      '2.branchId',
    ],
  ])('rejects %s with fieldErrors indexed into entries', async (_label, entries, field) => {
    const result = await setBranchUsage(SONG, entries as typeof valid);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('VALIDATION');
      expect(result.error.fieldErrors).toHaveProperty([field]);
    }
    expect(withTx).not.toHaveBeenCalled();
  });
});
