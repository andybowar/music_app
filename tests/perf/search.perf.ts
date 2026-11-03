/**
 * Search performance benchmark (SRCH-11; REQ-SRCH-07: p95 search latency < 300 ms server-side
 * at 5,000 songs).
 *
 *   until mkdir /tmp/music-app-db.lock 2>/dev/null; do sleep 5; done
 *   pnpm exec tsx tests/perf/search.perf.ts [--songs 5000] [--iterations 15]
 *   rmdir /tmp/music-app-db.lock
 *
 * Needs the local Supabase stack with migrations applied (`pnpm db:start && pnpm db:migrate`;
 * the DB-04 seed is optional). DATABASE_URL comes from the environment or `.env.local`, and must
 * point at localhost (the seed's guard). Hold the shared-DB lock (AGENTS.md §8) while it runs:
 * the synthetic songs are committed for the duration of the run so the planner sees real,
 * vacuumed and analyzed tables, and other suites mustn't see them.
 *
 * What it does:
 * 1. Removes synthetic rows a crashed earlier run may have left (`removeSyntheticLibrary`).
 * 2. Loads `--songs` synthetic songs (`./synthetic-seed.ts`) on top of whatever is there,
 *    then `vacuum analyze`s the search tables.
 * 3. Runs each of the 20 representative queries below `WARMUP` times, then `--iterations` times
 *    measured, round-robin so noise spreads evenly. Each measurement is the server-side work of
 *    `searchSongs` (features/search/server/search.ts) after auth: normalize params, the search
 *    statement, the page-past-end total, the fuzzy fallback (SRCH-03) and the row mapping.
 *    Auth (`requireUser`) needs a request, so `runSearch` below repeats `searchSongs`' body
 *    with search.ts's own `normalizeSearchParams` and `rowToSummary`.
 *
 * The app's server modules start with `import 'server-only'`, which throws outside a React
 * server bundle. Running under `--conditions=react-server` would fix that but breaks
 * next/navigation (imported via lib/action), so instead the `server-only` module is stubbed in
 * the require cache and the server modules are imported dynamically after that.
 * 4. Prints per-query and overall p50 / p95 / max, and exits 1 when overall p95 >= 300 ms.
 * 5. Always deletes the synthetic rows again (also on Ctrl-C).
 */
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { parseArgs } from 'node:util';

import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from '@/db/schema';
import { assertLocalTargets } from '@/db/seed/guard';
import type { SearchQueryContext, SearchRow } from '@/features/search/server/query';
import type { SearchParams, SearchResult } from '@/types/domain';

import {
  generateSyntheticLibrary,
  loadSyntheticLibrary,
  removeSyntheticLibrary,
  type LoadedLibrary,
} from './synthetic-seed';

// See the header: stub `server-only`, then load the server modules.
const require = createRequire(import.meta.url);
require.cache[require.resolve('server-only')] = {
  exports: {},
  loaded: true,
} as unknown as NodeJS.Module; // reason: a bare stub is all `import 'server-only'` needs
const { fuzzyFallback } = await import('@/features/search/server/fuzzy');
const { buildSearchQuery, DEFAULT_PAGE_SIZE } = await import('@/features/search/server/query');
const { normalizeSearchParams, rowToSummary } = await import('@/features/search/server/search');

/** REQ-SRCH-07 budget. */
const P95_BUDGET_MS = 300;
const WARMUP = 3;
const ANALYZE = sql`vacuum analyze songs, song_keys, song_composers, song_themes, resources,
  branch_usage, composers, theme_synonyms`;

type Db = ReturnType<typeof drizzle<typeof schema>>;

interface BenchQuery {
  name: string;
  params: SearchParams;
  /** Sort by branch use needs the caller's branch. */
  userBranch?: boolean;
}

