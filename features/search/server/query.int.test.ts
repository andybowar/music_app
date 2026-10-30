// @vitest-environment node
// Integration (SRCH-01): buildSearchQuery against the DB-04 seed. Needs local Supabase with
// migrations applied (`pnpm db:start && pnpm db:migrate`); the suite (re)runs the idempotent
// seed itself, so fixture songs are in their fixture state. CI exports the stack's env;
// locally it comes from .env.local, which Vitest doesn't load on its own.
import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';

import { SONG_IDS, BRANCH_IDS, songs as fixtureSongs, toSummary } from '@/fixtures';
import { ENERGY_LEVELS, USAGE_LEVELS } from '@/types/domain';
import type { SearchParams, SongDetail, UsageLevel } from '@/types/domain';

import type { SearchQueryContext, SearchRow } from './query';

vi.mock('server-only', () => ({}));

if (!process.env.DATABASE_URL && existsSync('.env.local')) process.loadEnvFile('.env.local');

const { sql } = await import('drizzle-orm');
const { getDb } = await import('@/lib/db');
const { buildSearchQuery } = await import('./query');
const { seed } = await import('@/db/seed/seed');

const fixtureIds = new Set(fixtureSongs.map((s) => s.id));
const tag = randomUUID().slice(0, 8);
const deletedSongId = randomUUID();

/** All rows for `params` (unfiltered), as returned by the database. */
async function runAll(params: SearchParams, ctx?: SearchQueryContext): Promise<SearchRow[]> {
  return [...(await getDb().execute<SearchRow>(buildSearchQuery(params, ctx)))];
}

/** Ids of seeded songs matching `params`, in result order (rows other tests add are ignored). */
async function ids(params: SearchParams, ctx?: SearchQueryContext): Promise<string[]> {
  const rows = await runAll({ pageSize: 100, ...params }, ctx);
  return rows.map((r) => r.id).filter((id) => fixtureIds.has(id));
}

const alphaKey = (s: SongDetail) =>
  s.title
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
const byAlpha = (a: SongDetail, b: SongDetail) =>
  alphaKey(a) < alphaKey(b) ? -1 : alphaKey(a) > alphaKey(b) ? 1 : 0;
const primaryKey = (s: SongDetail) => s.keys.find((k) => k.isPrimary) ?? null;
const usageAt = (s: SongDetail, branchId: string): UsageLevel =>
  s.usage.find((u) => u.branchId === branchId)?.level ?? 'none';

/** Fixture ids matching `pred` (any order). */
const where = (pred: (s: SongDetail) => boolean) =>
  fixtureSongs
    .filter(pred)
    .map((s) => s.id)
    .sort();

beforeAll(async () => {
  await seed({
    databaseUrl: process.env.DATABASE_URL,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  });
  // A soft-deleted song that would otherwise match everything below.
  await getDb().execute(
    sql`insert into songs (id, title, year, energy_level, created_at, deleted_at)
        values (${deletedSongId}, ${`Redemption deleted ${tag}`}, 1990, 'high_praise',
                now() + interval '1 day', now())`,
  );
});

afterAll(async () => {
  await getDb().execute(sql`delete from songs where id = ${deletedSongId}`);
  await getDb().$client.end();
});

describe('default view (REQ-SRCH-01)', () => {
  test('all songs, newest first then title', async () => {
    const expected = [...fixtureSongs]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || byAlpha(a, b))
      .map((s) => s.id);
    expect(await ids({})).toEqual(expected);
  });

  test('rows carry SongSummary fields matching the fixtures, plus total', async () => {
    const rows = (await runAll({ pageSize: 100 })).filter((r) => fixtureIds.has(r.id));
    expect(rows).toHaveLength(fixtureSongs.length);
    for (const row of rows) {
      const summary = toSummary(fixtureSongs.find((s) => s.id === row.id)!);
      const { total, rank, ...rest } = row;
      expect(rest).toEqual({ ...summary, createdAt: new Date(summary.createdAt).toISOString() });
      expect(total).toBeGreaterThanOrEqual(fixtureSongs.length);
      expect(rank).toBe(0);
    }
  });

  test('excludes soft-deleted songs', async () => {
    const all = await runAll({ pageSize: 100 });
    expect(all.map((r) => r.id)).not.toContain(deletedSongId);
    const text = await runAll({ q: 'redemption', fields: ['title'] });
    expect(text.map((r) => r.id)).not.toContain(deletedSongId);
  });
});

