/**
 * Search query builder (SRCH-01; REQ-SRCH-01..04). Internal to `features/search/server`:
 * `searchSongs` (SRCH-02) runs the query and maps rows to `SongSummary`.
 *
 * One SQL statement does text search, every filter, the sort, pagination and the total:
 *
 * - Text: `websearch_to_tsquery` over `songs.search_vector` (DB-02), narrowed to the selected
 *   fields with `ts_filter` on their weights: title + alt titles A, themes B, composer C,
 *   lyrics D. Titles, themes and lyrics are indexed with the `english` config, composers with
 *   `simple`, so the composer field is matched with a `simple` query too. The query text is
 *   unaccented the same way the vector is.
 * - Filters (all optional, combined with AND; values within one filter are OR'd):
 *   energy, key (any `song_keys` row, not only the primary), decade (1990 → 1990..1999),
 *   branch + usage (a missing `branch_usage` row counts as 'none'; usage defaults to
 *   high/low/rare), and the first chords of the primary key's chorus/verse/bridge.
 * - Sort: relevance (`ts_rank`, highest first) when `q` is set and `sort` isn't; otherwise
 *   `sort` (default 'date'). Default directions: date newest first, everything else
 *   ascending. Energy and branch use follow `ENERGY_LEVELS` / `USAGE_LEVELS` order (the
 *   Postgres enums are declared in the same order). Nulls sort last either way. Ties break on
 *   unaccented case-insensitive title, then id, so pages are stable.
 * - Pagination: `page` (1-based) and `pageSize` (default 50, clamped to 1..100). `total` is a
 *   window count over the filtered set, so it's on every row; a page past the end returns no
 *   rows (and so no total).
 *
 * Soft-deleted songs (`deleted_at`) are never returned.
 */
import 'server-only';

import { sql, type SQL } from 'drizzle-orm';

import type {
  EnergyLevel,
  ISODateTime,
  MusicalKey,
  PopMember,
  SearchField,
  SearchParams,
  Sort,
  UsageLevel,
  UUID,
} from '@/types/domain';
import { SEARCH_FIELDS } from '@/types/domain';

/** One result row. Mirrors `SongSummary`, plus `total` (the match count across all pages). */
export interface SearchRow {
  id: UUID;
  title: string;
  year: number | null;
  tempoBpm: number | null;
  timeSignature: string | null;
  energyLevel: EnergyLevel | null;
  primaryKey: MusicalKey | null;
  composers: Array<{ name: string; popMember: PopMember }>;
  addedByBranchCode: string | null;
  resourceCount: number;
  createdAt: ISODateTime;
  total: number;
  [column: string]: unknown;
}

/** Caller context the params can't carry. */
export interface SearchQueryContext {
  /** Current user's branch: the branch for `sort: 'branch_use'` when `params.branch` is unset. */
  userBranchId?: UUID | null;
}

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 100;
const DEFAULT_USAGE: readonly UsageLevel[] = ['high', 'low', 'rare'];

/** `search_vector` weight for each searchable field (DB-02's `songs_search_refresh`). */
const FIELD_WEIGHT: Record<SearchField, 'a' | 'b' | 'c' | 'd'> = {
  title: 'a',
  themes: 'b',
  composer: 'c',
  lyrics: 'd',
};

type SortKey = Sort | 'relevance';

const DEFAULT_DIR: Record<SortKey, 'asc' | 'desc'> = {
  relevance: 'desc',
  date: 'desc',
  alpha: 'asc',
  key: 'asc',
  energy: 'asc',
  branch_use: 'asc',
};

/** `in (...)` list of bound parameters. Callers only pass non-empty arrays. */
function list(values: readonly (string | number)[]): SQL {
  return sql.join(
    values.map((v) => sql`${v}`),
    sql`, `,
  );
}

function nonEmpty<T>(values: readonly T[] | undefined): values is readonly T[] {
  return values !== undefined && values.length > 0;
}

