// @vitest-environment node
// Unit: the guard rails that run before any database or Storage work (auth, permission,
// validation). DB and Storage behaviour is covered by tests/db/backlog.int.test.ts.
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { users as fixtureUsers } from '@/fixtures';
import { ActionError } from '@/lib/action';
import type { AppUser, Role } from '@/types/domain';

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
vi.mock('./storage', () => ({
  createUploadUrl: vi.fn(unexpected),
  decodePendingId: vi.fn(() => null),
  encodePendingId: vi.fn(),
  listRequestObjects: vi.fn(unexpected),
  objectInfo: vi.fn(unexpected),
  PENDING_TTL_MS: 1,
  readObjectHead: vi.fn(unexpected),
  removeObjects: vi.fn(unexpected),
  requestImagePath: vi.fn(),
  signedReadUrls: vi.fn(unexpected),
  sniffImage: vi.fn(),
}));

const server = await import('./server');

const ID = '20000000-0000-4000-8000-000000000001';

function signInAs(role: Role) {
  const user: AppUser = { ...fixtureUsers[0]!, role, disabledAt: null, accessStatus: 'approved' };
  auth.requireUser.mockResolvedValue(user);
}

const everyAction = () => [
  server.listTodos(),
  server.addTodo({ title: 'x' }),
  server.updateTodo(ID, { done: true }),
  server.deleteTodo(ID),
  server.createRequest({ kind: 'change', title: 'x' }),
  server.updateRequest(ID, { status: 'done' }),
  server.deleteRequest(ID),
  server.createRequestImageUpload(ID, { fileName: 'a.png', mimeType: 'image/png', sizeBytes: 1 }),
  server.finalizeRequestImage('pending'),
  server.deleteRequestImage(ID),
];

beforeEach(() => {
  auth.requireUser.mockReset();
});

describe('signed out', () => {
  beforeEach(() => {
    auth.requireUser.mockRejectedValue(new ActionError('UNAUTHENTICATED', 'Sign in.'));
  });

  test('actions return UNAUTHENTICATED', async () => {
    for (const result of await Promise.all(everyAction())) {
      expect(result).toMatchObject({ ok: false, error: { code: 'UNAUTHENTICATED' } });
    }
  });

  test('read helpers throw', async () => {
    await expect(server.listRequests()).rejects.toHaveProperty('code', 'UNAUTHENTICATED');
    await expect(server.getRequest(ID)).rejects.toHaveProperty('code', 'UNAUTHENTICATED');
  });
});

describe.each(['member', 'contributor', 'music_leader'] as const)('%s', (role) => {
  test('is FORBIDDEN everywhere', async () => {
    signInAs(role);
    for (const result of await Promise.all(everyAction())) {
      expect(result).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
    }
    await expect(server.listRequests()).rejects.toHaveProperty('code', 'FORBIDDEN');
    await expect(server.getRequest(ID)).rejects.toHaveProperty('code', 'FORBIDDEN');
  });
});

describe('admin validation (before any I/O)', () => {
  beforeEach(() => signInAs('admin'));

  test('limits and ids', async () => {
    const results = await Promise.all([
      server.addTodo({ title: '' }),
      server.addTodo({ title: 'x', notes: 'n'.repeat(2001) }),
      server.updateTodo('nope', { done: true }),
      server.createRequest({ kind: 'change', title: 't'.repeat(201) }),
      server.createRequest({ kind: 'change', title: 't', description: 'd'.repeat(10_001) }),
      server.updateRequest(ID, { status: 'closed' as 'done' }),
      server.createRequestImageUpload(ID, {
        fileName: 'a.svg',
        mimeType: 'image/svg+xml' as 'image/png',
        sizeBytes: 1,
      }),
      server.createRequestImageUpload(ID, {
        fileName: 'a.png',
        mimeType: 'image/png',
        sizeBytes: 10 * 1024 * 1024 + 1,
      }),
      server.deleteRequestImage('nope'),
    ]);
    for (const result of results) {
      expect(result).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
    }
  });

  test('an unreadable pending id is NOT_FOUND', async () => {
    expect(await server.finalizeRequestImage('garbage')).toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND' },
    });
  });

  test('getRequest returns null for a malformed id', async () => {
    expect(await server.getRequest('not-a-uuid')).toBeNull();
  });
});
