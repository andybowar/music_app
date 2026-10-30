/**
 * Builds `SongDetail` / `SongSummary` (contracts/types.md) from database rows.
 *
 * Pure: no I/O, so search (SRCH-02), lists (LIST-01) and branch activity (BR-01) can reuse it
 * with rows they loaded themselves. Ordering rules:
 *   - composers: by `song_composers.sort_order`
 *   - keys: primary first, then alphabetical by key
 *   - resources: oldest first (ties by id)
 *   - themes: by section (SECTIONS order), then theme id
 *   - usage: one entry per branch, in the order `branches` is given; a branch with no
 *     `branch_usage` row is reported as level 'none', source 'manual'
 */
import type { branchUsage, composers, resources, songKeys, songs, themes } from '@/db/schema';
import {
  SECTIONS,
  type Branch,
  type BranchUsage,
  type Composer,
  type Resource,
  type Section,
  type SongDetail,
  type SongKey,
  type SongLyrics,
  type SongSummary,
  type Theme,
} from '@/types/domain';

export type SongRow = typeof songs.$inferSelect;
export type ComposerRow = typeof composers.$inferSelect;
export type SongKeyRow = typeof songKeys.$inferSelect;
export type ResourceRow = typeof resources.$inferSelect;
export type ThemeRow = typeof themes.$inferSelect;
export type BranchUsageRow = typeof branchUsage.$inferSelect;

/** A `song_composers` row joined to its composer. */
export interface SongComposerRow {
  sortOrder: number;
  composer: Pick<ComposerRow, 'id' | 'name' | 'popMember'>;
}

/** A `song_themes` row joined to its theme. */
export interface SongThemeRow {
  section: Section;
  theme: Pick<ThemeRow, 'id' | 'name'>;
}

/** Everything `assembleSongDetail` needs for one song. Child rows may be unsorted. */
export interface SongDetailRows {
  song: SongRow;
  composers: SongComposerRow[];
  keys: SongKeyRow[];
  resources: ResourceRow[];
  themes: SongThemeRow[];
  usage: Array<Pick<BranchUsageRow, 'branchId' | 'level' | 'source'>>;
  /** Every branch, in display order. Used for `usage` and `addedByBranchCode`. */
  branches: Array<Pick<Branch, 'id' | 'code'>>;
}

/** Column of `songs` holding each section's lyrics. */
export const LYRIC_COLUMNS = {
  chorus: 'chorusLyrics',
  verse_1: 'verse1Lyrics',
  verse_2: 'verse2Lyrics',
  verse_3: 'verse3Lyrics',
  verse_4: 'verse4Lyrics',
  verse_5: 'verse5Lyrics',
  bridge: 'bridgeLyrics',
} as const satisfies Record<Section, keyof SongRow>;

export const toIso = (d: Date): string => d.toISOString();

const compareStrings = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export function lyricsFromRow(song: SongRow): SongLyrics {
  return Object.fromEntries(SECTIONS.map((s) => [s, song[LYRIC_COLUMNS[s]] ?? null])) as SongLyrics;
}

export function toSongKey(row: SongKeyRow): SongKey {
  return {
    id: row.id,
    songId: row.songId,
    key: row.key,
    isPrimary: row.isPrimary,
    firstChords: {
      intro: row.introChord,
      verse: row.verseChord,
      chorus: row.chorusChord,
      bridge: row.bridgeChord,
    },
  };
}

/** Primary first, then alphabetical by key. */
export function sortKeys<T extends Pick<SongKey, 'key' | 'isPrimary'>>(keys: readonly T[]): T[] {
  return [...keys].sort(
    (a, b) => Number(b.isPrimary) - Number(a.isPrimary) || compareStrings(a.key, b.key),
  );
}

export function toResource(row: ResourceRow): Resource {
  return {
    id: row.id,
    songId: row.songId,
    songKeyId: row.songKeyId,
    kind: row.kind,
    format: row.format,
    label: row.label,
    url: row.url,
    storagePath: row.storagePath,
    sizeBytes: row.sizeBytes,
    mimeType: row.mimeType,
    createdAt: toIso(row.createdAt),
  };
}