/** 20 representative searches: text in every field, typos, filters, sorts and paging. */
function benchQueries(branchCode: string): BenchQuery[] {
  return [
    { name: 'default view (no params)', params: {} },
    { name: 'one word', params: { q: 'glory' } },
    { name: 'two words', params: { q: 'morning light' } },
    { name: 'quoted phrase', params: { q: '"open heaven"' } },
    { name: 'or + exclusion', params: { q: 'river or fountain -fire' } },
    { name: 'lyrics only', params: { q: 'anchor soul', fields: ['lyrics'] } },
    { name: 'composer only', params: { q: 'Hartwell', fields: ['composer'] } },
    { name: 'themes only', params: { q: 'grace', fields: ['themes'] } },
    { name: 'theme synonym', params: { q: 'majestic' } },
    { name: 'typo (fuzzy fallback)', params: { q: 'halleluyah' } },
    { name: 'no match (fuzzy, empty)', params: { q: 'zzqxv' } },
    { name: 'energy filter', params: { energy: ['high_praise', 'mid_worship'] } },
    { name: 'key filter (any key)', params: { key: ['D', 'G'] } },
    { name: 'decade filter', params: { decade: [1990, 2000] } },
    { name: 'branch + usage', params: { branch: branchCode, usage: ['high'] } },
    { name: 'first chords', params: { chordChorus: ['G'], chordVerse: ['D', 'Em'] } },
    { name: 'alpha sort, page 3', params: { sort: 'alpha', page: 3 } },
    { name: 'key sort desc, 100/page', params: { sort: 'key', dir: 'desc', pageSize: 100 } },
    { name: 'branch-use sort', params: { sort: 'branch_use' }, userBranch: true },
    {
      name: 'text + filters + sort',
      params: {
        q: 'grace',
        energy: ['high_worship', 'mid_worship', 'deep_worship'],
        decade: [1990, 2000, 2010],
        sort: 'energy',
        pageSize: 100,
      },
    },
  ];
}

/** `searchSongs` after `requireUser` / `assertCan` (search.ts), against `db`. */
async function runSearch(
  db: Db,
  params: SearchParams,
  ctx: SearchQueryContext,
): Promise<SearchResult> {
  const p = normalizeSearchParams(params);
  let rows = [...(await db.execute<SearchRow>(buildSearchQuery(p, ctx)))];
  let total = rows.length > 0 ? Number(rows[0]!.total) : 0;
  if (rows.length === 0 && (p.page ?? 1) > 1) {
    const first = [
      ...(await db.execute<SearchRow>(buildSearchQuery({ ...p, page: 1, pageSize: 1 }, ctx))),
    ];
    total = first.length > 0 ? Number(first[0]!.total) : 0;
  }
  const fuzzy = await fuzzyFallback(db, p, ctx, rows, total);
  if (fuzzy) ({ rows, total } = fuzzy);
  return {
    items: rows.map(rowToSummary),
    total,
    page: p.page ?? 1,
    pageSize: p.pageSize ?? DEFAULT_PAGE_SIZE,
    ...(fuzzy?.didYouMean !== undefined && { didYouMean: fuzzy.didYouMean }),
  };
}

/** Nearest-rank percentile of `values` (0 < p <= 100). */
function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length, Math.max(1, Math.ceil((p / 100) * sorted.length))) - 1]!;
}

const fmt = (ms: number) => ms.toFixed(1).padStart(7);

