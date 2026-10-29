import { describe, expect, expectTypeOf, it } from 'vitest';
import type { z } from 'zod';

import {
  AUTH_PROVIDERS,
  CHORD_SLOTS,
  ENERGY_LEVELS,
  KEYED_KINDS,
  KIND_FORMATS,
  LIST_TYPES,
  POP_MEMBER,
  RESOURCE_FORMATS,
  RESOURCE_KINDS,
  ROLES,
  SECTIONS,
  USAGE_LEVELS,
  USAGE_SOURCES,
} from '@/types/domain';
import type {
  AppUser,
  Branch,
  List,
  ListItem,
  SongDetail,
  SongSummary,
  Theme,
} from '@/types/domain';
import {
  listInputSchema,
  listItemPatchSchema,
  resourceLinkInputSchema,
  songInputSchema,
  songKeysInputSchema,
  themeNameSchema,
  uploadRequestSchema,
  usageInputSchema,
} from '@/types/validation';

import {
  BRANCH_IDS,
  LIST_IDS,
  SONG_IDS,
  branches,
  composers,
  getItemsForList,
  getList,
  getSong,
  listItems,
  lists,
  resources,
  songSummaries,
  songs,
  themes,
  thousandHallelujahs,
  toSummary,
  users,
} from './index';
import type {
  appUserSchema,
  branchSchema,
  listItemSchema,
  listSchema,
  songDetailSchema,
  themeSchema,
} from './schemas';

const firstLine = (text: string | null) =>
  text
    ?.split('\n')
    .map((l) => l.trim())
    .find((l) => l.length > 0) ?? null;

describe('schemas mirror the domain types', () => {
  it('have output types equal to the interfaces', () => {
    expectTypeOf<z.output<typeof songDetailSchema>>().toEqualTypeOf<SongDetail>();
    expectTypeOf<z.output<typeof branchSchema>>().toEqualTypeOf<Branch>();
    expectTypeOf<z.output<typeof appUserSchema>>().toEqualTypeOf<AppUser>();
    expectTypeOf<z.output<typeof themeSchema>>().toEqualTypeOf<Theme>();
    expectTypeOf<z.output<typeof listSchema>>().toEqualTypeOf<List>();
    expectTypeOf<z.output<typeof listItemSchema>>().toEqualTypeOf<ListItem>();
  });
});

