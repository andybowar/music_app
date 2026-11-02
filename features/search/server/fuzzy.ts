/**
 * Fuzzy title fallback + did-you-mean (SRCH-03; REQ-SRCH-06). Internal to
 * `features/search/server`: `searchSongs` (SRCH-02) calls `fuzzyFallback` after the full-text
 * query.
 *
 * When `q` is set and full-text search finds fewer than `FUZZY_MIN_TOTAL` songs, songs whose
 * title or an alternate title is trigram-similar to `q` (`pg_trgm` similarity >
 * `FUZZY_THRESHOLD`, case-insensitive) are appended after the full-text matches. The same
 * filters apply (energy, key, decade, branch + usage, first chords); the fuzzy part is ordered
 * by similarity, then title, regardless of `sort`. `didYouMean` is the best-matching title (or
 * alternate title) across all fuzzy candidates, unless it only differs from `q` by case.
 *
 * Skipped when the search is restricted to fields that don't include `title`.
 *
 * Cost: one extra statement in the common case (page 1 holding every full-text match). It scans
 * the live songs once, computing similarity against each title and alternate title, which is a
 * few milliseconds at 5,000 songs (REQ-SRCH-07). Only when the full-text matches aren't all on
 * the current page (page > 1 or pageSize < 3) is the full-text query re-run to fetch them.
 */
import 'server-only';

import { sql, type SQL } from 'drizzle-orm';

import type { DB } from '@/lib/db';
import type { SearchParams, UsageLevel } from '@/types/domain';

import {
  buildSearchQuery,
  DEFAULT_PAGE_SIZE,
  type SearchQueryContext,
  type SearchRow,
} from './query';

/** Full-text totals below this trigger the fallback. */
export const FUZZY_MIN_TOTAL = 3;
/** Minimum `pg_trgm` similarity (exclusive) between `q` and a title. */
export const FUZZY_THRESHOLD = 0.3;

const DEFAULT_USAGE: readonly UsageLevel[] = ['high', 'low', 'rare'];
const ALPHA_KEY = sql`lower(extensions.unaccent(s.title)) collate "C"`;

/** One row of the fuzzy statement: a song (null columns when the page is empty) plus totals. */
export type FuzzyRow = { [K in keyof SearchRow]: SearchRow[K] | null } & {
  /** Fuzzy matches excluding the full-text ones (across all pages). */
  fuzzyTotal: number;
  /** Best-matching title or alternate title across every fuzzy candidate. */
  didYouMean: string | null;
};

export interface FuzzyPage {
  /** Fuzzy rows to skip (fuzzy matches before this page). */
  offset: number;
  /** Fuzzy rows to return (may be 0: the statement still returns the totals). */
  limit: number;
  /** Song ids already returned by full-text search; never repeated. */
  excludeIds: readonly string[];
}

/** Whether the fallback applies to a full-text search with `total` matches. */
export function shouldFallback(params: SearchParams, total: number): boolean {
  const q = params.q?.trim() ?? '';
  if (q.length === 0 || total >= FUZZY_MIN_TOTAL) return false;
  return !params.fields || params.fields.length === 0 || params.fields.includes('title');
}

function list(values: readonly (string | number)[]): SQL {
  return sql.join(
    values.map((v) => sql`${v}`),
    sql`, `,
  );
}

function nonEmpty<T>(values: readonly T[] | undefined): values is readonly T[] {
  return values !== undefined && values.length > 0;
}

/** Postgres array literal for uuids read from the database. */
function uuidArray(ids: readonly string[]): string {
  return `{${ids.join(',')}}`;
}

/**
 * Builds the fuzzy statement. Always returns at least one row carrying `fuzzyTotal` and
 * `didYouMean`; song columns are null on that row when the page has no fuzzy songs.
 * Pure: no I/O, and values are always bound.
 */
