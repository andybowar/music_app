import { describe, expect, test } from 'vitest';

import { branches, songs, thousandHallelujahs, toSummary } from '@/fixtures';
import type { SongDetail } from '@/types/domain';

import {
  assembleSongDetail,
  assembleSongSummary,
  fillUsage,
  sortKeys,
  toSongSummary,
  type SongDetailRows,
  type SongRow,
} from './assemble';

const iso = (s: string) => new Date(s).toISOString();

/** The fixture with timestamps in `Date#toISOString` form, which the assembler emits. */
function normalized(detail: SongDetail): SongDetail {
  return {
    ...detail,
    createdAt: iso(detail.createdAt),
    updatedAt: iso(detail.updatedAt),
    resources: detail.resources.map((r) => ({ ...r, createdAt: iso(r.createdAt) })),
  };
}

/** The DB rows a fixture song would be stored as, with child rows in reverse order. */
function rowsFor(detail: SongDetail): SongDetailRows {
  const song: SongRow = {
    id: detail.id,
    title: detail.title,
    altTitles: detail.altTitles,
    year: detail.year,
    sourceGroup: detail.sourceGroup,
    tempoBpm: detail.tempoBpm,
    timeSignature: detail.timeSignature,
    energyLevel: detail.energyLevel,
    energyNotes: detail.energyNotes,
    chorusLyrics: detail.lyrics.chorus,
    verse1Lyrics: detail.lyrics.verse_1,
    verse2Lyrics: detail.lyrics.verse_2,
    verse3Lyrics: detail.lyrics.verse_3,
    verse4Lyrics: detail.lyrics.verse_4,
    verse5Lyrics: detail.lyrics.verse_5,
    bridgeLyrics: detail.lyrics.bridge,
    arrangement: detail.arrangement,
    chorusLine: detail.chorusLine,
    verse1Line: detail.verse1Line,
    composerNames: '',
    themeNames: '',
    searchVector: null,
    addedByBranchId: detail.addedByBranchId,
    createdBy: detail.createdBy,
    updatedBy: null,
    createdAt: new Date(detail.createdAt),
    updatedAt: new Date(detail.updatedAt),
    deletedAt: null,
  };
  return {
    song,
    composers: detail.composers.map((composer, sortOrder) => ({ sortOrder, composer })).reverse(),
    keys: detail.keys
      .map((k) => ({
        id: k.id,
        songId: k.songId,
        key: k.key,
        isPrimary: k.isPrimary,
        introChord: k.firstChords.intro,
        verseChord: k.firstChords.verse,
        chorusChord: k.firstChords.chorus,
        bridgeChord: k.firstChords.bridge,
      }))
      .reverse(),
    resources: detail.resources
      .map((r) => ({ ...r, createdAt: new Date(r.createdAt), uploadedBy: null }))
      .reverse(),
    themes: [...detail.themes].reverse(),
    usage: detail.usage.map(({ branchId, level, source }) => ({ branchId, level, source })),
    branches,
  };
}

describe('assembleSongDetail', () => {
  test('rebuilds "A Thousand Hallelujahs" exactly from its rows', () => {
    expect(assembleSongDetail(rowsFor(thousandHallelujahs))).toEqual(
      normalized(thousandHallelujahs),
    );
  });

  test('every fixture song round-trips apart from theme order within a section', () => {
    for (const fixture of songs) {
      const got = assembleSongDetail(rowsFor(fixture));
      const want = normalized(fixture);
      const byTheme = (d: SongDetail) => d.themes.map((t) => `${t.section}:${t.theme.id}`).sort();
      expect(byTheme(got), fixture.title).toEqual(byTheme(want));
      expect({ ...got, themes: [] }, fixture.title).toEqual({ ...want, themes: [] });
    }
  });

  test('summary fields are derived from the children', () => {
    const rows = rowsFor(thousandHallelujahs);
    const detail = assembleSongDetail({ ...rows, keys: [], resources: [], branches: [] });
    expect(detail.primaryKey).toBeNull();
    expect(detail.resourceCount).toBe(0);
    expect(detail.addedByBranchCode).toBeNull();
    expect(detail.usage).toEqual([]);
  });

  test('lyrics map every section, missing ones as null', () => {
    const rows = rowsFor(thousandHallelujahs);
    const detail = assembleSongDetail({
      ...rows,
      song: { ...rows.song, verse2Lyrics: null, bridgeLyrics: null },
    });
    expect(detail.lyrics).toEqual({
      ...thousandHallelujahs.lyrics,
      verse_2: null,
      bridge: null,
    });
  });

  test('returns copies of the row arrays', () => {
    const rows = rowsFor(thousandHallelujahs);
    const detail = assembleSongDetail(rows);
    expect(detail.altTitles).not.toBe(rows.song.altTitles);
    expect(detail.arrangement).not.toBe(rows.song.arrangement);
  });
});

describe('sortKeys', () => {
  test('primary first, then alphabetical', () => {
    const keys = [
      { key: 'E', isPrimary: false },
      { key: 'Db', isPrimary: false },
      { key: 'F', isPrimary: true },
      { key: 'D', isPrimary: false },
      { key: 'D', isPrimary: false },
    ];
    expect(sortKeys(keys).map((k) => k.key)).toEqual(['F', 'D', 'D', 'Db', 'E']);
  });
});

describe('fillUsage', () => {
  test('one entry per branch in branch order; missing rows read none/manual', () => {
    const [sv, or, co] = branches;
    expect(
      fillUsage(
        [
          { branchId: co!.id, level: 'high', source: 'derived' },
          { branchId: sv!.id, level: 'rare', source: 'manual' },
        ],
        [sv!, or!, co!],
      ),
    ).toEqual([
      { branchId: sv!.id, branchCode: 'SV', level: 'rare', source: 'manual' },
      { branchId: or!.id, branchCode: 'OR', level: 'none', source: 'manual' },
      { branchId: co!.id, branchCode: 'CO', level: 'high', source: 'derived' },
    ]);
  });
});

describe('summaries', () => {
  test('toSongSummary matches the fixtures helper', () => {
    const detail = assembleSongDetail(rowsFor(thousandHallelujahs));
    expect(toSongSummary(detail)).toEqual(toSummary(normalized(thousandHallelujahs)));
  });

  test('assembleSongSummary builds the same shape from summary rows', () => {
    const rows = rowsFor(thousandHallelujahs);
    expect(
      assembleSongSummary({
        song: rows.song,
        primaryKey: 'D',
        composers: rows.composers,
        addedByBranchCode: 'OR',
        resourceCount: 15,
      }),
    ).toEqual(toSummary(normalized(thousandHallelujahs)));
  });
});
