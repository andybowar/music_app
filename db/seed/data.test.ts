import { describe, expect, test } from 'vitest';

import { branches, composers, listItems, lists, songs, themes, users } from '@/fixtures';
import { ROLES } from '@/types/domain';

import { buildSeedData, buildUsers } from './data';

describe('buildUsers', () => {
  const seeded = buildUsers();

  test('keeps every fixture user unchanged, first', () => {
    expect(seeded.slice(0, users.length)).toEqual(users);
  });

  test('has an active user for every role in every branch', () => {
    for (const b of branches) {
      for (const role of ROLES) {
        const match = seeded.filter((u) => u.branchId === b.id && u.role === role && !u.disabledAt);
        expect(match.length, `${b.code} ${role}`).toBeGreaterThanOrEqual(1);
      }
    }
  });

  test('only adds users for uncovered pairs, with unique ids and emails', () => {
    const generated = seeded.slice(users.length);
    const fixturePairs = users.filter((u) => !u.disabledAt && u.branchId).length;
    expect(generated).toHaveLength(branches.length * ROLES.length - fixturePairs);
    expect(new Set(seeded.map((u) => u.id)).size).toBe(seeded.length);
    expect(new Set(seeded.map((u) => u.email)).size).toBe(seeded.length);
    for (const u of generated) {
      expect(u.email).toMatch(/^[a-z-]+\.[a-z]{2,3}@example\.com$/);
      expect(u.authProvider).toBe('password');
    }
  });

  test('is deterministic', () => {
    expect(buildUsers()).toEqual(seeded);
  });
});

describe('buildSeedData', () => {
  const data = buildSeedData();

  test('row counts follow the fixtures', () => {
    expect(data.branches).toHaveLength(branches.length);
    expect(data.composers).toHaveLength(composers.length);
    expect(data.themes).toHaveLength(themes.length);
    expect(data.songs).toHaveLength(songs.length);
    expect(data.songKeys).toHaveLength(songs.flatMap((s) => s.keys).length);
    expect(data.resources).toHaveLength(songs.flatMap((s) => s.resources).length);
    expect(data.songComposers).toHaveLength(songs.flatMap((s) => s.composers).length);
    expect(data.songThemes).toHaveLength(songs.flatMap((s) => s.themes).length);
    expect(data.branchUsage).toHaveLength(songs.flatMap((s) => s.usage).length);
    expect(data.lists).toHaveLength(lists.length);
    expect(data.listItems).toHaveLength(listItems.length);
  });

  test('never writes trigger-maintained song columns', () => {
    for (const row of data.songs) {
      for (const derived of [
        'chorusLine',
        'verse1Line',
        'composerNames',
        'themeNames',
        'searchVector',
      ]) {
        expect(row).not.toHaveProperty(derived);
      }
    }
  });

  test('maps lyric sections and first chords onto their columns', () => {
    const song = songs[0]!;
    const row = data.songs.find((r) => r.id === song.id)!;
    expect(row.chorusLyrics).toBe(song.lyrics.chorus);
    expect(row.verse1Lyrics).toBe(song.lyrics.verse_1);
    expect(row.bridgeLyrics).toBe(song.lyrics.bridge);
    const key = song.keys[0]!;
    expect(data.songKeys.find((k) => k.id === key.id)).toMatchObject({
      introChord: key.firstChords.intro,
      verseChord: key.firstChords.verse,
      chorusChord: key.firstChords.chorus,
      bridgeChord: key.firstChords.bridge,
    });
  });

  test('composer sort order follows the song', () => {
    const song = songs.find((s) => s.composers.length > 1)!;
    expect(data.songComposers.filter((c) => c.songId === song.id).map((c) => c.composerId)).toEqual(
      song.composers.map((c) => c.id),
    );
  });
});
