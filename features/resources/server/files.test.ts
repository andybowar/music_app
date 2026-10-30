// @vitest-environment node
// Unit: the checks that run before any DB or Storage work. The full flow is in files.int.test.ts.
import type { AppUser, Role } from '@/types/domain';
import type { UploadRequest } from '@/types/validation';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ActionError } from '@/lib/action';

vi.mock('server-only', () => ({}));

const requireUser = vi.fn<() => Promise<AppUser>>();
vi.mock('@/lib/auth', () => ({ requireUser: () => requireUser() }));

const withTx = vi.fn();
const select = vi.fn();
vi.mock('@/lib/db', () => ({
  withTx: (...args: unknown[]) => withTx(...args),
  db: { select: (...args: unknown[]) => select(...args) },
}));
vi.mock('@/lib/audit', () => ({ recordAudit: vi.fn() }));
vi.mock('@/lib/storage', () => ({
  canonicalMimeType: vi.fn(),
  createUploadUrl: vi.fn(),
  objectExists: vi.fn(),
  readObjectHead: vi.fn(),
  removeObject: vi.fn(),
  resourcePath: vi.fn(),
  signedReadUrl: vi.fn(),
  sniffFormat: vi.fn(),
}));

const { deleteResource, finalizeUpload, getSignedResourceUrl, requestUpload } =
  await import('./files');

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

const valid: UploadRequest = {
  songId: SONG,
  songKeyId: KEY,
  kind: 'chord_chart',
  format: 'pdf',
  label: 'Chord chart',
  sizeBytes: 1024,
  mimeType: 'application/pdf',
};

beforeEach(() => {
  requireUser.mockReset();
  withTx.mockReset();
  select.mockReset();
  requireUser.mockResolvedValue(userWith('contributor'));
});

describe('requestUpload', () => {
  it('passes requireUser failures through', async () => {
    requireUser.mockRejectedValue(new ActionError('UNAUTHENTICATED', 'Sign in.'));
    const result = await requestUpload(valid);
    expect(result).toEqual({ ok: false, error: { code: 'UNAUTHENTICATED', message: 'Sign in.' } });
    expect(withTx).not.toHaveBeenCalled();
  });

  it('denies a member', async () => {
    requireUser.mockResolvedValue(userWith('member'));
    const result = await requestUpload(valid);
    expect(result.ok).toBe(false);
    expect(withTx).not.toHaveBeenCalled();
  });

  it.each([
    ['a projection with a key', { kind: 'projection', format: 'pptx' }, 'songKeyId'],
    ['a keyed kind without a key', { songKeyId: null }, 'songKeyId'],
    ['a PDF as audio', { kind: 'audio', format: 'pdf' }, 'format'],
    ['an mp3 as a chord chart', { format: 'mp3' }, 'format'],
    ['a url format', { format: 'url' }, 'format'],
    ['a file over the size limit', { sizeBytes: 50 * 1024 * 1024 + 1 }, 'sizeBytes'],
    ['an empty file', { sizeBytes: 0 }, 'sizeBytes'],
    ['an empty label', { label: ' ' }, 'label'],
    ['a bad song id', { songId: 'nope' }, 'songId'],
  ])('rejects %s with VALIDATION', async (_label, patch, field) => {
    const result = await requestUpload({ ...valid, ...patch } as UploadRequest);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('VALIDATION');
      expect(result.error.fieldErrors).toHaveProperty(field);
    }
    expect(withTx).not.toHaveBeenCalled();
  });

  it('accepts a key-independent projection file', async () => {
    withTx.mockResolvedValue({ resourceId: RES, uploadUrl: 'u', path: 'p' });
    const result = await requestUpload({
      ...valid,
      songKeyId: null,
      kind: 'projection',
      format: 'pro',
    });
    expect(result).toEqual({ ok: true, data: { resourceId: RES, uploadUrl: 'u', path: 'p' } });
    expect(withTx).toHaveBeenCalledOnce();
  });
});

describe.each([
  ['finalizeUpload', finalizeUpload, 'resource:write'],
  ['deleteResource', deleteResource, 'resource:write'],
  ['getSignedResourceUrl', getSignedResourceUrl, 'resource:read'],
] as const)('%s', (_name, action, permission) => {
  it('rejects a malformed id with VALIDATION', async () => {
    const result = await action('nope');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('VALIDATION');
    expect(withTx).not.toHaveBeenCalled();
    expect(select).not.toHaveBeenCalled();
  });

  it('passes requireUser failures through', async () => {
    requireUser.mockRejectedValue(new ActionError('UNAUTHENTICATED', 'Sign in.'));
    const result = await action(RES);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('UNAUTHENTICATED');
  });

  if (permission === 'resource:write') {
    it('denies a member', async () => {
      requireUser.mockResolvedValue(userWith('member'));
      const result = await action(RES);
      expect(result.ok).toBe(false);
      expect(withTx).not.toHaveBeenCalled();
    });
  }
});

it('getSignedResourceUrl returns NOT_FOUND when no finalized file matches', async () => {
  requireUser.mockResolvedValue(userWith('member'));
  const where = vi.fn().mockResolvedValue([]);
  select.mockReturnValue({ from: () => ({ innerJoin: () => ({ where }) }) });
  const result = await getSignedResourceUrl(RES);
  expect(result).toEqual({ ok: false, error: { code: 'NOT_FOUND', message: 'File not found.' } });
});
