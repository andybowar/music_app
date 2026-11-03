/**
 * Branch activity (BR-01; REQ-BR-01): what each branch has added lately, which setlists it has
 * coming up, and which songs it has used most. Feeds the "Other branches" page (BR-02).
 *
 * A read helper (contracts/api.md): server-only, enforces `song:read`, returns plain data.
 *
 * One entry per branch, ordered by branch name (the page decides whether to hide the caller's
 * own branch). For a window of `days` days (default 90):
 *
 * - `recentlyAdded`: live songs whose `added_by_branch_id` is the branch, created within the
 *   window, newest first (at most `RECENT_LIMIT`).
 * - `upcoming`: the branch's live setlists dated today or later, soonest first (at most
 *   `UPCOMING_LIMIT`). Setlists are readable by everyone (REQ-LIST-08); playlists never show.
 * - `topSongs`: live songs on the branch's live setlists dated within the window up to and
 *   including today, ranked by how many of those setlists include them (`count`, a song
 *   listed twice on one setlist counts once), ties by title (at most `TOP_LIMIT`).
 *
 * "Today" is Postgres `current_date`, like `listLists` (LIST-01). Each query ranks rows per
 * branch with `row_number()` and only builds `SongSummary` columns for the rows it keeps. The
 * SQL is raw with explicit aliases so every column is qualified (see the Drizzle note in the
 * BR-01 PR).
 */
import 'server-only';

import { sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';

import { assembleSongSummary } from '@/features/songs/server/assemble';
import { requireUser } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { assertCan, can } from '@/lib/permissions';
import type {
  Branch,
  EnergyLevel,
  List,
  MusicalKey,
  PopMember,
  SongSummary,
  UUID,
} from '@/types/domain';

/** Most songs per branch in `recentlyAdded`. */
export const RECENT_LIMIT = 10;
/** Most setlists per branch in `upcoming`. */
export const UPCOMING_LIMIT = 5;
/** Most songs per branch in `topSongs`. */
export const TOP_LIMIT = 10;
export const DEFAULT_DAYS = 90;
export const MAX_DAYS = 3650;

export interface BranchActivity {
  branch: Branch;
  recentlyAdded: SongSummary[];
  upcoming: List[];
  topSongs: Array<SongSummary & { count: number }>;
}

export interface BranchActivityParams {
  /** Window for `recentlyAdded` and `topSongs`, in days (1..MAX_DAYS). Default 90. */
  days?: number;
}

/** An invalid or out-of-range `days` falls back to the default rather than failing the page. */
const paramsSchema = z.object({
  days: z.number().int().min(1).max(MAX_DAYS).catch(DEFAULT_DAYS),
});

// ----- Rows --------------------------------------------------------------------------------

export interface BranchRow {
  id: UUID;
  name: string;
  code: string;
  ssoGroup: string | null;
  [column: string]: unknown;
}

/** A song summary row tagged with the branch it belongs to. */
export interface SongActivityRow {
  branchId: UUID;
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
  createdAt: string;
  /** `topSongs` only: setlists in the window that include the song. */
  count?: number;
  [column: string]: unknown;
}

export interface ListActivityRow {
  id: UUID;
  type: List['type'];
  name: string;
  eventDate: string | null;
  ownerId: UUID;
  ownerName: string;
  branchId: UUID;
  branchCode: string | null;
  itemCount: number;
  createdAt: string;
  updatedAt: string;
  [column: string]: unknown;
}

/** UTC ISO timestamp, same format as `searchSongs`. */
const iso = (column: SQL) =>
  sql`to_char(${column} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

/** `SongSummary` columns for songs aliased `s`. */
const SUMMARY_COLUMNS = sql`
  s.id,
  s.title,
  s.year::int as "year",
  s.tempo_bpm::int as "tempoBpm",
  s.time_signature as "timeSignature",
  s.energy_level::text as "energyLevel",
  (select pk.key from song_keys pk where pk.song_id = s.id and pk.is_primary limit 1) as "primaryKey",
  coalesce((
    select json_agg(json_build_object('name', c.name, 'popMember', c.pop_member)
                    order by sc.sort_order, c.name)
    from song_composers sc
    join composers c on c.id = sc.composer_id
    where sc.song_id = s.id
  ), '[]'::json) as "composers",
  (select ab.code from branches ab where ab.id = s.added_by_branch_id) as "addedByBranchCode",
  (select count(*)::int from resources r where r.song_id = s.id) as "resourceCount",
  ${iso(sql`s.created_at`)} as "createdAt"`;

/** Same as the library's alphabetical sort key (SRCH-01). */
const TITLE_KEY = sql`lower(extensions.unaccent(s.title)) collate "C"`;

export function branchesQuery(): SQL {
  return sql`
    select b.id, b.name, b.code, b.sso_group as "ssoGroup"
    from branches b
    order by b.name, b.id`;
}

export function recentlyAddedQuery(days: number, limit = RECENT_LIMIT): SQL {
  return sql`
    with ranked as (
      select s.id,
             s.added_by_branch_id as branch_id,
             row_number() over (partition by s.added_by_branch_id
                                order by s.created_at desc, s.id) as rn
      from songs s
      where s.deleted_at is null
        and s.added_by_branch_id is not null
        and s.created_at >= now() - make_interval(days => ${days}::int)
    )
    select ranked.branch_id as "branchId", ${SUMMARY_COLUMNS}
    from ranked
    join songs s on s.id = ranked.id
    where ranked.rn <= ${limit}::int
    order by ranked.branch_id, ranked.rn`;
}

export function upcomingQuery(limit = UPCOMING_LIMIT): SQL {
  return sql`
    with ranked as (
      select l.id,
             row_number() over (partition by l.branch_id order by l.event_date, l.name, l.id) as rn
      from lists l
      where l.type = 'setlist'
        and l.deleted_at is null
        and l.branch_id is not null
        and l.event_date >= current_date
    )
    select l.id,
           l.type::text as "type",
           l.name,
           l.event_date::text as "eventDate",
           l.owner_id as "ownerId",
           u.name as "ownerName",
           l.branch_id as "branchId",
           b.code as "branchCode",
           (select count(*)::int from list_items li where li.list_id = l.id) as "itemCount",
           ${iso(sql`l.created_at`)} as "createdAt",
           ${iso(sql`l.updated_at`)} as "updatedAt"
    from ranked
    join lists l on l.id = ranked.id
    join users u on u.id = l.owner_id
    left join branches b on b.id = l.branch_id
    where ranked.rn <= ${limit}::int
    order by l.branch_id, ranked.rn`;
}

export function topSongsQuery(days: number, limit = TOP_LIMIT): SQL {
  return sql`
    with counts as (
      select l.branch_id, li.song_id, count(distinct l.id)::int as n
      from lists l
      join list_items li on li.list_id = l.id
      where l.type = 'setlist'
        and l.deleted_at is null
        and l.branch_id is not null
        and l.event_date >= current_date - ${days}::int
        and l.event_date <= current_date
      group by l.branch_id, li.song_id
    ), ranked as (
      select counts.branch_id, counts.song_id, counts.n,
             row_number() over (partition by counts.branch_id
                                order by counts.n desc, ${TITLE_KEY}, s.id) as rn
      from counts
      join songs s on s.id = counts.song_id
      where s.deleted_at is null
    )
    select ranked.branch_id as "branchId", ranked.n as "count", ${SUMMARY_COLUMNS}
    from ranked
    join songs s on s.id = ranked.song_id
    where ranked.rn <= ${limit}::int
    order by ranked.branch_id, ranked.rn`;
}

// ----- Row → domain ------------------------------------------------------------------------

export function toSummary(row: SongActivityRow): SongSummary {
  return assembleSongSummary({
    song: {
      id: row.id,
      title: row.title,
      year: row.year,
      tempoBpm: row.tempoBpm,
      timeSignature: row.timeSignature,
      energyLevel: row.energyLevel,
      createdAt: new Date(row.createdAt),
    },
    primaryKey: row.primaryKey,
    // Composers arrive ordered; SongSummary carries no composer id.
    composers: row.composers.map((c, i) => ({
      sortOrder: i,
      composer: { id: '', name: c.name, popMember: c.popMember },
    })),
    addedByBranchCode: row.addedByBranchCode,
    resourceCount: Number(row.resourceCount),
  });
}

export function toList(row: ListActivityRow): List {
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    eventDate: row.eventDate,
    ownerId: row.ownerId,
    ownerName: row.ownerName,
    branchId: row.branchId,
    branchCode: row.branchCode,
    itemCount: Number(row.itemCount),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function groupBy<T extends { branchId: UUID }>(rows: readonly T[]): Map<UUID, T[]> {
  const map = new Map<UUID, T[]>();
  for (const row of rows) {
    const group = map.get(row.branchId);
    if (group) group.push(row);
    else map.set(row.branchId, [row]);
  }
  return map;
}

/**
 * Assembles one `BranchActivity` per branch, in `branches` order. Rows are expected in display
 * order already; rows for unknown branches are dropped.
 */
export function assembleActivity(
  branches: readonly BranchRow[],
  recent: readonly SongActivityRow[],
  upcoming: readonly List[],
  top: readonly SongActivityRow[],
): BranchActivity[] {
  const recentBy = groupBy(recent);
  const upcomingBy = new Map<UUID, List[]>();
  for (const list of upcoming) {
    if (!list.branchId) continue;
    const group = upcomingBy.get(list.branchId);
    if (group) group.push(list);
    else upcomingBy.set(list.branchId, [list]);
  }
  const topBy = groupBy(top);

  return branches.map((b) => ({
    branch: { id: b.id, name: b.name, code: b.code, ssoGroup: b.ssoGroup },
    recentlyAdded: (recentBy.get(b.id) ?? []).map(toSummary),
    upcoming: upcomingBy.get(b.id) ?? [],
    topSongs: (topBy.get(b.id) ?? []).map((row) => ({
      ...toSummary(row),
      count: Number(row.count ?? 0),
    })),
  }));
}

// ----- Read helper -------------------------------------------------------------------------

/** Per-branch activity for the "Other branches" page (api.md; song:read). */
export async function getBranchActivity(
  params: BranchActivityParams = {},
): Promise<BranchActivity[]> {
  const user = await requireUser();
  assertCan(user, 'song:read');
  const { days } = paramsSchema.parse(params ?? {});

  const db = getDb();
  const [branchRows, recentRows, upcomingRows, topRows] = await Promise.all([
    db.execute<BranchRow>(branchesQuery()),
    db.execute<SongActivityRow>(recentlyAddedQuery(days)),
    db.execute<ListActivityRow>(upcomingQuery()),
    db.execute<SongActivityRow>(topSongsQuery(days)),
  ]);

  // Setlists are readable by everyone today; keep only what can() allows if that changes.
  const lists = [...upcomingRows].map(toList).filter((list) => can(user, 'list:read', { list }));

  return assembleActivity([...branchRows], [...recentRows], lists, [...topRows]);
}
