// @vitest-environment node
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import type { AppUser, List } from '@/types/domain';

import type { BranchRow, ListActivityRow, SongActivityRow } from './server';

vi.mock('server-only', () => ({}));

const h = vi.hoisted(() => ({
  user: null as AppUser | null,
  results: [] as unknown[][],
  execute: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  requireUser: async () => {
    if (!h.user) {
      const e = new Error('signed out') as Error & { code: string };
      e.name = 'ActionError';
      e.code = 'UNAUTHENTICATED';
      throw e;
    }
    return h.user;
  },
}));
vi.mock('@/lib/db', () => ({ getDb: () => ({ execute: h.execute }) }));

const {
  assembleActivity,
  branchesQuery,
  DEFAULT_DAYS,
  getBranchActivity,
  recentlyAddedQuery,
  RECENT_LIMIT,
  toList,
  toSummary,
  TOP_LIMIT,
  topSongsQuery,
  upcomingQuery,
  UPCOMING_LIMIT,
} = await import('./server');

const dialect = new PgDialect();
const render = (q: SQL) => dialect.sqlToQuery(q);

const BRANCH_A = '00000000-0000-4000-8000-0000000000a1';
const BRANCH_B = '00000000-0000-4000-8000-0000000000b1';

const member: AppUser = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'member@example.test',
  name: 'Member',
  branchId: BRANCH_A,
  role: 'member',
  authProvider: 'password',
  disabledAt: null,
  accessStatus: 'approved',
};

const branchA: BranchRow = { id: BRANCH_A, name: 'Alpha', code: 'AL', ssoGroup: 'alpha' };
const branchB: BranchRow = { id: BRANCH_B, name: 'Beta', code: 'BE', ssoGroup: null };

function songRow(over: Partial<SongActivityRow> = {}): SongActivityRow {
  return {
    branchId: BRANCH_A,
    id: '00000000-0000-4000-8000-00000000000a',
    title: 'Sample song',
    year: 1999,
    tempoBpm: 72,
    timeSignature: '4/4',
    energyLevel: 'mid_worship',
    primaryKey: 'G',
    composers: [
      { name: 'B Writer', popMember: 'current' },
      { name: 'A Writer', popMember: 'none' },
    ],
    addedByBranchCode: 'AL',
    resourceCount: 3,
    createdAt: '2026-01-02T03:04:05.000Z',
    ...over,
  };
}

function listRow(over: Partial<ListActivityRow> = {}): ListActivityRow {
  return {
    id: '00000000-0000-4000-8000-0000000000c1',
    type: 'setlist',
    name: 'Sunday',
    eventDate: '2026-11-08',
    ownerId: member.id,
    ownerName: 'Member',
    branchId: BRANCH_A,
    branchCode: 'AL',
    itemCount: 4,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-02T00:00:00.000Z',
    ...over,
  };
}

beforeEach(() => {
  h.user = member;
  h.results = [];
  h.execute.mockReset();
  h.execute.mockImplementation(async () => h.results.shift() ?? []);
});

describe('toSummary', () => {
  test('maps a row to SongSummary, keeping composer order and dropping branchId/count', () => {
    const summary = toSummary(songRow({ count: 5, resourceCount: '2' as unknown as number }));
    expect(summary).toEqual({
      id: '00000000-0000-4000-8000-00000000000a',
      title: 'Sample song',
      year: 1999,
      tempoBpm: 72,
      timeSignature: '4/4',
      energyLevel: 'mid_worship',
      primaryKey: 'G',
      composers: [
        { name: 'B Writer', popMember: 'current' },
        { name: 'A Writer', popMember: 'none' },
      ],
      addedByBranchCode: 'AL',
      resourceCount: 2,
      createdAt: '2026-01-02T03:04:05.000Z',
    });
  });

  test('keeps nulls', () => {
    const summary = toSummary(
      songRow({
        year: null,
        tempoBpm: null,
        timeSignature: null,
        energyLevel: null,
        primaryKey: null,
        composers: [],
        addedByBranchCode: null,
      }),
    );
    expect(summary).toMatchObject({
      year: null,
      tempoBpm: null,
      timeSignature: null,
      energyLevel: null,
      primaryKey: null,
      composers: [],
      addedByBranchCode: null,
    });
  });
});