export function buildFuzzyQuery(params: SearchParams, page: FuzzyPage): SQL {
  const q = (params.q ?? '').trim().toLowerCase();

  const branchCode = params.branch?.trim() || undefined;
  const from: SQL[] = [
    sql`from songs s`,
    sql`left join song_keys pk on pk.song_id = s.id and pk.is_primary`,
  ];
  if (branchCode) {
    from.push(
      sql`left join branch_usage su on su.song_id = s.id
            and su.branch_id = (select b.id from branches b where b.code = ${branchCode})`,
    );
  }
  from.push(
    sql`cross join lateral (
          select c.txt as "match", extensions.similarity(lower(c.txt), ${q}) as score
          from unnest(array[s.title] || s.alt_titles) with ordinality as c(txt, ord)
          order by score desc, c.ord
          limit 1
        ) t`,
  );

  const where: SQL[] = [sql`s.deleted_at is null`, sql`t.score > ${FUZZY_THRESHOLD}`];
  if (nonEmpty(params.energy)) where.push(sql`s.energy_level in (${list(params.energy)})`);
  if (nonEmpty(params.key)) {
    where.push(
      sql`exists (select 1 from song_keys k where k.song_id = s.id and k.key in (${list(params.key)}))`,
    );
  }
  if (nonEmpty(params.decade)) {
    const ranges = params.decade.map((d) => sql`(s.year >= ${d} and s.year < ${d + 10})`);
    where.push(sql`(${sql.join(ranges, sql` or `)})`);
  }
  if (branchCode) {
    const usage = nonEmpty(params.usage) ? params.usage : DEFAULT_USAGE;
    where.push(sql`coalesce(su.level, 'none'::usage_level) in (${list(usage)})`);
  }
  if (nonEmpty(params.chordChorus)) {
    where.push(sql`pk.chorus_chord in (${list(params.chordChorus)})`);
  }
  if (nonEmpty(params.chordVerse)) where.push(sql`pk.verse_chord in (${list(params.chordVerse)})`);
  if (nonEmpty(params.chordBridge)) {
    where.push(sql`pk.bridge_chord in (${list(params.chordBridge)})`);
  }

  const notExcluded = sql`not (m.id = any(${uuidArray(page.excludeIds)}::uuid[]))`;

  return sql`
    with m as (
      select s.id, t."match", t.score
      ${sql.join(from, sql` `)}
      where ${sql.join(where, sql` and `)}
    )
    select
      p.*,
      agg."fuzzyTotal",
      agg."didYouMean"
    from (
      select
        (select count(*)::int from m where ${notExcluded}) as "fuzzyTotal",
        (select m."match" from m order by m.score desc, lower(m."match") collate "C" limit 1)
          as "didYouMean"
    ) agg
    left join lateral (
      select
        s.id,
        s.title,
        s.year::int as "year",
        s.tempo_bpm::int as "tempoBpm",
        s.time_signature as "timeSignature",
        s.energy_level::text as "energyLevel",
        pk.key as "primaryKey",
        coalesce((
          select json_agg(json_build_object('name', c.name, 'popMember', c.pop_member)
                          order by sc.sort_order, c.name)
          from song_composers sc
          join composers c on c.id = sc.composer_id
          where sc.song_id = s.id
        ), '[]'::json) as "composers",
        ab.code as "addedByBranchCode",
        (select count(*)::int from resources r where r.song_id = s.id) as "resourceCount",
        to_char(s.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "createdAt",
        m.score::real as "rank"
      from m
      join songs s on s.id = m.id
      left join song_keys pk on pk.song_id = s.id and pk.is_primary
      left join branches ab on ab.id = s.added_by_branch_id
      where ${notExcluded}
      order by m.score desc, ${ALPHA_KEY} asc, s.id asc
      limit ${page.limit} offset ${page.offset}
    ) p on true`;
}

export interface FuzzyResult {
  rows: SearchRow[];
  total: number;
  didYouMean?: string;
}

/**
 * Applies the fallback to a full-text result: `ftsRows` is the current page, `ftsTotal` the
 * full-text match count. Returns null when the fallback doesn't apply. `params` must already be
 * normalized (`normalizeSearchParams`).
 */
export async function fuzzyFallback(
  db: Pick<DB, 'execute'>,
  params: SearchParams,
  ctx: SearchQueryContext,
  ftsRows: readonly SearchRow[],
  ftsTotal: number,
): Promise<FuzzyResult | null> {
  if (!shouldFallback(params, ftsTotal)) return null;

  const pageNo = params.page ?? 1;
  const pageSize = params.pageSize ?? DEFAULT_PAGE_SIZE;
  const offset = (pageNo - 1) * pageSize;

  // Every full-text match (fewer than FUZZY_MIN_TOTAL), in full-text order.
  let ftsAll: readonly SearchRow[] = ftsRows;
  if (ftsTotal === 0) ftsAll = [];
  else if (pageNo !== 1 || ftsRows.length < ftsTotal) {
    ftsAll = [
      ...(await db.execute<SearchRow>(
        buildSearchQuery({ ...params, page: 1, pageSize: FUZZY_MIN_TOTAL }, ctx),
      )),
    ];
  }

  const ftsPage = ftsAll.slice(offset, offset + pageSize);
  const fuzzyRows = [
    ...(await db.execute<FuzzyRow>(
      buildFuzzyQuery(params, {
        offset: Math.max(0, offset - ftsAll.length),
        limit: pageSize - ftsPage.length,
        excludeIds: ftsAll.map((r) => r.id),
      }),
    )),
  ];

  const fuzzyTotal = fuzzyRows.length > 0 ? Number(fuzzyRows[0]!.fuzzyTotal) : 0;
  const best = fuzzyRows[0]?.didYouMean ?? null;
  const items = fuzzyRows
    .filter((r) => r.id !== null)
    .map(({ fuzzyTotal: _t, didYouMean: _d, ...song }) => ({
      ...(song as SearchRow),
      total: ftsAll.length + fuzzyTotal,
    }));

  const result: FuzzyResult = {
    rows: [...ftsPage, ...items],
    total: ftsAll.length + fuzzyTotal,
  };
  const q = (params.q ?? '').trim().toLowerCase();
  if (best !== null && best.toLowerCase() !== q) result.didYouMean = best;
  return result;
}
