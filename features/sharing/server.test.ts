// @vitest-environment node
// Unit: input checks, permission paths, token shape and the public read's scrubbing, with a
// fake query builder. Real rows (expiry, revocation, RLS-free reads) are in server.int.test.ts.
import type { AppUser, ListType, Role } from '@/types/domain';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ActionError } from '@/lib/action';

vi.mock('server-only', () => ({}));

const requireUser = vi.fn<() => Promise<AppUser>>();
vi.mock('@/lib/auth', () => ({ requireUser: () => requireUser() }));
vi.mock('@/lib/env', () => ({ env: { APP_URL: 'https://app.example.test/' } }));

/**
 * A fake Drizzle db. Every query chain (`select()…`, `insert()…`, `update()…`) resolves to the
 * next queued result when awaited; the calls made on each chain are recorded.
 */
const queue: unknown[][] = [];
const chains: Array<Array<{ method: string; args: unknown[] }>> = [];
function chain(first: string, args: unknown[]) {
  const calls = [{ method: first, args }];
  chains.push(calls);
  const proxy: object = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === 'then') {
          const result = queue.shift() ?? [];
          return (resolve: (v: unknown) => void) => resolve(result);
        }
        return (...a: unknown[]) => {
          calls.push({ method: String(prop), args: a });
          return proxy;
        };
      },
    },
  );
  return proxy;
}
const fakeDb = {
  select: (...a: unknown[]) => chain('select', a),
  insert: (...a: unknown[]) => chain('insert', a),
  update: (...a: unknown[]) => chain('update', a),
};
const getDb = vi.fn(() => fakeDb);
vi.mock('@/lib/db', () => ({ getDb: () => getDb() }));

const { createShare, getSharedList, listShares, revokeShare } = await import('./server');

const LIST = '11111111-1111-4111-8111-111111111111';
const BRANCH = '22222222-2222-4222-8222-222222222222';
const OTHER_BRANCH = '33333333-3333-4333-8333-333333333333';
const SHARE = '66666666-6666-4666-8666-666666666666';
const SONG = '77777777-7777-4777-8777-777777777777';
const KEY = '88888888-8888-4888-8888-888888888888';
const USER_ID = '44444444-4444-4444-8444-444444444444';
const OTHER_USER = '55555555-5555-4555-8555-555555555555';
const TOKEN = 'A'.repeat(43);

function makeUser(role: Role, branchId: string | null = BRANCH): AppUser {
  return {
    id: USER_ID,
    email: 'x@example.test',
    name: 'Test',
    branchId,
    role,
    authProvider: 'password',
    disabledAt: null,
    accessStatus: 'approved',
  };
}

const listRow = (type: ListType, ownerId: string, branchId: string | null = BRANCH) => ({
  type,
  ownerId,
  branchId,
});

const shareRow = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: SHARE,
  listId: LIST,
  token: TOKEN,
  expiresAt: null,
  revokedAt: null,
  createdAt: new Date('2026-11-01T10:00:00Z'),
  ...overrides,
});

let user: AppUser;

beforeEach(() => {
  queue.length = 0;
  chains.length = 0;
  requireUser.mockReset();
  getDb.mockClear();
  user = makeUser('member');
  requireUser.mockImplementation(async () => user);
});

async function expectValidation(promise: Promise<unknown>, field: string) {
  const result = await promise;
  expect(result).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
  expect((result as { error: { fieldErrors?: object } }).error.fieldErrors).toHaveProperty(field);
}

describe('before the database', () => {
  it('passes requireUser failures through the actions', async () => {
    requireUser.mockRejectedValue(new ActionError('UNAUTHENTICATED', 'Sign in.'));
    for (const call of [
      () => createShare(LIST),
      () => revokeShare(SHARE),
      () => listShares(LIST),
    ]) {
      expect(await call()).toEqual({
        ok: false,
        error: { code: 'UNAUTHENTICATED', message: 'Sign in.' },
      });
    }
    expect(getDb).not.toHaveBeenCalled();
  });

  it('createShare rejects bad ids and expiries', async () => {
    await expectValidation(createShare('nope'), 'listId');
    await expectValidation(createShare(LIST, { expiresAt: 'tomorrow' }), 'expiresAt');
    await expectValidation(createShare(LIST, { expiresAt: '2026-11-03' }), 'expiresAt');
    await expectValidation(
      createShare(LIST, { expiresAt: new Date(Date.now() - 60_000).toISOString() }),
      'expiresAt',
    );
    expect(getDb).not.toHaveBeenCalled();
  });

  it('revokeShare and listShares reject malformed ids', async () => {
    await expectValidation(revokeShare('nope'), '(root)');
    await expectValidation(listShares('nope'), '(root)');
    expect(getDb).not.toHaveBeenCalled();
  });

  it.each([
    ['empty', ''],
    ['too short', 'A'.repeat(42)],
    ['too long', 'A'.repeat(44)],
    ['padded', `${'A'.repeat(42)}=`],
    ['not base64url', `${'A'.repeat(42)}+`],
    ['a path', `../${'A'.repeat(40)}`],
    ['SQL-ish', `' or 1=1 --${'A'.repeat(32)}`],
  ])('getSharedList returns null for a %s token without querying', async (_l, token) => {
    expect(await getSharedList(token)).toBeNull();
    expect(getDb).not.toHaveBeenCalled();
  });

  it('getSharedList tolerates a non-string token', async () => {
    expect(await getSharedList(undefined as never)).toBeNull();
    expect(await getSharedList({} as never)).toBeNull();
    expect(getDb).not.toHaveBeenCalled();
  });

  it('getSharedList never asks for a session', async () => {
    queue.push([]);
    expect(await getSharedList(TOKEN)).toBeNull();
    expect(requireUser).not.toHaveBeenCalled();
  });
});

