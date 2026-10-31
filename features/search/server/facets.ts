/**
 * Filter facet options (SRCH-10; REQ-SRCH-03). Feeds `FilterBar`'s dropdowns with values that
 * exist in the library, so a filter never offers an option that can't match:
 *
 * - `keys`: every distinct `song_keys.key` (any key, not only the primary — the key filter
 *   matches any `song_keys` row). Majors first, then minors; each group in pitch order from C
 *   (C, C#, Db, D, …), enharmonic spellings sharp before flat.
 * - `decades`: the distinct decades of `songs.year` (1994 → 1990), ascending.
 * - `chords`: the distinct first chords of the **primary** key's chorus / verse / bridge (the
 *   chord filters match the primary key only). Null chords (shown as 'X') are left out. Sorted
 *   by root pitch from C, then by spelling.
 * - `branches`: every branch, by name (code-point order, so it does not depend on DB collation).
 *
 * Soft-deleted songs (`deleted_at`) contribute nothing.
 *
 * `getFacetOptions()` checks the caller (`requireUser` → `assertCan('song:read')`) on every
 * call, then serves the options from Next's data cache for 5 minutes (`FACETS_REVALIDATE_SECONDS`).
 * The options are the same for every user, so one cache entry is shared. A write that must show
 * up sooner can call `revalidateTag(FACETS_CACHE_TAG)`.
 */
import 'server-only';

import { sql } from 'drizzle-orm';
import { unstable_cache } from 'next/cache';

import { requireUser } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { assertCan } from '@/lib/permissions';
import type { Branch, FacetOptions, MusicalKey } from '@/types/domain';

/** Cache lifetime for facet options, in seconds (5 minutes). */
export const FACETS_REVALIDATE_SECONDS = 300;
/** Data-cache tag for facet options; `revalidateTag` it to refresh early. */
export const FACETS_CACHE_TAG = 'search-facets';

const PITCH: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const ROOT_RE = /^([A-G])(#|b)?/;

/** Pitch class (0–11) of a key or chord's root, or `null` when it has no recognisable root. */
export function rootPitch(value: string): number | null {
  const m = ROOT_RE.exec(value);
  if (!m) return null;
  const shift = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
  return (PITCH[m[1]!]! + shift + 12) % 12;
}

/** Sharp before flat (`#` sorts before `b`); otherwise plain code-point order. */
function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function comparePitch(a: string, b: string): number {
  const pa = rootPitch(a);
  const pb = rootPitch(b);
  if (pa === pb) return 0;
  if (pa === null) return 1;
  if (pb === null) return -1;
  return pa - pb;
}

/** Key order: majors before minors, then pitch from C, then spelling (C# before Db). */
export function compareKeys(a: MusicalKey, b: MusicalKey): number {
  const minorA = a.endsWith('m') ? 1 : 0;
  const minorB = b.endsWith('m') ? 1 : 0;
  return minorA - minorB || comparePitch(a, b) || compareText(a, b);
}

/** Chord order: root pitch from C, then spelling (C, C/E, C7, Cm, C#, Db, …). */
export function compareChords(a: string, b: string): number {
  return comparePitch(a, b) || compareText(a, b);
}

interface ChordRow {
  chorus: string | null;
  verse: string | null;
  bridge: string | null;
  [column: string]: unknown;
}

/** Distinct non-null values of `pick` over `rows`, sorted as chords. */
function distinctChords(rows: readonly ChordRow[], pick: (r: ChordRow) => string | null) {
  const set = new Set<string>();
  for (const r of rows) {
    const v = pick(r);
    if (v) set.add(v);
  }
  return [...set].sort(compareChords);
}

/** Reads facet options straight from the database (no auth, no cache). */
export async function loadFacetOptions(): Promise<FacetOptions> {
  const db = getDb();
  const [keyRows, decadeRows, chordRows, branchRows] = await Promise.all([
    db.execute<{ key: string; [column: string]: unknown }>(sql`
      select distinct k.key
      from song_keys k
      join songs s on s.id = k.song_id
      where s.deleted_at is null`),
    db.execute<{ decade: number; [column: string]: unknown }>(sql`
      select distinct (s.year::int / 10) * 10 as decade
      from songs s
      where s.deleted_at is null and s.year is not null`),
    db.execute<ChordRow>(sql`
      select distinct k.chorus_chord as chorus, k.verse_chord as verse, k.bridge_chord as bridge
      from song_keys k
      join songs s on s.id = k.song_id
      where k.is_primary and s.deleted_at is null`),
    db.execute<{
      id: string;
      name: string;
      code: string;
      ssoGroup: string | null;
      [column: string]: unknown;
    }>(sql`
      select b.id, b.name, b.code, b.sso_group as "ssoGroup"
      from branches b`),
  ]);

  const chordList = [...chordRows];
  const branches: Branch[] = [...branchRows]
    .map((b) => ({ id: b.id, name: b.name, code: b.code, ssoGroup: b.ssoGroup }))
    .sort((a, b) => compareText(a.name, b.name) || compareText(a.id, b.id));

  return {
    keys: [...keyRows].map((r) => r.key).sort(compareKeys),
    decades: [...decadeRows].map((r) => Number(r.decade)).sort((a, b) => a - b),
    chords: {
      chorus: distinctChords(chordList, (r) => r.chorus),
      verse: distinctChords(chordList, (r) => r.verse),
      bridge: distinctChords(chordList, (r) => r.bridge),
    },
    branches,
  };
}

const cachedFacetOptions = unstable_cache(loadFacetOptions, ['search', 'facet-options'], {
  revalidate: FACETS_REVALIDATE_SECONDS,
  tags: [FACETS_CACHE_TAG],
});

/** Filter dropdown options for the library search (api.md; song:read). Cached 5 minutes. */
export async function getFacetOptions(): Promise<FacetOptions> {
  const user = await requireUser();
  assertCan(user, 'song:read');
  return cachedFacetOptions();
}