export function sortResources(rows: readonly ResourceRow[]): ResourceRow[] {
  return [...rows].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime() || compareStrings(a.id, b.id),
  );
}

export function sortComposers(rows: readonly SongComposerRow[]): Composer[] {
  return [...rows]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(({ composer }) => ({
      id: composer.id,
      name: composer.name,
      popMember: composer.popMember,
    }));
}

export function sortThemes(
  rows: readonly SongThemeRow[],
): Array<{ section: Section; theme: Theme }> {
  return [...rows]
    .sort(
      (a, b) =>
        SECTIONS.indexOf(a.section) - SECTIONS.indexOf(b.section) ||
        compareStrings(a.theme.id, b.theme.id),
    )
    .map(({ section, theme }) => ({ section, theme: { id: theme.id, name: theme.name } }));
}

/** One entry per branch; branches without a row read as 'none' / 'manual'. */
export function fillUsage(
  rows: SongDetailRows['usage'],
  branches: SongDetailRows['branches'],
): BranchUsage[] {
  const byBranch = new Map(rows.map((r) => [r.branchId, r]));
  return branches.map((b) => {
    const row = byBranch.get(b.id);
    return {
      branchId: b.id,
      branchCode: b.code,
      level: row?.level ?? 'none',
      source: row?.source ?? 'manual',
    };
  });
}

export function assembleSongDetail(rows: SongDetailRows): SongDetail {
  const { song } = rows;
  const keys = sortKeys(rows.keys.map(toSongKey));
  const resources = sortResources(rows.resources).map(toResource);
  const addedByBranchCode = rows.branches.find((b) => b.id === song.addedByBranchId)?.code ?? null;

  return {
    id: song.id,
    title: song.title,
    year: song.year,
    tempoBpm: song.tempoBpm,
    timeSignature: song.timeSignature,
    energyLevel: song.energyLevel,
    primaryKey: keys.find((k) => k.isPrimary)?.key ?? null,
    composers: sortComposers(rows.composers),
    addedByBranchCode,
    resourceCount: resources.length,
    createdAt: toIso(song.createdAt),
    altTitles: [...song.altTitles],
    sourceGroup: song.sourceGroup,
    energyNotes: song.energyNotes,
    lyrics: lyricsFromRow(song),
    arrangement: [...song.arrangement],
    chorusLine: song.chorusLine,
    verse1Line: song.verse1Line,
    keys,
    resources,
    themes: sortThemes(rows.themes),
    usage: fillUsage(rows.usage, rows.branches),
    addedByBranchId: song.addedByBranchId,
    createdBy: song.createdBy,
    updatedAt: toIso(song.updatedAt),
  };
}

/** The compact row shape, derived exactly as `SongSummary` defines it. */
export function toSongSummary(detail: SongDetail): SongSummary {
  return {
    id: detail.id,
    title: detail.title,
    year: detail.year,
    tempoBpm: detail.tempoBpm,
    timeSignature: detail.timeSignature,
    energyLevel: detail.energyLevel,
    primaryKey: detail.primaryKey,
    composers: detail.composers.map(({ name, popMember }) => ({ name, popMember })),
    addedByBranchCode: detail.addedByBranchCode,
    resourceCount: detail.resourceCount,
    createdAt: detail.createdAt,
  };
}

/** Rows needed for a `SongSummary` without loading the full detail. */
export interface SongSummaryRows {
  song: Pick<
    SongRow,
    'id' | 'title' | 'year' | 'tempoBpm' | 'timeSignature' | 'energyLevel' | 'createdAt'
  >;
  primaryKey: string | null;
  composers: SongComposerRow[];
  addedByBranchCode: string | null;
  resourceCount: number;
}

export function assembleSongSummary(rows: SongSummaryRows): SongSummary {
  const { song } = rows;
  return {
    id: song.id,
    title: song.title,
    year: song.year,
    tempoBpm: song.tempoBpm,
    timeSignature: song.timeSignature,
    energyLevel: song.energyLevel,
    primaryKey: rows.primaryKey,
    composers: sortComposers(rows.composers).map(({ name, popMember }) => ({ name, popMember })),
    addedByBranchCode: rows.addedByBranchCode,
    resourceCount: rows.resourceCount,
    createdAt: toIso(song.createdAt),
  };
}