describe('createShare', () => {
  it('issues a 256-bit base64url token and a link under APP_URL', async () => {
    queue.push([listRow('playlist', USER_ID)], [shareRow()]);
    const result = await createShare(LIST);
    expect(result.ok).toBe(true);
    const insert = chains[1]!;
    expect(insert[0]!.method).toBe('insert');
    const values = insert.find((c) => c.method === 'values')!.args[0] as Record<string, unknown>;
    expect(values).toMatchObject({ listId: LIST, createdBy: USER_ID, expiresAt: null });
    const token = values.token as string;
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(token, 'base64url')).toHaveLength(32);
  });

  it('returns the share with its url, ISO dates and the expiry', async () => {
    const expiresAt = new Date(Date.now() + 86_400_000);
    queue.push([listRow('playlist', USER_ID)]);
    queue.push([shareRow({ expiresAt })]);
    const result = await createShare(LIST, { expiresAt: expiresAt.toISOString() });
    expect(result).toEqual({
      ok: true,
      data: {
        id: SHARE,
        listId: LIST,
        token: TOKEN,
        expiresAt: expiresAt.toISOString(),
        revokedAt: null,
        createdAt: '2026-11-01T10:00:00.000Z',
        url: `https://app.example.test/share/${TOKEN}`,
      },
    });
    const values = chains[1]!.find((c) => c.method === 'values')!.args[0] as { expiresAt: Date };
    expect(values.expiresAt.toISOString()).toBe(expiresAt.toISOString());
  });

  it('never issues the same token twice', async () => {
    const tokens = new Set<string>();
    for (let i = 0; i < 50; i++) {
      queue.push([listRow('playlist', USER_ID)], [shareRow()]);
      await createShare(LIST);
      const values = chains.at(-1)!.find((c) => c.method === 'values')!.args[0] as {
        token: string;
      };
      tokens.add(values.token);
    }
    expect(tokens.size).toBe(50);
  });

  it('a list the caller cannot read (or a missing one) is NOT_FOUND', async () => {
    queue.push([listRow('playlist', OTHER_USER)]);
    expect(await createShare(LIST)).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
    queue.push([]);
    expect(await createShare(LIST)).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
    expect(chains.some((c) => c[0]!.method === 'insert')).toBe(false);
  });

  it("a member cannot share someone else's setlist", async () => {
    queue.push([listRow('setlist', OTHER_USER)]);
    expect(await createShare(LIST)).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
    expect(chains.some((c) => c[0]!.method === 'insert')).toBe(false);
  });

  it("a music leader can share their branch's setlist, not another branch's", async () => {
    user = makeUser('music_leader');
    queue.push([listRow('setlist', OTHER_USER)], [shareRow()]);
    expect((await createShare(LIST)).ok).toBe(true);
    queue.length = 0;
    queue.push([listRow('setlist', OTHER_USER, OTHER_BRANCH)]);
    expect(await createShare(LIST)).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
  });

  it('an unapproved user is refused', async () => {
    user = { ...makeUser('member'), accessStatus: 'pending' };
    queue.push([listRow('playlist', USER_ID)]);
    expect((await createShare(LIST)).ok).toBe(false);
    expect(chains.some((c) => c[0]!.method === 'insert')).toBe(false);
  });
});