describe('toList', () => {
  test('maps a row to List and coerces itemCount', () => {
    expect(toList(listRow({ itemCount: '7' as unknown as number }))).toEqual({
      id: '00000000-0000-4000-8000-0000000000c1',
      type: 'setlist',
      name: 'Sunday',
      eventDate: '2026-11-08',
      ownerId: member.id,
      ownerName: 'Member',
      branchId: BRANCH_A,
      branchCode: 'AL',
      itemCount: 7,
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-02T00:00:00.000Z',
    });
  });
});

describe('assembleActivity', () => {
  test('one entry per branch in the given order, rows grouped and kept in order', () => {
    const recent = [
      songRow({ id: 'r1', branchId: BRANCH_A }),
      songRow({ id: 'r2', branchId: BRANCH_B }),
      songRow({ id: 'r3', branchId: BRANCH_A }),
    ];
    const upcoming: List[] = [
      toList(listRow({ id: 'l1', branchId: BRANCH_B })),
      toList(listRow({ id: 'l2', branchId: BRANCH_A })),
      toList(listRow({ id: 'l3', branchId: BRANCH_B })),
    ];
    const top = [
      songRow({ id: 't1', branchId: BRANCH_B, count: 4 }),
      songRow({ id: 't2', branchId: BRANCH_B, count: '2' as unknown as number }),
    ];

    const out = assembleActivity([branchB, branchA], recent, upcoming, top);

    expect(out.map((a) => a.branch)).toEqual([
      { id: BRANCH_B, name: 'Beta', code: 'BE', ssoGroup: null },
      { id: BRANCH_A, name: 'Alpha', code: 'AL', ssoGroup: 'alpha' },
    ]);
    const [b, a] = out;
    expect(b!.recentlyAdded.map((s) => s.id)).toEqual(['r2']);
    expect(a!.recentlyAdded.map((s) => s.id)).toEqual(['r1', 'r3']);
    expect(b!.upcoming.map((l) => l.id)).toEqual(['l1', 'l3']);
    expect(a!.upcoming.map((l) => l.id)).toEqual(['l2']);
    expect(b!.topSongs.map((s) => [s.id, s.count])).toEqual([
      ['t1', 4],
      ['t2', 2],
    ]);
    expect(a!.topSongs).toEqual([]);
    expect(b!.topSongs[0]).not.toHaveProperty('branchId');
  });

  test('branches without activity get empty arrays; rows for unknown branches are dropped', () => {
    const out = assembleActivity(
      [branchA],
      [songRow({ branchId: 'nope' })],
      [toList(listRow({ branchId: 'nope' })), { ...toList(listRow()), branchId: null }],
      [songRow({ branchId: 'nope', count: 1 })],
    );
    expect(out).toEqual([
      {
        branch: { id: BRANCH_A, name: 'Alpha', code: 'AL', ssoGroup: 'alpha' },
        recentlyAdded: [],
        upcoming: [],
        topSongs: [],
      },
    ]);
  });

  test('a missing count reads as 0', () => {
    const [a] = assembleActivity([branchA], [], [], [songRow()]);
    expect(a!.topSongs[0]!.count).toBe(0);
  });

  test('no branches → empty result', () => {
    expect(assembleActivity([], [songRow()], [], [])).toEqual([]);
  });
});

