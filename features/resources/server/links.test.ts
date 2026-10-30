// @vitest-environment node
// Unit: the checks that run before any DB work. DB paths are in links.int.test.ts.
import type { AppUser, Role } from '@/types/domain';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ActionError } from '@/lib/action';

vi.mock('server-only', () => ({}));

const requireUser = vi.fn<() => Promise<AppUser>>();
vi.mock('@/lib/auth', () => ({ requireUser: () => requireUser() }));

const withTx = vi.fn();
vi.mock('@/lib/db', () => ({ withTx: (...args: unknown[]) => withTx(...args) }));
vi.mock('@/lib/audit', () => ({ recordAudit: vi.fn() }));

const { addLink, updateLink } = await import('./links');

const SONG = '11111111-1111-4111-8111-111111111111';
const KEY = '22222222-2222-4222-8222-222222222222';
const RES = '33333333-3333-4333-8333-333333333333';

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

const valid = {
  songId: SONG,
  songKeyId: KEY,
  kind: 'video_link' as const,
  label: 'YouTube',
  url: 'https://youtu.be/fakeVid0_-1',
};

beforeEach(() => {
  requireUser.mockReset();
  withTx.mockReset();
  requireUser.mockResolvedValue(userWith('contributor'));
});

describe.each([
  ['addLink', (input: unknown) => addLink(input as typeof valid)],
  ['updateLink', (input: unknown) => updateLink(RES, input as typeof valid)],
])('%s', (_name, call) => {
  it('passes requireUser failures through', async () => {
    requireUser.mockRejectedValue(new ActionError('UNAUTHENTICATED', 'Sign in.'));
    const result = await call(valid);
    expect(result).toEqual({ ok: false, error: { code: 'UNAUTHENTICATED', message: 'Sign in.' } });
    expect(withTx).not.toHaveBeenCalled();
  });

  it('returns FORBIDDEN (not INTERNAL) for a member', async () => {
    requireUser.mockResolvedValue(userWith('member'));
    const result = await call(valid);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('FORBIDDEN');
    expect(withTx).not.toHaveBeenCalled();
  });

  it.each([
    ['a non-http url', { url: 'javascript:alert(1)' }, 'url'],
    ['an empty label', { label: '  ' }, 'label'],
    ['a kind that cannot be a link', { kind: 'chord_chart' }, 'kind'],
    ['a keyed kind without a key', { songKeyId: null }, 'songKeyId'],
    ['a projection with a key', { kind: 'projection' }, 'songKeyId'],
    ['a bad song id', { songId: 'nope' }, 'songId'],
  ])('rejects %s with VALIDATION', async (_label, patch, field) => {
    const result = await call({ ...valid, ...patch });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('VALIDATION');
      expect(result.error.fieldErrors).toHaveProperty(field);
    }
    expect(withTx).not.toHaveBeenCalled();
  });

  it('accepts valid input and opens a transaction', async () => {
    withTx.mockResolvedValue({ id: RES });
    const result = await call(valid);
    expect(result).toEqual({ ok: true, data: { id: RES } });
    expect(withTx).toHaveBeenCalledOnce();
  });
});

it('updateLink rejects a malformed id', async () => {
  const result = await updateLink('nope', valid);
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error.code).toBe('VALIDATION');
  expect(withTx).not.toHaveBeenCalled();
});

it('addLink accepts a projection link without a key', async () => {
  withTx.mockResolvedValue({ id: RES });
  const { songKeyId: _omit, ...rest } = valid;
  const result = await addLink({ ...rest, kind: 'projection', label: 'Slides' });
  expect(result.ok).toBe(true);
});