describe('revokeShare', () => {
  it('unknown share is NOT_FOUND', async () => {
    queue.push([]);
    expect(await revokeShare(SHARE)).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
  });

  it("refuses a share on someone else's list", async () => {
    queue.push([{ listId: LIST }], [listRow('setlist', OTHER_USER)]);
    expect(await revokeShare(SHARE)).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
    expect(chains.some((c) => c[0]!.method === 'update')).toBe(false);
  });

  it('sets revoked_at for the owner', async () => {
    queue.push([{ listId: LIST }], [listRow('playlist', USER_ID)], []);
    expect(await revokeShare(SHARE)).toEqual({ ok: true, data: undefined });
    expect(chains.at(-1)![0]!.method).toBe('update');
  });
});

describe('listShares', () => {
  it('needs list:write', async () => {
    queue.push([listRow('setlist', OTHER_USER)]);
    expect(await listShares(LIST)).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
  });

  it('maps rows to shares with urls', async () => {
    const revokedAt = new Date('2026-11-02T00:00:00Z');
    queue.push([listRow('playlist', USER_ID)], [shareRow({ revokedAt })]);
    const result = await listShares(LIST);
    expect(result).toMatchObject({
      ok: true,
      data: [
        { id: SHARE, revokedAt: revokedAt.toISOString(), url: expect.stringContaining(TOKEN) },
      ],
    });
  });
});

describe('getSharedList', () => {
  const now = new Date('2026-11-01T00:00:00Z');
  const listHead = {
    id: LIST,
    type: 'setlist' as const,
    name: 'Sunday',
    eventDate: '2026-11-08',
    ownerId: OTHER_USER,
    ownerName: 'Owner',
    branchId: BRANCH,
    branchCode: 'SVB',
    createdAt: now,
    updatedAt: now,
  };
  const item = {
    id: '99999999-9999-4999-8999-999999999999',
    listId: LIST,
    songId: SONG,
    position: 0,
    overrideKey: 'E',
    overrideBpm: 100,
    overrideEnergy: null,
    resourceId: null,
    notes: 'Capo 2',
    createdAt: now,
  };
  const song = {
    id: SONG,
    title: 'Song',
    altTitles: [],
    arrangement: [],
    tempoBpm: 80,
    createdAt: now,
    updatedAt: now,
  };
  const key = {
    id: KEY,
    songId: SONG,
    key: 'E',
    isPrimary: false,
    introChord: null,
    verseChord: null,
    chorusChord: 'A',
    bridgeChord: null,
  };
  const resource = (id: string, extra: Record<string, unknown>) => ({
    id,
    songId: SONG,
    songKeyId: KEY,
    kind: 'chord_chart',
    format: 'pdf',
    label: 'Chart',
    sizeBytes: 10,
    mimeType: 'application/pdf',
    createdAt: now,
    ...extra,
  });

  it('returns the list with overrides and scrubbed resources', async () => {
    queue.push(
      [listHead],
      [item],
      [song],
      [],
      [key],
      // Even if a url/path somehow came back from the query, it must not be returned.
      [
        resource('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', { storagePath: 'songs/x/y/z.pdf' }),
        resource('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', { url: 'https://example.test/secret' }),
      ],
      [{ id: BRANCH, code: 'SVB' }],
    );
    const list = await getSharedList(TOKEN);
    expect(list).toMatchObject({ id: LIST, name: 'Sunday', itemCount: 1, branchCode: 'SVB' });
    const [first] = list!.items;
    expect(first).toMatchObject({
      key: 'E',
      bpm: 100,
      isOverridden: { key: true, bpm: true, energy: false },
      firstChords: { chorus: 'A' },
      item: { notes: 'Capo 2' },
    });
    expect(first!.resources).toHaveLength(2);
    for (const r of first!.resources) {
      expect(r.url).toBeNull();
      expect(r.storagePath).toBeNull();
    }
    const json = JSON.stringify(list);
    expect(json).not.toContain('songs/x/y/z.pdf');
    expect(json).not.toContain('secret');
    expect(json).not.toContain('@');
  });

  it('never selects resource url, storage_path or uploaded_by', async () => {
    queue.push([listHead], [item], [song], [], [key], [], []);
    await getSharedList(TOKEN);
    const resourceSelect = chains.find(
      (c) =>
        c[0]!.method === 'select' &&
        c[0]!.args[0] !== undefined &&
        'mimeType' in (c[0]!.args[0] as object),
    );
    expect(resourceSelect).toBeDefined();
    const columns = Object.keys(resourceSelect![0]!.args[0] as object);
    expect(columns).not.toContain('url');
    expect(columns).not.toContain('storagePath');
    expect(columns).not.toContain('uploadedBy');
  });

  it('an empty list skips the song queries', async () => {
    queue.push([listHead], []);
    const list = await getSharedList(TOKEN);
    expect(list).toMatchObject({ itemCount: 0, items: [] });
    expect(chains).toHaveLength(2);
  });
});