function clampInt(value: number | undefined, fallback: number, min: number, max: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

/**
 * Alphanumeric sort key: unaccented, lower-cased, compared byte-wise (`collate "C"`) so the
 * order is the same whatever the database's default collation (some ignore spaces).
 */
const ALPHA_KEY = sql`lower(extensions.unaccent(s.title)) collate "C"`;

/**
 * Builds the search statement for `params`. Run it with `db.execute<SearchRow>(...)`.
 * Pure: no I/O, and params are always bound, never interpolated.
 */
export function buildSearchQuery(params: SearchParams, ctx: SearchQueryContext = {}): SQL {
  const q = params.q?.trim() ?? '';
  const hasText = q.length > 0;
  const fields: readonly SearchField[] = nonEmpty(params.fields)
    ? SEARCH_FIELDS.filter((f) => params.fields!.includes(f))
    : SEARCH_FIELDS;
  const allFields = fields.length === SEARCH_FIELDS.length;
  const withComposer = fields.includes('composer');

  const page = clampInt(params.page, 1, 1, Number.MAX_SAFE_INTEGER);
  const pageSize = clampInt(params.pageSize, DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE);

  const sortKey: SortKey = params.sort ?? (hasText ? 'relevance' : 'date');
  const dir = params.dir ?? DEFAULT_DIR[sortKey];
  const dirSql = dir === 'asc' ? sql.raw('asc') : sql.raw('desc');

  // Which branch's usage row to join: the filter branch, else (for the branch-use sort only)
  // the user's branch.
  const branchCode = params.branch?.trim() || undefined;
  let usageBranch: SQL | null = null;
  if (branchCode) usageBranch = sql`(select b.id from branches b where b.code = ${branchCode})`;
  else if (sortKey === 'branch_use' && ctx.userBranchId)
    usageBranch = sql`${ctx.userBranchId}::uuid`;
  const usageLevel = sql`coalesce(su.level, 'none'::usage_level)`;

  // ---- FROM ----
  const from: SQL[] = [
    sql`from songs s`,
    sql`left join song_keys pk on pk.song_id = s.id and pk.is_primary`,
    sql`left join branches ab on ab.id = s.added_by_branch_id`,
  ];
  if (usageBranch) {
    from.push(
      sql`left join branch_usage su on su.song_id = s.id and su.branch_id = ${usageBranch}`,
    );
  }

  // ---- text ----
  const vector = allFields
    ? sql`s.search_vector`
    : sql`ts_filter(s.search_vector, ${`{${fields.map((f) => FIELD_WEIGHT[f]).join(',')}}`}::"char"[])`;
  let rank: SQL = sql`0::real`;
  const where: SQL[] = [sql`s.deleted_at is null`];
  if (hasText) {
    from.push(
      sql`cross join (select websearch_to_tsquery('english', extensions.unaccent(${q})) as en,
                             websearch_to_tsquery('simple', extensions.unaccent(${q})) as si) tq`,
    );
    if (withComposer) {
      where.push(sql`(${vector} @@ tq.en or ${vector} @@ tq.si)`);
      rank = sql`greatest(ts_rank(${vector}, tq.en), ts_rank(${vector}, tq.si))`;
    } else {
      where.push(sql`${vector} @@ tq.en`);
      rank = sql`ts_rank(${vector}, tq.en)`;
    }
  }

  // ---- filters ----
  if (nonEmpty(params.energy)) {
    where.push(sql`s.energy_level in (${list(params.energy)})`);
  }
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
    where.push(sql`${usageLevel} in (${list(usage)})`);
  }
  if (nonEmpty(params.chordChorus)) {
    where.push(sql`pk.chorus_chord in (${list(params.chordChorus)})`);
  }
  if (nonEmpty(params.chordVerse)) {
    where.push(sql`pk.verse_chord in (${list(params.chordVerse)})`);
  }
  if (nonEmpty(params.chordBridge)) {
    where.push(sql`pk.bridge_chord in (${list(params.chordBridge)})`);
  }

  // ---- order ----
  const order: SQL[] = [];
  switch (sortKey) {
    case 'relevance':
      order.push(sql`"rank" ${dirSql}`, sql`s.created_at desc`);
      break;
    case 'date':
      order.push(sql`s.created_at ${dirSql}`);
      break;
    case 'alpha':
      order.push(sql`${ALPHA_KEY} ${dirSql}`);
      break;
    case 'key':
      order.push(sql`pk.key collate "C" ${dirSql} nulls last`);
      break;
    case 'energy':
      order.push(sql`s.energy_level ${dirSql} nulls last`);
      break;
    case 'branch_use':
      // No branch to rank by (no filter branch, user has none): falls through to title.
      if (usageBranch) order.push(sql`${usageLevel} ${dirSql}`);
      break;
  }
  if (sortKey !== 'alpha') order.push(sql`${ALPHA_KEY} asc`);
  order.push(sql`s.id asc`);

  return sql`
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
      ${rank} as "rank",
      count(*) over ()::int as "total"
    ${sql.join(from, sql` `)}
    where ${sql.join(where, sql` and `)}
    order by ${sql.join(order, sql`, `)}
    limit ${pageSize} offset ${(page - 1) * pageSize}`;
}
