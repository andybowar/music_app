/**
 * Library search entry point (SRCH-02; REQ-SRCH-01). A read helper (api.md): server-only,
 * enforces `song:read`, returns plain data.
 *
 * Params are normalized through `searchParamsSchema` (types/validation.ts), so invalid values
 * are dropped rather than rejected. `buildSearchQuery` (SRCH-01) does the work in one
 * statement; rows map to `SongSummary` via `assembleSongSummary` (features/songs/server).
 *
 * With no params this is the default view: every song, newest first, then by title.
 */
import 'server-only';

import { assembleSongSummary } from '@/features/songs/server/assemble';
import { requireUser } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { assertCan } from '@/lib/permissions';
import type { SearchParams, SearchResult, SongSummary } from '@/types/domain';
import { searchParamsSchema, serializeSearchParams } from '@/types/validation';

import { buildSearchQuery, DEFAULT_PAGE_SIZE, type SearchRow } from './query';

/** Validates and normalizes `params` (lists deduped, bad values dropped, defaults omitted). */
export function normalizeSearchParams(params: SearchParams): SearchParams {
  return searchParamsSchema.parse(serializeSearchParams(params ?? {}));
}

/** Maps one query row to the summary shape. Composers arrive already ordered by the query. */
export function rowToSummary(row: SearchRow): SongSummary {
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
    // `id` isn't part of SongSummary and the query doesn't select it; order is kept by index.
    composers: row.composers.map((c, i) => ({
      sortOrder: i,
      composer: { id: '', name: c.name, popMember: c.popMember },
    })),
    addedByBranchCode: row.addedByBranchCode,
    resourceCount: Number(row.resourceCount),
  });
}

/** Searches the library (api.md; song:read). */
export async function searchSongs(params: SearchParams = {}): Promise<SearchResult> {
  const user = await requireUser();
  assertCan(user, 'song:read');

  const p = normalizeSearchParams(params);
  const ctx = { userBranchId: user.branchId };
  const db = getDb();
  const rows = [...(await db.execute<SearchRow>(buildSearchQuery(p, ctx)))];

  let total = rows.length > 0 ? Number(rows[0]!.total) : 0;
  if (rows.length === 0 && (p.page ?? 1) > 1) {
    // A page past the end has no rows to carry the window count; read it from page 1.
    const first = [
      ...(await db.execute<SearchRow>(buildSearchQuery({ ...p, page: 1, pageSize: 1 }, ctx))),
    ];
    total = first.length > 0 ? Number(first[0]!.total) : 0;
  }

  return {
    items: rows.map(rowToSummary),
    total,
    page: p.page ?? 1,
    pageSize: p.pageSize ?? DEFAULT_PAGE_SIZE,
  };
}