describe('ids', () => {
  it('are unique across every entity', () => {
    const ids = [
      ...branches.map((b) => b.id),
      ...users.map((u) => u.id),
      ...themes.map((t) => t.id),
      ...composers.map((c) => c.id),
      ...songs.map((s) => s.id),
      ...songs.flatMap((s) => s.keys.map((k) => k.id)),
      ...resources.map((r) => r.id),
      ...lists.map((l) => l.id),
      ...listItems.map((i) => i.id),
    ];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('named id constants resolve', () => {
    for (const id of Object.values(SONG_IDS)) expect(getSong(id).id).toBe(id);
    for (const id of Object.values(LIST_IDS)) expect(getList(id).id).toBe(id);
    expect(Object.values(BRANCH_IDS)).toEqual(branches.map((b) => b.id));
    expect(() => getSong(LIST_IDS.bg41926)).toThrow(/No song/);
  });
});

describe('branches', () => {
  it('are the four from the spec', () => {
    expect(branches.map((b) => [b.name, b.code])).toEqual([
      ['Servant', 'SV'],
      ['Portland', 'OR'],
      ['CO Springs', 'CO'],
      ['Rockford', 'RF'],
    ]);
  });
});

describe('users', () => {
  it('reference real branches and use example.com addresses', () => {
    for (const u of users) {
      if (u.branchId) expect(branches.some((b) => b.id === u.branchId)).toBe(true);
      expect(u.email).toMatch(/@example\.com$/);
    }
  });
});

describe('themes', () => {
  it('has about 40 unique, normalized names', () => {
    expect(themes.length).toBeGreaterThanOrEqual(35);
    expect(themes.length).toBeLessThanOrEqual(45);
    expect(new Set(themes.map((t) => t.name)).size).toBe(themes.length);
    for (const t of themes) expect(themeNameSchema.parse(t.name)).toBe(t.name);
  });
});

describe('songs', () => {
  it('has 12 songs including the Diagram III list', () => {
    expect(songs).toHaveLength(12);
    const titles = songs.map((s) => s.title);
    for (const t of [
      'A Thousand Hallelujahs',
      '10000 Reasons',
      'Agnus Dei',
      'Cause to Celebrate',
      'Be the Center',
      'The Lord Almighty Reigns',
      'Lord You Are Worthy',
      'Revive This Land',
    ]) {
      expect(titles).toContain(t);
    }
  });

  it.each(songs.map((s) => [s.title, s] as const))('%s passes songInputSchema', (_t, s) => {
    const result = songInputSchema.safeParse({
      title: s.title,
      altTitles: s.altTitles,
      composerIds: s.composers.map((c) => c.id),
      sourceGroup: s.sourceGroup,
      year: s.year,
      tempoBpm: s.tempoBpm,
      timeSignature: s.timeSignature,
      energyLevel: s.energyLevel,
      energyNotes: s.energyNotes,
      lyrics: s.lyrics,
      arrangement: s.arrangement,
      addedByBranchId: s.addedByBranchId,
    });
    expect(result.error?.issues).toBeUndefined();
  });

  it.each(songs.map((s) => [s.title, s] as const))('%s passes songKeysInputSchema', (_t, s) => {
    const result = songKeysInputSchema.safeParse(
      s.keys.map(({ key, isPrimary, firstChords }) => ({ key, isPrimary, firstChords })),
    );
    expect(result.error?.issues).toBeUndefined();
  });

  it.each(songs.map((s) => [s.title, s] as const))('%s is internally consistent', (_t, s) => {
    // arrangement only uses sections with lyrics
    for (const section of s.arrangement) expect(s.lyrics[section]?.trim()).toBeTruthy();

    // derived lines
    expect(s.chorusLine).toBe(firstLine(s.lyrics.chorus));
    expect(s.verse1Line).toBe(firstLine(s.lyrics.verse_1));

    // keys: belong to the song, primary first then alphabetical
    expect(s.keys.every((k) => k.songId === s.id)).toBe(true);
    const [primary, ...rest] = s.keys;
    expect(primary?.isPrimary).toBe(true);
    expect(rest.map((k) => k.key)).toEqual(rest.map((k) => k.key).sort());
    expect(s.primaryKey).toBe(primary?.key);

    // summary fields agree with the detail
    expect(s.resourceCount).toBe(s.resources.length);
    expect(s.addedByBranchCode).toBe(
      branches.find((b) => b.id === s.addedByBranchId)?.code ?? null,
    );
    if (s.createdBy) expect(users.some((u) => u.id === s.createdBy)).toBe(true);
    expect(Date.parse(s.updatedAt)).toBeGreaterThanOrEqual(Date.parse(s.createdAt));

    // themes resolve to the vocabulary, no duplicate (section, theme)
    for (const { theme } of s.themes) expect(themes).toContainEqual(theme);
    const pairs = s.themes.map((t) => `${t.section}:${t.theme.id}`);
    expect(new Set(pairs).size).toBe(pairs.length);
    for (const { section } of s.themes) expect(s.lyrics[section]).toBeTruthy();

    // usage: one row per branch, in branch order
    expect(s.usage.map((u) => [u.branchId, u.branchCode])).toEqual(
      branches.map((b) => [b.id, b.code]),
    );
    expect(usageInputSchema.safeParse(s.usage).success).toBe(true);
  });

  it.each(songs.map((s) => [s.title, s] as const))('%s resources are valid', (_t, s) => {
    const keyIds = new Set(s.keys.map((k) => k.id));
    for (const r of s.resources) {
      expect(r.songId).toBe(s.id);
      expect(KIND_FORMATS[r.kind]).toContain(r.format);
      expect(r.songKeyId === null).toBe(r.kind === 'projection');
      expect(KEYED_KINDS.includes(r.kind)).toBe(r.kind !== 'projection');
      if (r.songKeyId) expect(keyIds.has(r.songKeyId)).toBe(true);
      if (r.format === 'url') {
        expect(r.url).not.toBeNull();
        expect(r.storagePath).toBeNull();
        const link = resourceLinkInputSchema.safeParse(r);
        expect(link.error?.issues).toBeUndefined();
      } else {
        expect(r.url).toBeNull();
        expect(r.storagePath).toBe(`songs/${s.id}/${r.songKeyId ?? 'common'}/${r.id}.${r.format}`);
        const upload = uploadRequestSchema.safeParse(r);
        expect(upload.error?.issues).toBeUndefined();
      }
    }
  });

  it('shares composer records between songs', () => {
    for (const s of songs) {
      for (const c of s.composers) expect(composers.find((x) => x.id === c.id)).toEqual(c);
    }
    expect(new Set(composers.map((c) => c.name.toLowerCase())).size).toBe(composers.length);
  });

  it('stores at most the first line of real lyrics', () => {
    for (const s of songs) {
      for (const text of Object.values(s.lyrics)) {
        if (text === null) continue;
        const [, ...others] = text.split('\n').filter((l) => l.trim());
        for (const line of others) expect(line).toMatch(/^\(.*placeholder\)$/);
      }
    }
  });
});

describe('required cases', () => {
  it('has a song with all five verses', () => {
    const verses = ['verse_1', 'verse_2', 'verse_3', 'verse_4', 'verse_5'] as const;
    expect(songs.some((s) => verses.every((v) => s.lyrics[v]))).toBe(true);
  });

  it('has a song with no bridge', () => {
    expect(songs.some((s) => s.lyrics.bridge === null && !s.arrangement.includes('bridge'))).toBe(
      true,
    );
  });

  it('has a song with no files', () => {
    expect(songs.some((s) => s.resources.length === 0 && s.resourceCount === 0)).toBe(true);
  });

  it('has POP composers, past and current', () => {
    const members = new Set(songs.flatMap((s) => s.composers.map((c) => c.popMember)));
    expect(members).toContain('past');
    expect(members).toContain('current');
  });
});

describe('"A Thousand Hallelujahs" matches Diagram I', () => {
  const s = thousandHallelujahs;

  it('basic info', () => {
    expect(s.title).toBe('A Thousand Hallelujahs');
    expect(s.altTitles).toContain('1000 Hallelujahs');
    expect(s.composers.map((c) => c.name)).toEqual(['Brooke Ligertwood']);
    expect(s.sourceGroup).toBe('Hillsong');
    expect(s.year).toBe(2021);
  });

  it('musical tags', () => {
    expect(s.keys.map((k) => k.key)).toEqual(['D', 'Db', 'E']);
    expect(s.keys[0]?.firstChords).toEqual({ intro: 'D', verse: 'D', chorus: 'G', bridge: 'D' });
    expect(s.tempoBpm).toBe(68);
    expect(s.timeSignature).toBe('4/4');
    expect(s.energyLevel).toBe('mid_worship');
    expect(s.energyNotes).toMatch(/slow build/i);
  });

  it('themes per section', () => {
    const bySection = (section: string) =>
      s.themes.filter((t) => t.section === section).map((t) => t.theme.name);
    expect(bySection('chorus')).toEqual(['glory', 'honor', 'forever', 'jesus']);
    expect(bySection('verse_1')).toEqual(['rocks cry out', 'creation']);
    expect(bySection('verse_2')).toEqual(['redemption', 'resurrection', 'eternity']);
    expect(bySection('bridge')).toEqual(['praise', 'lamb', 'king', 'risen', 'reigns']);
  });

  it('who added / branch usage', () => {
    expect(s.addedByBranchCode).toBe('OR');
    expect(s.usage.map((u) => [u.branchCode, u.level])).toEqual([
      ['SV', 'high'],
      ['OR', 'low'],
      ['CO', 'low'],
      ['RF', 'rare'],
    ]);
  });

  it('resources per key and projection', () => {
    const keyOf = (id: string | null) => s.keys.find((k) => k.id === id)?.key ?? 'projection';
    const count = (key: string) => s.resources.filter((r) => keyOf(r.songKeyId) === key).length;
    expect(count('D')).toBe(9);
    expect(count('Db')).toBe(1);
    expect(count('E')).toBe(2);
    expect(s.resources.filter((r) => r.kind === 'projection').map((r) => r.format)).toEqual([
      'pro',
      'mdb',
      'ppt',
    ]);
  });
});

describe('lists', () => {
  it.each(lists.map((l) => [l.name, l] as const))('%s is valid', (_n, l) => {
    expect(listInputSchema.safeParse(l).success).toBe(true);
    const owner = users.find((u) => u.id === l.ownerId);
    expect(owner?.name).toBe(l.ownerName);
    expect(l.branchId).toBe(owner?.branchId ?? null);
    expect(l.branchCode).toBe(branches.find((b) => b.id === l.branchId)?.code ?? null);
    const items = getItemsForList(l.id);
    expect(l.itemCount).toBe(items.length);
    expect(items.map((i) => i.position)).toEqual(items.map((_, i) => i));
  });

  it('items reference existing songs and resources', () => {
    for (const item of listItems) {
      expect(lists.some((l) => l.id === item.listId)).toBe(true);
      const song = getSong(item.songId);
      expect(listItemPatchSchema.safeParse(item).success).toBe(true);
      if (item.resourceId) {
        const r = song.resources.find((x) => x.id === item.resourceId);
        expect(r && ['audio', 'video_link'].includes(r.kind)).toBe(true);
      }
    }
  });

  it('setlist "BG 4/19/26" matches Diagram III and overrides to a key with no song_keys row', () => {
    const bg = getList(LIST_IDS.bg41926);
    expect(bg).toMatchObject({ type: 'setlist', name: 'BG 4/19/26', eventDate: '2026-04-19' });
    const items = getItemsForList(bg.id);
    expect(items.map((i) => getSong(i.songId).title)).toEqual([
      'Cause to Celebrate',
      'Holy Spirit',
      'Be the Center',
      'A Thousand Hallelujahs',
    ]);
    const overridden = items.filter((i) => i.overrideKey !== null);
    expect(overridden.length).toBeGreaterThan(0);
    for (const i of overridden) {
      const song = getSong(i.songId);
      expect(song.keys.some((k) => k.key === i.overrideKey)).toBe(false);
    }
  });

  it('playlist "Background 1" has audio items', () => {
    const bg1 = getList(LIST_IDS.background1);
    expect(bg1).toMatchObject({ type: 'playlist', name: 'Background 1', eventDate: null });
    const items = getItemsForList(bg1.id);
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((i) => i.resourceId !== null)).toBe(true);
  });
});

describe('enum coverage', () => {
  const seen = <T extends string>(values: Iterable<T>) => new Set<string>(values);

  it('every enum value appears at least once', () => {
    const allResources = songs.flatMap((s) => s.resources);
    const coverage: Array<[readonly string[], Set<string>]> = [
      [ROLES, seen(users.map((u) => u.role))],
      [AUTH_PROVIDERS, seen(users.map((u) => u.authProvider))],
      [ENERGY_LEVELS, seen(songs.flatMap((s) => (s.energyLevel ? [s.energyLevel] : [])))],
      [
        SECTIONS,
        seen(
          songs.flatMap((s) =>
            SECTIONS.filter((sec) => s.lyrics[sec] && s.arrangement.includes(sec)),
          ),
        ),
      ],
      [SECTIONS, seen(songs.flatMap((s) => s.themes.map((t) => t.section)))],
      [
        CHORD_SLOTS,
        seen(
          songs.flatMap((s) => s.keys.flatMap((k) => CHORD_SLOTS.filter((c) => k.firstChords[c]))),
        ),
      ],
      [USAGE_LEVELS, seen(songs.flatMap((s) => s.usage.map((u) => u.level)))],
      [USAGE_SOURCES, seen(songs.flatMap((s) => s.usage.map((u) => u.source)))],
      [POP_MEMBER, seen(composers.map((c) => c.popMember))],
      [RESOURCE_KINDS, seen(allResources.map((r) => r.kind))],
      [RESOURCE_FORMATS, seen(allResources.map((r) => r.format))],
      [LIST_TYPES, seen(lists.map((l) => l.type))],
    ];
    for (const [values, found] of coverage) {
      for (const v of values) expect(found, v).toContain(v);
    }
  });
});

describe('toSummary', () => {
  it('derives exactly the SongSummary fields', () => {
    const summary = toSummary(thousandHallelujahs);
    expect(summary).toStrictEqual({
      id: SONG_IDS.thousandHallelujahs,
      title: 'A Thousand Hallelujahs',
      year: 2021,
      tempoBpm: 68,
      timeSignature: '4/4',
      energyLevel: 'mid_worship',
      primaryKey: 'D',
      composers: [{ name: 'Brooke Ligertwood', popMember: 'none' }],
      addedByBranchCode: 'OR',
      resourceCount: 15,
      createdAt: thousandHallelujahs.createdAt,
    } satisfies SongSummary);
  });

  it('finds the primary key wherever it is and counts resources', () => {
    const s = getSong(SONG_IDS.beTheCenter);
    const reordered: SongDetail = {
      ...s,
      keys: [...s.keys].reverse(),
      resources: s.resources.slice(1),
      resourceCount: 999,
    };
    const summary = toSummary(reordered);
    expect(summary.primaryKey).toBe('D');
    expect(summary.resourceCount).toBe(s.resources.length - 1);
  });

  it('returns null primaryKey when there are no keys', () => {
    expect(toSummary({ ...thousandHallelujahs, keys: [] }).primaryKey).toBeNull();
  });

  it('matches the summary fields stored on every detail', () => {
    songs.forEach((s, i) => {
      const summary = songSummaries[i];
      expect(summary).toBeDefined();
      for (const [k, v] of Object.entries(summary ?? {})) {
        const stored = s[k as keyof SongSummary];
        if (k === 'composers') {
          expect(v).toEqual(s.composers.map(({ name, popMember }) => ({ name, popMember })));
        } else {
          expect(v, k).toEqual(stored);
        }
      }
    });
  });
});
