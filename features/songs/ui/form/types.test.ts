import { describe, expect, expectTypeOf, it } from 'vitest';
import { songs, thousandHallelujahs } from '@/fixtures';
import type { UUID } from '@/types/domain';
import {
  songInputSchema,
  songKeyInputSchema,
  usageInputSchema,
  type SongInput,
  type SongKeyInput,
  type UsageInput,
} from '@/types/validation';
import { BASIC_LIMITS, basicInfoFromSong, emptyBasicInfo, type SongFormValue } from './types';

describe('SongFormValue matches the validation schemas', () => {
  it('basic fields line up with SongInput', () => {
    type Basic = SongFormValue['basic'];
    expectTypeOf<Basic['title']>().toEqualTypeOf<SongInput['title']>();
    expectTypeOf<Basic['altTitles']>().toEqualTypeOf<SongInput['altTitles']>();
    expectTypeOf<Basic['sourceGroup']>().toEqualTypeOf<SongInput['sourceGroup']>();
    expectTypeOf<Basic['year']>().toEqualTypeOf<SongInput['year']>();
    expectTypeOf<Basic['composers'][number]['id']>().toEqualTypeOf<UUID>();
    expectTypeOf<UUID[]>().toEqualTypeOf<SongInput['composerIds']>();
  });

  it('other slices line up with their schemas', () => {
    type Musical = SongFormValue['musical'];
    expectTypeOf<Musical['tempoBpm']>().toEqualTypeOf<SongInput['tempoBpm']>();
    expectTypeOf<Musical['timeSignature']>().toEqualTypeOf<SongInput['timeSignature']>();
    expectTypeOf<Musical['energyLevel']>().toEqualTypeOf<SongInput['energyLevel']>();
    expectTypeOf<Musical['energyNotes']>().toEqualTypeOf<SongInput['energyNotes']>();
    expectTypeOf<Musical['keys'][number]['key']>().toEqualTypeOf<SongKeyInput['key']>();
    expectTypeOf<Musical['keys'][number]['isPrimary']>().toEqualTypeOf<SongKeyInput['isPrimary']>();
    expectTypeOf<SongFormValue['lyrics']['arrangement']>().toEqualTypeOf<
      SongInput['arrangement']
    >();
    expectTypeOf<SongFormValue['usage']>().toEqualTypeOf<UsageInput>();
  });
});

describe('BASIC_LIMITS', () => {
  it('agrees with songInputSchema', () => {
    const base = { title: 'T', composerIds: [thousandHallelujahs.composers[0]?.id] };
    const ok = (patch: Record<string, unknown>) =>
      songInputSchema.safeParse({ ...base, ...patch }).success;
    const id = (i: number) => `30000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
    const ids = (n: number) => Array.from({ length: n }, (_, i) => id(i));

    expect(ok({ title: 'x'.repeat(BASIC_LIMITS.titleMax) })).toBe(true);
    expect(ok({ title: 'x'.repeat(BASIC_LIMITS.titleMax + 1) })).toBe(false);
    expect(ok({ altTitles: Array(BASIC_LIMITS.altTitlesMax).fill('a') })).toBe(true);
    expect(ok({ altTitles: Array(BASIC_LIMITS.altTitlesMax + 1).fill('a') })).toBe(false);
    expect(ok({ altTitles: ['x'.repeat(BASIC_LIMITS.altTitleMax + 1)] })).toBe(false);
    expect(ok({ composerIds: ids(BASIC_LIMITS.composersMin - 1) })).toBe(false);
    expect(ok({ composerIds: ids(BASIC_LIMITS.composersMax) })).toBe(true);
    expect(ok({ composerIds: ids(BASIC_LIMITS.composersMax + 1) })).toBe(false);
    expect(ok({ sourceGroup: 'x'.repeat(BASIC_LIMITS.sourceGroupMax) })).toBe(true);
    expect(ok({ sourceGroup: 'x'.repeat(BASIC_LIMITS.sourceGroupMax + 1) })).toBe(false);
    expect(ok({ year: BASIC_LIMITS.yearMin })).toBe(true);
    expect(ok({ year: BASIC_LIMITS.yearMin - 1 })).toBe(false);
    expect(ok({ year: BASIC_LIMITS.yearMax })).toBe(true);
    expect(ok({ year: BASIC_LIMITS.yearMax + 1 })).toBe(false);
  });
});

describe('emptyBasicInfo', () => {
  it('is blank and fresh on every call', () => {
    const a = emptyBasicInfo();
    expect(a).toEqual({ title: '', altTitles: [], composers: [], sourceGroup: null, year: null });
    a.altTitles.push('x');
    expect(emptyBasicInfo().altTitles).toEqual([]);
  });
});

describe('basicInfoFromSong', () => {
  it('copies the basic fields of every fixture song into valid song input', () => {
    for (const song of songs) {
      const basic = basicInfoFromSong(song);
      expect(basic.title).toBe(song.title);
      expect(basic.composers).toEqual(song.composers);
      expect(basic.composers).not.toBe(song.composers);
      expect(basic.altTitles).not.toBe(song.altTitles);
      const parsed = songInputSchema.safeParse({
        title: basic.title,
        altTitles: basic.altTitles,
        composerIds: basic.composers.map((c) => c.id),
        sourceGroup: basic.sourceGroup,
        year: basic.year,
      });
      expect(parsed.success).toBe(true);
    }
  });
});

describe('other slices', () => {
  it('accept schema-shaped values', () => {
    const key: SongFormValue['musical']['keys'][number] = {
      key: 'D',
      isPrimary: true,
      firstChords: { intro: 'D', verse: null, chorus: 'G', bridge: null },
    };
    expect(songKeyInputSchema.safeParse(key).success).toBe(true);
    const usage: SongFormValue['usage'] = [];
    expect(usageInputSchema.safeParse(usage).success).toBe(true);
  });
});
