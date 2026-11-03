// @vitest-environment node
// Guard paths of setSongKeys (auth, permission, validation). The database work is
// covered by keys.int.test.ts.
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const requireUser = vi.fn();
vi.mock('@/lib/auth', () => ({ requireUser }));
const withTx = vi.fn();
vi.mock('@/lib/db', () => ({ withTx, getDb: vi.fn() }));
const recordAudit = vi.fn();
vi.mock('@/lib/audit', () => ({ recordAudit }));

const { ActionError, setSentryCapture } = await import('@/lib/action');
const { SONG_IDS, users } = await import('@/fixtures');
const { setSongKeys } = await import('./keys');

const byRole = (role: string) =>
  users.find((u) => u.role === role && u.accessStatus === 'approved')!;
const SONG_ID = SONG_IDS.thousandHallelujahs;
const capture = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  setSentryCapture(capture);
  requireUser.mockResolvedValue(byRole('contributor'));
  withTx.mockResolvedValue([]);
});

describe('setSongKeys guards', () => {
  it('passes through UNAUTHENTICATED from requireUser', async () => {
    requireUser.mockRejectedValue(new ActionError('UNAUTHENTICATED', 'Sign in.'));
    const res = await setSongKeys(SONG_ID, [{ key: 'G', isPrimary: true, firstChords: {} }]);
    expect(res).toEqual({ ok: false, error: { code: 'UNAUTHENTICATED', message: 'Sign in.' } });
    expect(withTx).not.toHaveBeenCalled();
  });

  it('returns FORBIDDEN for members', async () => {
    requireUser.mockResolvedValue(byRole('member'));
    const res = await setSongKeys(SONG_ID, [{ key: 'G', isPrimary: true, firstChords: {} }]);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('FORBIDDEN');
    expect(capture).not.toHaveBeenCalled();
    expect(withTx).not.toHaveBeenCalled();
  });

  it.each([
    ['no keys', []],
    ['no primary', [{ key: 'G', isPrimary: false, firstChords: {} }]],
    [
      'two primaries',
      [
        { key: 'G', isPrimary: true, firstChords: {} },
        { key: 'A', isPrimary: true, firstChords: {} },
      ],
    ],
    [
      'a duplicate key',
      [
        { key: 'G', isPrimary: true, firstChords: {} },
        { key: 'G', isPrimary: false, firstChords: {} },
      ],
    ],
    ['an invalid key', [{ key: 'H', isPrimary: true, firstChords: {} }]],
    ['an invalid chord', [{ key: 'G', isPrimary: true, firstChords: { verse: 'not a chord!' } }]],
  ])('rejects %s with VALIDATION', async (_label, keys) => {
    const res = await setSongKeys(SONG_ID, keys);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('VALIDATION');
    expect(withTx).not.toHaveBeenCalled();
  });

  it('rejects a malformed song id with VALIDATION', async () => {
    const res = await setSongKeys('not-a-uuid', [{ key: 'G', isPrimary: true, firstChords: {} }]);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('VALIDATION');
    expect(withTx).not.toHaveBeenCalled();
  });

  it('runs the save in one transaction and returns its keys', async () => {
    const saved = [
      {
        id: '30000000-0000-4000-8000-000000000001',
        songId: SONG_ID,
        key: 'G',
        isPrimary: true,
        firstChords: { intro: 'G', verse: null, chorus: null, bridge: null },
      },
    ];
    withTx.mockResolvedValue(saved);
    const res = await setSongKeys(SONG_ID, [
      { key: 'G', isPrimary: true, firstChords: { intro: 'G' } },
    ]);
    expect(res).toEqual({ ok: true, data: saved });
    expect(withTx).toHaveBeenCalledTimes(1);
  });
});

/**
 * A stand-in Drizzle transaction: every builder method chains, and each awaited query
 * resolves to the next entry of `results`, in the order keys.ts runs them.
 */
function fakeTx(results: unknown[][]) {
  // reason: a Proxy stands in for Drizzle's fluent builders, which have no simple type.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'then') {
          return (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
            Promise.resolve(results.shift() ?? []).then(resolve, reject);
        }
        return () => chain;
      },
    },
  );
  return chain;
}

const keyRow = (id: string, key: string, isPrimary: boolean) => ({
  id,
  songId: SONG_ID,
  key,
  isPrimary,
  introChord: null,
  verseChord: null,
  chorusChord: null,
  bridgeChord: null,
});

describe('setSongKeys audit snapshots (CR LIB-19-history-gallery-and-key-audit)', () => {
  const G = keyRow('30000000-0000-4000-8000-000000000001', 'G', true);
  const D = keyRow('30000000-0000-4000-8000-000000000002', 'D', false);

  it('includes songId when a key is created', async () => {
    const tx = fakeTx([
      [{ id: SONG_ID }], // lock the song
      [], // existing keys
      [G], // insert ... returning
      [], // touch songs.updated_at
      [G], // saved keys
    ]);
    withTx.mockImplementation((fn: (t: unknown) => unknown) => fn(tx));
    const res = await setSongKeys(SONG_ID, [{ key: 'G', isPrimary: true, firstChords: {} }]);
    expect(res.ok).toBe(true);
    expect(recordAudit).toHaveBeenCalledTimes(1);
    expect(recordAudit.mock.calls[0]![1]).toMatchObject({
      entity: 'song_key',
      entityId: G.id,
      action: 'create',
      after: { songId: SONG_ID, key: 'G', isPrimary: true },
    });
  });

  it('includes songId when a key is deleted', async () => {
    const tx = fakeTx([
      [{ id: SONG_ID }], // lock the song
      [G, D], // existing keys
      [], // resources attached to the deleted key
      [], // delete D
      [], // touch songs.updated_at
      [G], // saved keys
    ]);
    withTx.mockImplementation((fn: (t: unknown) => unknown) => fn(tx));
    const res = await setSongKeys(SONG_ID, [{ key: 'G', isPrimary: true, firstChords: {} }]);
    expect(res.ok).toBe(true);
    expect(recordAudit).toHaveBeenCalledTimes(1);
    expect(recordAudit.mock.calls[0]![1]).toMatchObject({
      entity: 'song_key',
      entityId: D.id,
      action: 'delete',
      before: { songId: SONG_ID, key: 'D', isPrimary: false },
    });
  });
});
