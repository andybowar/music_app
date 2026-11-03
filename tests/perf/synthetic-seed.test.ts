// @vitest-environment node
import { describe, expect, test } from 'vitest';

import { KIND_FORMATS } from '@/types/domain';

import {
  createRng,
  generateSyntheticLibrary,
  SYNTHETIC_ID_PREFIX,
  SYNTHETIC_SOURCE_GROUP,
  syntheticId,
  syntheticIdRange,
} from './synthetic-seed';

const branchIds = ['10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002'];
const themeIds = Array.from(
  { length: 10 },
  (_, i) => `20000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
);
const lib = generateSyntheticLibrary({ count: 300, branchIds, themeIds });

describe('syntheticId', () => {
  test('is a uuid inside its range', () => {
    const id = syntheticId('song', 5000);
    expect(id).toBe('ffff0001-0000-4000-8000-000000001388');
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/);
    const [lo, hi] = syntheticIdRange('song');
    expect(id > lo && id < hi).toBe(true);
    expect(syntheticId('composer', 1) > hi).toBe(true);
  });
});

describe('createRng', () => {
  test('is deterministic and in [0, 1)', () => {
    const a = createRng(1);
    const b = createRng(1);
    const xs = Array.from({ length: 1000 }, () => a());
    expect(xs).toEqual(Array.from({ length: 1000 }, () => b()));
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
    expect(createRng(2)()).not.toBe(xs[0]);
  });
});

describe('generateSyntheticLibrary', () => {
  test('same options give the same library', () => {
    expect(generateSyntheticLibrary({ count: 300, branchIds, themeIds })).toEqual(lib);
    expect(generateSyntheticLibrary({ count: 300, branchIds, themeIds, seed: 12 })).not.toEqual(
      lib,
    );
  });

  test('songs are scoped and valid', () => {
    expect(lib.songs).toHaveLength(300);
    expect(new Set(lib.songs.map((s) => s.id)).size).toBe(300);
    for (const s of lib.songs) {
      expect(s.id!.startsWith(SYNTHETIC_ID_PREFIX.song)).toBe(true);
      expect(s.sourceGroup).toBe(SYNTHETIC_SOURCE_GROUP);
      expect(s.title.length).toBeGreaterThan(0);
      expect(s.title.length).toBeLessThanOrEqual(200);
      if (s.year != null) expect(s.year).toBeGreaterThanOrEqual(1950);
      if (s.tempoBpm != null) expect(s.tempoBpm).toBeGreaterThanOrEqual(20);
      if (s.timeSignature != null) expect(s.timeSignature).toMatch(/^\d{1,2}\/\d{1,2}$/);
      expect(s.chorusLyrics).toBeTruthy();
      expect(s.verse1Lyrics).toBeTruthy();
      expect(s.arrangement!.length).toBeGreaterThan(0);
      if (s.addedByBranchId) expect(branchIds).toContain(s.addedByBranchId);
    }
    // Some variety: soft-deleted songs, alternate titles, missing energy.
    expect(lib.songs.some((s) => s.deletedAt)).toBe(true);
    expect(lib.songs.some((s) => s.altTitles!.length > 0)).toBe(true);
    expect(lib.songs.some((s) => s.energyLevel === null)).toBe(true);
  });

  test('composers are unique by name and linked 1-3 per song', () => {
    const names = lib.composers.map((c) => c.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
    const ids = new Set(lib.composers.map((c) => c.id));
    const perSong = new Map<string, number>();
    for (const l of lib.songComposers) {
      expect(ids.has(l.composerId)).toBe(true);
      perSong.set(l.songId, (perSong.get(l.songId) ?? 0) + 1);
    }
    expect([...perSong.values()].every((n) => n >= 1 && n <= 3)).toBe(true);
    const pairs = lib.songComposers.map((l) => `${l.songId}|${l.composerId}`);
    expect(new Set(pairs).size).toBe(pairs.length);
  });

  test('keys: valid names, one primary per song, unique per song', () => {
    const primaries = new Map<string, number>();
    const pairs = new Set<string>();
    for (const k of lib.songKeys) {
      expect(k.key).toMatch(/^[A-G](#|b)?m?$/);
      expect(pairs.has(`${k.songId}|${k.key}`)).toBe(false);
      pairs.add(`${k.songId}|${k.key}`);
      if (k.isPrimary) primaries.set(k.songId, (primaries.get(k.songId) ?? 0) + 1);
    }
    expect(primaries.size).toBe(300);
    expect([...primaries.values()].every((n) => n === 1)).toBe(true);
  });

  test('themes: known ids, unique (song, theme, section)', () => {
    const triples = lib.songThemes.map((t) => `${t.songId}|${t.themeId}|${t.section}`);
    expect(new Set(triples).size).toBe(triples.length);
    expect(lib.songThemes.every((t) => themeIds.includes(t.themeId))).toBe(true);
  });

  test('resources satisfy the table checks', () => {
    const keyById = new Map(lib.songKeys.map((k) => [k.id, k]));
    expect(lib.resources.length).toBeGreaterThan(300);
    for (const r of lib.resources) {
      expect(KIND_FORMATS[r.kind]).toContain(r.format);
      expect((r.storagePath == null) !== (r.url == null)).toBe(true);
      expect(r.format === 'url').toBe(r.url != null);
      expect(r.kind === 'projection').toBe(r.songKeyId == null);
      if (r.songKeyId) expect(keyById.get(r.songKeyId)?.songId).toBe(r.songId);
    }
  });

  test('branch usage: known branches, at most one row per song and branch', () => {
    const pairs = lib.branchUsage.map((u) => `${u.songId}|${u.branchId}`);
    expect(new Set(pairs).size).toBe(pairs.length);
    expect(lib.branchUsage.every((u) => branchIds.includes(u.branchId))).toBe(true);
  });

  test('no branches or themes: songs still generate', () => {
    const bare = generateSyntheticLibrary({ count: 5, branchIds: [], themeIds: [] });
    expect(bare.songs).toHaveLength(5);
    expect(bare.songs.every((s) => s.addedByBranchId === null)).toBe(true);
    expect(bare.songThemes).toEqual([]);
    expect(bare.branchUsage).toEqual([]);
  });
});