describe('free text (REQ-SRCH-02)', () => {
  test('"redemption" in themes finds 1000 Hallelujahs; in title does not', async () => {
    expect(await ids({ q: 'redemption', fields: ['themes'] })).toContain(
      SONG_IDS.thousandHallelujahs,
    );
    expect(await ids({ q: 'redemption', fields: ['title'] })).not.toContain(
      SONG_IDS.thousandHallelujahs,
    );
    expect((await ids({ q: 'redemption', fields: ['themes'] })).sort()).toEqual(
      where((s) => s.themes.some((t) => t.theme.name === 'redemption')),
    );
  });

  test('title searches alternate titles', async () => {
    expect(await ids({ q: '1000 hallelujahs', fields: ['title'] })).toEqual([
      SONG_IDS.thousandHallelujahs,
    ]);
    expect(await ids({ q: 'chains', fields: ['title'] })).toEqual([SONG_IDS.amazingGrace]);
  });

  test('composer field matches composer names only', async () => {
    expect(await ids({ q: 'Redman', fields: ['composer'] })).toEqual([SONG_IDS.tenThousandReasons]);
    expect(await ids({ q: 'Redman', fields: ['title', 'themes', 'lyrics'] })).toEqual([]);
  });

  test('lyrics field searches lyric sections', async () => {
    expect(await ids({ q: 'rocks cry out', fields: ['lyrics'] })).toEqual([
      SONG_IDS.thousandHallelujahs,
    ]);
    // "rocks cry out" is also a theme of the same song; title-only finds nothing.
    expect(await ids({ q: 'rocks cry out', fields: ['title'] })).toEqual([]);
  });

  test('all fields by default; accents are ignored', async () => {
    expect(await ids({ q: 'Ágnus' })).toEqual([SONG_IDS.agnusDei]);
    expect(await ids({ q: 'redman' })).toEqual([SONG_IDS.tenThousandReasons]);
  });

  test('websearch syntax: quoted phrases and exclusion', async () => {
    expect(await ids({ q: '"holy spirit"', fields: ['title'] })).toEqual([SONG_IDS.holySpirit]);
    const lamb = await ids({ q: 'lamb', fields: ['themes'] });
    const lambNotWorthy = await ids({ q: 'lamb -worthy', fields: ['themes'] });
    expect(lamb.length).toBeGreaterThan(lambNotWorthy.length);
    expect(lambNotWorthy).toEqual([SONG_IDS.thousandHallelujahs]);
  });

  test('relevance ordering when q is set and sort is not: title hits outrank theme hits', async () => {
    // "holy spirit" is the title of one song and a theme of another.
    const rows = (await runAll({ q: 'holy spirit' })).filter((r) => fixtureIds.has(r.id));
    expect(rows.map((r) => r.id)).toEqual([SONG_IDS.holySpirit, SONG_IDS.reviveThisLand]);
    expect(Number(rows[0]!.rank)).toBeGreaterThan(Number(rows[1]!.rank));
  });

  test('an explicit sort overrides relevance', async () => {
    expect(await ids({ q: 'holy spirit', sort: 'alpha' })).toEqual([
      SONG_IDS.holySpirit,
      SONG_IDS.reviveThisLand,
    ]);
    expect(await ids({ q: 'holy spirit', sort: 'alpha', dir: 'desc' })).toEqual([
      SONG_IDS.reviveThisLand,
      SONG_IDS.holySpirit,
    ]);
  });

  test('blank q is the default view', async () => {
    expect(await ids({ q: '   ' })).toEqual(await ids({}));
  });
});

