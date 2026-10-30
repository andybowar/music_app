// @vitest-environment node
// Guard paths of setSongKeys (auth, permission, validation). The database work is
// covered by keys.int.test.ts.
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const requireUser = vi.fn();
vi.mock('@/lib/auth', () => ({ requireUser }));
const withTx = vi.fn();
vi.mock('@/lib/db', () => ({ withTx, getDb: vi.fn() }));

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

  it('refuses members', async () => {
    requireUser.mockResolvedValue(byRole('member'));
    const res = await setSongKeys(SONG_ID, [{ key: 'G', isPrimary: true, firstChords: {} }]);
    expect(res.ok).toBe(false);
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