async function main() {
  const { values: args } = parseArgs({
    options: {
      songs: { type: 'string', default: '5000' },
      iterations: { type: 'string', default: '15' },
    },
  });
  const songCount = Number(args.songs);
  const iterations = Number(args.iterations);

  if (!process.env.DATABASE_URL && existsSync('.env.local')) process.loadEnvFile('.env.local');
  const databaseUrl = process.env.DATABASE_URL;
  assertLocalTargets({ DATABASE_URL: databaseUrl }, false);

  const client = postgres(databaseUrl!, { max: 1, onnotice: () => {} });
  const db = drizzle(client, { schema });
  let loaded: LoadedLibrary | undefined;
  let cleaned = false;
  const cleanup = async () => {
    if (cleaned) return;
    cleaned = true;
    const n = await removeSyntheticLibrary(db, loaded);
    await db.execute(ANALYZE);
    console.log(`\ncleanup: removed ${n} synthetic songs`);
  };
  process.once('SIGINT', () => {
    void cleanup().finally(() => process.exit(130));
  });

  try {
    const stale = await removeSyntheticLibrary(db);
    if (stale > 0) console.log(`removed ${stale} synthetic songs left by an earlier run`);

    const branches = await db
      .select({ id: schema.branches.id, code: schema.branches.code })
      .from(schema.branches);
    const themes = await db.select({ id: schema.themes.id }).from(schema.themes);
    if (branches.length === 0 || themes.length === 0) {
      throw new Error('No branches or themes: run `pnpm db:seed` first.');
    }

    const t0 = performance.now();
    const lib = generateSyntheticLibrary({
      count: songCount,
      branchIds: branches.map((b) => b.id),
      themeIds: themes.map((t) => t.id),
    });
    loaded = await loadSyntheticLibrary(db, lib);
    await db.execute(ANALYZE);
    const [counts] = await db.execute<{
      songs: number;
      live: number;
      resources: number;
      keys: number;
    }>(sql`
      select (select count(*)::int from songs) as songs,
             (select count(*)::int from songs where songs.deleted_at is null) as live,
             (select count(*)::int from resources) as resources,
             (select count(*)::int from song_keys) as keys`);
    console.log(
      `loaded ${songCount} synthetic songs (+${loaded.addedSynonyms.length} theme synonyms) in ` +
        `${((performance.now() - t0) / 1000).toFixed(1)} s; library now ${counts!.songs} songs ` +
        `(${counts!.live} live), ${counts!.keys} keys, ${counts!.resources} resources`,
    );

    const queries = benchQueries(branches[0]!.code);
    const ctxFor = (q: BenchQuery): SearchQueryContext =>
      q.userBranch ? { userBranchId: branches[0]!.id } : {};
    const samples = queries.map(() => [] as number[]);
    const totals = queries.map(() => 0);
    const didYouMean = queries.map(() => undefined as string | undefined);

    for (let round = 0; round < WARMUP + iterations; round++) {
      for (const [i, q] of queries.entries()) {
        const start = performance.now();
        const result = await runSearch(db, q.params, ctxFor(q));
        const ms = performance.now() - start;
        if (round >= WARMUP) samples[i]!.push(ms);
        totals[i] = result.total;
        didYouMean[i] = result.didYouMean;
      }
    }

    const all = samples.flat();
    console.log(
      `\n${queries.length} queries x ${iterations} runs (after ${WARMUP} warm-up), ms:\n`,
    );
    console.log(`${'query'.padEnd(28)} ${'total'.padStart(6)}     p50     p95     max`);
    for (const [i, q] of queries.entries()) {
      const s = samples[i]!;
      const note = didYouMean[i] ? `  (did you mean "${didYouMean[i]}")` : '';
      console.log(
        `${q.name.padEnd(28)} ${String(totals[i]).padStart(6)} ${fmt(percentile(s, 50))} ${fmt(percentile(s, 95))} ${fmt(Math.max(...s))}${note}`,
      );
    }
    const p50 = percentile(all, 50);
    const p95 = percentile(all, 95);
    console.log(
      `\noverall (${all.length} samples): p50 ${p50.toFixed(1)} ms, p95 ${p95.toFixed(1)} ms, ` +
        `p99 ${percentile(all, 99).toFixed(1)} ms, max ${Math.max(...all).toFixed(1)} ms`,
    );
    const pass = p95 < P95_BUDGET_MS;
    console.log(`REQ-SRCH-07 (p95 < ${P95_BUDGET_MS} ms): ${pass ? 'PASS' : 'FAIL'}`);
    process.exitCode = pass ? 0 : 1;
  } finally {
    await cleanup();
    await client.end();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