describe('filters (REQ-SRCH-03)', () => {
  test('energy', async () => {
    const energy = ['high_praise', 'deep_worship'] as const;
    expect((await ids({ energy: [...energy] })).sort()).toEqual(
      where((s) => s.energyLevel !== null && (energy as readonly string[]).includes(s.energyLevel)),
    );
  });

  test('key matches any song_keys row, not only the primary', async () => {
    expect((await ids({ key: ['Db'] })).sort()).toEqual([SONG_IDS.thousandHallelujahs]);
    expect((await ids({ key: ['D', 'Am'] })).sort()).toEqual(
      where((s) => s.keys.some((k) => k.key === 'D' || k.key === 'Am')),
    );
  });

  test('decade', async () => {
    expect((await ids({ decade: [1990] })).sort()).toEqual(
      where((s) => s.year !== null && s.year >= 1990 && s.year <= 1999),
    );
    expect((await ids({ decade: [1970, 2020] })).sort()).toEqual(
      [SONG_IDS.beExaltedOGod, SONG_IDS.thousandHallelujahs].sort(),
    );
  });

  test('branch defaults to high/low/rare usage', async () => {
    expect((await ids({ branch: 'RF' })).sort()).toEqual(
      where((s) => usageAt(s, BRANCH_IDS.rockford) !== 'none'),
    );
  });

  test('branch + usage, including none', async () => {
    expect((await ids({ branch: 'OR', usage: ['high'] })).sort()).toEqual(
      where((s) => usageAt(s, BRANCH_IDS.portland) === 'high'),
    );
    expect((await ids({ branch: 'SV', usage: ['none'] })).sort()).toEqual(
      where((s) => usageAt(s, BRANCH_IDS.servant) === 'none'),
    );
  });

  test('unknown branch matches nothing (unless usage includes none)', async () => {
    expect(await ids({ branch: 'ZZ' })).toEqual([]);
    expect((await ids({ branch: 'ZZ', usage: ['none'] })).length).toBe(fixtureSongs.length);
  });

  test('first chords of the primary key', async () => {
    expect((await ids({ chordChorus: ['A'] })).sort()).toEqual(
      where((s) => primaryKey(s)?.firstChords.chorus === 'A'),
    );
    expect((await ids({ chordVerse: ['E', 'G'] })).sort()).toEqual(
      where((s) => ['E', 'G'].includes(primaryKey(s)?.firstChords.verse ?? '')),
    );
    expect((await ids({ chordBridge: ['Em', 'Gm'] })).sort()).toEqual(
      [SONG_IDS.amazingGrace, SONG_IDS.holySpirit].sort(),
    );
    // Gb is the chorus chord of a non-primary key (1000 Hallelujahs in Db): no match.
    expect(await ids({ chordChorus: ['Gb'] })).toEqual([]);
  });

  test('filters combine with AND', async () => {
    const params: SearchParams = {
      energy: ['high_worship', 'mid_worship'],
      key: ['E'],
      branch: 'SV',
      usage: ['high'],
    };
    expect((await ids(params)).sort()).toEqual(
      where(
        (s) =>
          (s.energyLevel === 'high_worship' || s.energyLevel === 'mid_worship') &&
          s.keys.some((k) => k.key === 'E') &&
          usageAt(s, BRANCH_IDS.servant) === 'high',
      ),
    );
    expect((await ids(params)).sort()).toEqual(
      [SONG_IDS.thousandHallelujahs, SONG_IDS.tenThousandReasons].sort(),
    );
  });

  test('text and filters combine', async () => {
    expect(
      await ids({ q: 'praise', fields: ['themes'], decade: [1980], chordVerse: ['D'] }),
    ).toEqual([SONG_IDS.causeToCelebrate]);
    expect(
      await ids({ q: 'redemption', fields: ['themes'], energy: ['deep_worship'], key: ['Am'] }),
    ).toEqual([SONG_IDS.atTheCross]);
  });
});

