// @vitest-environment node
// Unit: the guard rails that run before any database or Storage work (auth, permission,
// validation). DB, RLS, Storage and the rate limit are covered by tests/db/bugs.int.test.ts.
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { users as fixtureUsers } from '@/fixtures';
import { ActionError } from '@/lib/action';
import type { AccessStatus, AppUser, Role } from '@/types/domain';

vi.mock('server-only', () => ({}));

const auth = vi.hoisted(() => ({ requireUser: vi.fn() }));
vi.mock('@/lib/auth', () => auth);

const unexpected = () => {
  throw new Error('unexpected DB access');
};
vi.mock('@/lib/db', () => ({
  db: new Proxy({}, { get: unexpected }),
  withTx: vi.fn(unexpected),
}));
vi.mock('@/features/admin/backlog/storage', () => ({
  bugFolder: vi.fn(),
  bugImagePath: vi.fn(),
  createUploadUrl: vi.fn(unexpected),
  decodePendingId: vi.fn(() => null),
  encodePendingId: vi.fn(),
  listFolderObjects: vi.fn(unexpected),
  objectInfo: vi.fn(unexpected),
  PENDING_TTL_MS: 1,
  readObjectHead: vi.fn(unexpected),
  removeObjects: vi.fn(unexpected),
  signedReadUrls: vi.fn(unexpected),
  sniffImage: vi.fn(),
}));
const notify = vi.hoisted(() => ({ notifyBugReported: vi.fn() }));
vi.mock('./notify', () => notify);

const server = await import('./server');

const ID = '20000000-0000-4000-8000-000000000001';
const upload = { fileName: 'a.png', mimeType: 'image/png' as const, sizeBytes: 1 };

function signInAs(role: Role, accessStatus: AccessStatus = 'approved') {
  const user: AppUser = { ...fixtureUsers[0]!, role, disabledAt: null, accessStatus };
  auth.requireUser.mockResolvedValue(user);
}

const reporterActions = () => [
  server.createBugReport({ title: 'x', description: 'y' }),
  server.createBugImageUpload(ID, upload),
  server.finalizeBugImage('pending'),
];
const triageActions = () => [
  server.updateBugReport(ID, { status: 'fixed' }),
  server.deleteBugReport(ID),
  server.deleteBugImage(ID),
];

beforeEach(() => {
  auth.requireUser.mockReset();
  notify.notifyBugReported.mockReset();
});

describe('signed out', () => {
  beforeEach(() => {
    auth.requireUser.mockRejectedValue(new ActionError('UNAUTHENTICATED', 'Sign in.'));
  });

  test('actions return UNAUTHENTICATED', async () => {
    for (const result of await Promise.all([...reporterActions(), ...triageActions()])) {
      expect(result).toMatchObject({ ok: false, error: { code: 'UNAUTHENTICATED' } });
    }
  });

  test('read helpers throw', async () => {
    await expect(server.listMyBugReports()).rejects.toThrow('Sign in.');
    await expect(server.getBugReport(ID)).rejects.toThrow('Sign in.');
    await expect(server.listBugReports()).rejects.toThrow('Sign in.');
    await expect(server.listOpenBugReports(5)).rejects.toThrow('Sign in.');
  });
});

describe.each(['pending', 'rejected'] as const)('a %s user', (status) => {
  beforeEach(() => signInAs('admin', status));

  test('gets FORBIDDEN from every action', async () => {
    for (const result of await Promise.all([...reporterActions(), ...triageActions()])) {
      expect(result).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
    }
  });
});

describe.each(['member', 'contributor', 'music_leader'] as const)('a %s', (role) => {
  beforeEach(() => signInAs(role));

  test('cannot triage', async () => {
    for (const result of await Promise.all(triageActions())) {
      expect(result).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
    }
    await expect(server.listBugReports()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(server.listOpenBugReports(5)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  test('gets VALIDATION before any DB work', async () => {
    const results = await Promise.all([
      server.createBugReport({ title: '', description: 'y' }),
      server.createBugReport({ title: 'x', description: 'y', pagePath: 'https://evil.example' }),
      server.createBugImageUpload('not-a-uuid', upload),
      server.createBugImageUpload(ID, { ...upload, mimeType: 'image/svg+xml' as 'image/png' }),
      server.createBugImageUpload(ID, { ...upload, sizeBytes: 10 * 1024 * 1024 + 1 }),
    ]);
    for (const result of results) {
      expect(result).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
    }
    expect(notify.notifyBugReported).not.toHaveBeenCalled();
  });

  test('an unknown or forged pending id is NOT_FOUND', async () => {
    expect(await server.finalizeBugImage('forged')).toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND' },
    });
  });

  test('getBugReport returns null for a malformed id', async () => {
    expect(await server.getBugReport('nope')).toBeNull();
  });
});

describe('an admin', () => {
  beforeEach(() => signInAs('admin'));

  test('gets VALIDATION for bad triage input', async () => {
    const results = await Promise.all([
      server.updateBugReport(ID, { adminNote: 'x'.repeat(2_001) }),
      server.updateBugReport(ID, { status: 'done' as 'new' }),
      server.updateBugReport('nope', { status: 'fixed' }),
      server.deleteBugReport('nope'),
    ]);
    for (const result of results) {
      expect(result).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
    }
  });
});