describe('queries', () => {
  test('branches are ordered by name', () => {
    expect(render(branchesQuery()).sql).toMatch(/order by b\.name, b\.id/);
  });

  test('recently added binds the window and the per-branch limit', () => {
    const q = render(recentlyAddedQuery(30));
    expect(q.params).toEqual([30, RECENT_LIMIT]);
    expect(q.sql).toMatch(/s\.deleted_at is null/);
    expect(q.sql).toMatch(/make_interval\(days => \$1::int\)/);
    expect(q.sql).toMatch(/partition by s\.added_by_branch_id/);
  });

  test('upcoming only reads live setlists dated today or later', () => {
    const q = render(upcomingQuery());
    expect(q.params).toEqual([UPCOMING_LIMIT]);
    expect(q.sql).toMatch(/l\.type = 'setlist'/);
    expect(q.sql).toMatch(/l\.deleted_at is null/);
    expect(q.sql).toMatch(/l\.event_date >= current_date/);
  });

  test('top songs count distinct live setlists in the past window', () => {
    const q = render(topSongsQuery(14, 3));
    expect(q.params).toEqual([14, 3]);
    expect(q.sql).toMatch(/count\(distinct l\.id\)/);
    expect(q.sql).toMatch(/l\.event_date >= current_date - \$1::int/);
    expect(q.sql).toMatch(/l\.event_date <= current_date/);
    expect(q.sql).toMatch(/s\.deleted_at is null/);
  });

  test('default limits', () => {
    expect(render(topSongsQuery(DEFAULT_DAYS)).params).toEqual([DEFAULT_DAYS, TOP_LIMIT]);
  });
});

describe('getBranchActivity', () => {
  test('rejects a signed-out caller before touching the database', async () => {
    h.user = null;
    await expect(getBranchActivity()).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    expect(h.execute).not.toHaveBeenCalled();
  });

  test('rejects a pending user (no song:read)', async () => {
    h.user = { ...member, accessStatus: 'pending' };
    await expect(getBranchActivity()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(h.execute).not.toHaveBeenCalled();
  });

  test('runs the four queries with the default window and assembles the result', async () => {
    h.results = [
      [branchA, branchB],
      [songRow({ id: 'r1' })],
      [listRow({ id: 'l1', branchId: BRANCH_B, branchCode: 'BE' })],
      [songRow({ id: 't1', count: 3 })],
    ];

    const out = await getBranchActivity();

    expect(h.execute).toHaveBeenCalledTimes(4);
    const params = h.execute.mock.calls.map(([q]) => render(q as SQL).params);
    expect(params).toEqual([
      [],
      [DEFAULT_DAYS, RECENT_LIMIT],
      [UPCOMING_LIMIT],
      [DEFAULT_DAYS, TOP_LIMIT],
    ]);
    expect(out).toHaveLength(2);
    expect(out[0]!.branch.code).toBe('AL');
    expect(out[0]!.recentlyAdded.map((s) => s.id)).toEqual(['r1']);
    expect(out[0]!.topSongs.map((s) => [s.id, s.count])).toEqual([['t1', 3]]);
    expect(out[1]!.upcoming.map((l) => l.id)).toEqual(['l1']);
  });

  test('passes a custom window through', async () => {
    await getBranchActivity({ days: 30 });
    const params = h.execute.mock.calls.map(([q]) => render(q as SQL).params);
    expect(params[1]).toEqual([30, RECENT_LIMIT]);
    expect(params[3]).toEqual([30, TOP_LIMIT]);
  });

  test.each([0, -5, 1.5, Number.NaN, 100_000])(
    'invalid days %s falls back to the default',
    async (days) => {
      await getBranchActivity({ days });
      expect(render(h.execute.mock.calls[1]![0] as SQL).params[0]).toBe(DEFAULT_DAYS);
    },
  );

  test('drops upcoming playlists the caller may not read (defensive)', async () => {
    h.results = [
      [branchA],
      [],
      [
        listRow({ id: 'mine-setlist' }),
        listRow({ id: 'other-playlist', type: 'playlist', ownerId: 'someone-else' }),
      ],
      [],
    ];
    const [a] = await getBranchActivity();
    expect(a!.upcoming.map((l) => l.id)).toEqual(['mine-setlist']);
  });
});