describe('sorts (REQ-SRCH-04)', () => {
  test('date ascending', async () => {
    const expected = [...fixtureSongs]
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || byAlpha(a, b))
      .map((s) => s.id);
    expect(await ids({ sort: 'date', dir: 'asc' })).toEqual(expected);
  });

  test('alpha: unaccented, case-insensitive, both directions', async () => {
    const asc = [...fixtureSongs].sort(byAlpha).map((s) => s.id);
    expect(await ids({ sort: 'alpha' })).toEqual(asc);
    expect(await ids({ sort: 'alpha', dir: 'desc' })).toEqual([...asc].reverse());
  });

  test('key: primary key alphabetical, then title', async () => {
    const expected = [...fixtureSongs]
      .sort((a, b) => {
        const ka = primaryKey(a)!.key;
        const kb = primaryKey(b)!.key;
        return ka < kb ? -1 : ka > kb ? 1 : byAlpha(a, b);
      })
      .map((s) => s.id);
    expect(await ids({ sort: 'key' })).toEqual(expected);
  });

  test('energy: ENERGY_LEVELS order, null last in both directions', async () => {
    const rank = (s: SongDetail) => (s.energyLevel ? ENERGY_LEVELS.indexOf(s.energyLevel) : null);
    const cmp = (sign: 1 | -1) => (a: SongDetail, b: SongDetail) => {
      const ra = rank(a);
      const rb = rank(b);
      if (ra === null || rb === null) return ra === rb ? byAlpha(a, b) : ra === null ? 1 : -1;
      return (ra - rb) * sign || byAlpha(a, b);
    };
    expect(await ids({ sort: 'energy' })).toEqual([...fixtureSongs].sort(cmp(1)).map((s) => s.id));
    const desc = await ids({ sort: 'energy', dir: 'desc' });
    expect(desc).toEqual([...fixtureSongs].sort(cmp(-1)).map((s) => s.id));
    expect(desc.at(-1)).toBe(SONG_IDS.beExaltedOGod);
  });

  const byUsage = (branchId: string) => (a: SongDetail, b: SongDetail) =>
    USAGE_LEVELS.indexOf(usageAt(a, branchId)) - USAGE_LEVELS.indexOf(usageAt(b, branchId)) ||
    byAlpha(a, b);

  test('branch_use: the selected branch', async () => {
    const expected = fixtureSongs
      .filter((s) => usageAt(s, BRANCH_IDS.coSprings) !== 'none')
      .sort(byUsage(BRANCH_IDS.coSprings))
      .map((s) => s.id);
    expect(await ids({ sort: 'branch_use', branch: 'CO' })).toEqual(expected);
  });

  test("branch_use: else the current user's branch", async () => {
    const expected = [...fixtureSongs].sort(byUsage(BRANCH_IDS.rockford)).map((s) => s.id);
    expect(await ids({ sort: 'branch_use' }, { userBranchId: BRANCH_IDS.rockford })).toEqual(
      expected,
    );
  });

  test('branch_use with no branch at all falls back to title', async () => {
    expect(await ids({ sort: 'branch_use' })).toEqual(
      [...fixtureSongs].sort(byAlpha).map((s) => s.id),
    );
  });
});

describe('pagination', () => {
  test('pages slice the full order; total is the full match count', async () => {
    const all = await runAll({ pageSize: 100 });
    const p1 = await runAll({ pageSize: 5 });
    const p2 = await runAll({ pageSize: 5, page: 2 });
    expect(p1.map((r) => r.id)).toEqual(all.slice(0, 5).map((r) => r.id));
    expect(p2.map((r) => r.id)).toEqual(all.slice(5, 10).map((r) => r.id));
    for (const row of [...p1, ...p2]) expect(row.total).toBe(all.length);
  });

  test('filtered total', async () => {
    const rows = await runAll({ energy: ['high_praise'], pageSize: 1 });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.total).toBe(where((s) => s.energyLevel === 'high_praise').length);
  });

  test('pageSize is clamped to 1..100 and defaults to 50', async () => {
    const full = await runAll({ pageSize: 100 });
    expect((await runAll({ pageSize: 0 })).length).toBe(1);
    expect((await runAll({ pageSize: 1000 })).length).toBe(Math.min(full.length, 100));
    expect((await runAll({})).length).toBe(Math.min(full.length, 50));
  });

  test('a page past the end is empty', async () => {
    expect(await runAll({ page: 1000 })).toEqual([]);
  });
});
