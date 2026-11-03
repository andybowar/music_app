/**
 * Pure helpers behind `getAuditTrail` (LIB-19; REQ-LIB-12): which audit rows belong to a song's
 * history, and how a stored diff is cleaned up before it leaves the server.
 *
 * The song actions audit under several entity names (see `lib/audit.ts` callers):
 *   - keyed by the song id:  'song', 'song_composers', 'song_themes', 'branch_usage'
 *   - keyed by a child id:   'song_key' (a `song_keys` row), 'resource' (a `resources` row)
 * Theme and composer vocabulary edits ('theme', 'composer') aren't about one song and are left out.
 */

import type { AuditEntry } from '@/types/domain';

type Diff = AuditEntry['diff'];

/** Entities audited with `entityId` = the song id. */
export const SONG_ENTITIES = ['song', 'song_composers', 'song_themes', 'branch_usage'] as const;

/** Entities audited with `entityId` = a child row of the song. */
export const SONG_CHILD_ENTITIES = ['song_key', 'resource'] as const;

/** Most entries one trail returns (newest first). */
export const TRAIL_LIMIT = 200;

/**
 * Fields never sent to the browser: ids and storage details that mean nothing to a reader
 * (`storagePath` is a bucket path, `uploadedBy` a user id, `songId`/`songKeyId` row ids).
 */
const HIDDEN_FIELDS: ReadonlySet<string> = new Set([
  'songId',
  'songKeyId',
  'storagePath',
  'uploadedBy',
  'sizeBytes',
  'mimeType',
]);

export interface RefNames {
  /** composer id → name */
  composers: ReadonlyMap<string, string>;
  /** branch id → code */
  branches: ReadonlyMap<string, string>;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const asIdList = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

/** Composer and branch ids a set of diffs mentions, so the server can look their names up once. */
export function collectRefs(diffs: Diff[]): { composerIds: string[]; branchIds: string[] } {
  const composerIds = new Set<string>();
  const branchIds = new Set<string>();
  for (const diff of diffs) {
    const composers = diff.composerIds;
    if (composers) {
      for (const id of [...asIdList(composers.from), ...asIdList(composers.to)]) {
        composerIds.add(id);
      }
    }
    const branch = diff.addedByBranchId;
    if (branch) {
      for (const v of [branch.from, branch.to]) if (typeof v === 'string') branchIds.add(v);
    }
  }
  return { composerIds: [...composerIds], branchIds: [...branchIds] };
}

/** Keep only the lyric sections whose text changed (the stored snapshot holds all seven). */
function narrowLyrics(from: unknown, to: unknown): { from: unknown; to: unknown } | null {
  if (!isRecord(from) && !isRecord(to)) return { from, to };
  const f = isRecord(from) ? from : {};
  const t = isRecord(to) ? to : {};
  const outFrom: Record<string, unknown> = {};
  const outTo: Record<string, unknown> = {};
  for (const section of new Set([...Object.keys(f), ...Object.keys(t)])) {
    const a = f[section] ?? null;
    const b = t[section] ?? null;
    if (a !== b) {
      outFrom[section] = a;
      outTo[section] = b;
    }
  }
  if (Object.keys(outTo).length === 0) return null;
  return { from: isRecord(from) ? outFrom : from, to: isRecord(to) ? outTo : to };
}

/**
 * Make a stored diff readable and safe to send:
 *   - drops `HIDDEN_FIELDS`;
 *   - `composerIds` → `composers` (names; an unknown id becomes "Unknown composer");
 *   - `addedByBranchId` → `addedByBranch` (branch code; unknown → "Unknown branch");
 *   - `lyrics` keeps only the sections that changed (dropped if none did).
 */
export function cleanDiff(diff: Diff, refs: RefNames): Diff {
  const out: Diff = {};
  for (const [field, change] of Object.entries(diff)) {
    if (HIDDEN_FIELDS.has(field) || !isRecord(change)) continue;
    const { from = null, to = null } = change;
    if (field === 'composerIds') {
      const names = (v: unknown) =>
        v === null ? null : asIdList(v).map((id) => refs.composers.get(id) ?? 'Unknown composer');
      out.composers = { from: names(from), to: names(to) };
    } else if (field === 'addedByBranchId') {
      const code = (v: unknown) =>
        typeof v === 'string' ? (refs.branches.get(v) ?? 'Unknown branch') : null;
      out.addedByBranch = { from: code(from), to: code(to) };
    } else if (field === 'lyrics') {
      const narrowed = narrowLyrics(from, to);
      if (narrowed) out.lyrics = narrowed;
    } else {
      out[field] = { from, to };
    }
  }
  return out;
}
