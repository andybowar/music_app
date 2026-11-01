import { describe, expect, it, vi } from 'vitest';

import { BRANCH_IDS, composers, getSong, SONG_IDS, thousandHallelujahs } from '@/fixtures';
import type { ActionResult, SongKey } from '@/types/domain';
import { songInputSchema, songKeysInputSchema, usageInputSchema } from '@/types/validation';

import {
  emptySongFormValue,
  FORM_MESSAGES,
  keyErrorsToForm,
  mergeErrors,
  saveSong,
  songErrorsToForm,
  songFormValueFromSong,
  tabForErrorKey,
  tabsWithErrors,
  themeErrorsToForm,
  toKeysInput,
  toSongInput,
  toThemeEntries,
  toUsageInput,
  usageErrorsToForm,
  validateSongForm,
  withSavedKeyIds,
  type SongSaveActions,
} from './toInput';
import type { SongFormValue } from './types';

const NEW_ID = '40000000-0000-4000-8000-0000000000aa';
const ok = <T>(data: T): ActionResult<T> => ({ ok: true, data });
const fail = (
  code: 'VALIDATION' | 'CONFLICT' | 'NOT_FOUND' | 'INTERNAL',
  message: string,
  fieldErrors?: Record<string, string[]>,
) => ({ ok: false as const, error: { code, message, ...(fieldErrors ? { fieldErrors } : {}) } });

/** A minimal valid new song. */
function newSong(): SongFormValue {
  const v = emptySongFormValue();
  v.basic.title = '  1000 Hallelujahs ';
  v.basic.composers = [composers[0]!];
  v.musical.keys = [
    {
      key: 'D',
      isPrimary: true,
      firstChords: { intro: 'D', verse: null, chorus: 'G', bridge: null },
    },
  ];
  return v;
}

function fakeActions(overrides: Partial<SongSaveActions> = {}) {
  const savedKeys: SongKey[] = [
    {
      id: '50000000-0000-4000-8000-0000000000a1',
      songId: NEW_ID,
      key: 'D',
      isPrimary: true,
      firstChords: { intro: 'D', verse: null, chorus: 'G', bridge: null },
    },
  ];
  return {
    createSong: vi.fn(async () => ok({ id: NEW_ID })),
    updateSong: vi.fn(async () => ok(undefined)),
    setSongKeys: vi.fn(async () => ok(savedKeys)),
    setSongThemes: vi.fn(async () => ok(undefined)),
    setBranchUsage: vi.fn(async () => ok(undefined)),
    ...overrides,
  } satisfies SongSaveActions;
}

describe('starting values', () => {
  it('empty value is blank and fresh each call', () => {
    const a = emptySongFormValue();
    expect(a).toEqual({
      basic: { title: '', altTitles: [], composers: [], sourceGroup: null, year: null },
      musical: {
        keys: [],
        tempoBpm: null,
        timeSignature: null,
        energyLevel: null,
        energyNotes: null,
      },
      lyrics: { lyrics: {}, arrangement: [] },
      themes: [],
      usage: [],
    });
    expect(emptySongFormValue()).not.toBe(a);
  });

  it('maps a song, keeping key ids, manual usage only and copies of themes', () => {
    const song = getSong(SONG_IDS.tenThousandReasons);
    const v = songFormValueFromSong(song);
    expect(v.basic.title).toBe(song.title);
    expect(v.musical.keys.map((k) => k.id)).toEqual(song.keys.map((k) => k.id));
    expect(v.usage).toEqual(
      song.usage
        .filter((u) => u.source === 'manual')
        .map(({ branchId, level }) => ({ branchId, level })),
    );
    expect(v.themes).toEqual(song.themes);
    expect(v.themes[0]?.theme).not.toBe(song.themes[0]?.theme);
  });
});

describe('toSongInput', () => {
  it('trims text, maps composers to ids and nulls blanks', () => {
    const v = newSong();
    v.basic.altTitles = [' A Thousand Hallelujahs ', '  '];
    v.basic.sourceGroup = '   ';
    v.basic.year = 2021;
    v.musical.tempoBpm = 68;
    v.musical.timeSignature = '4/4';
    v.musical.energyLevel = 'high_worship';
    v.musical.energyNotes = ' slow build ';
    v.lyrics = {
      lyrics: { chorus: 'Line one\nLine two', verse_1: '   ' },
      arrangement: ['chorus'],
    };
    const input = toSongInput(v);
    expect(input).toEqual({
      title: '1000 Hallelujahs',
      altTitles: ['A Thousand Hallelujahs'],
      composerIds: [composers[0]!.id],
      sourceGroup: null,
      year: 2021,
      tempoBpm: 68,
      timeSignature: '4/4',
      energyLevel: 'high_worship',
      energyNotes: 'slow build',
      lyrics: {
        chorus: 'Line one\nLine two',
        verse_1: null,
        verse_2: null,
        verse_3: null,
        verse_4: null,
        verse_5: null,
        bridge: null,
      },
      arrangement: ['chorus'],
    });
    expect(input).not.toHaveProperty('addedByBranchId');
    expect(songInputSchema.safeParse(input).success).toBe(true);
  });

  it('round-trips an existing song through the schema', () => {
    const input = toSongInput(songFormValueFromSong(thousandHallelujahs));
    expect(songInputSchema.safeParse(input).success).toBe(true);
    expect(input.composerIds).toEqual(thousandHallelujahs.composers.map((c) => c.id));
  });
});

describe('toKeysInput / toThemeEntries / toUsageInput', () => {
  it('omits missing ids and nulls blank chords', () => {
    const keys = [
      {
        key: 'D',
        isPrimary: true,
        firstChords: { intro: 'D', verse: '', chorus: ' G ', bridge: null },
      },
      {
        id: 'abc',
        key: 'E',
        isPrimary: false,
        firstChords: { intro: null, verse: null, chorus: null, bridge: 'E' },
      },
    ];
    const input = toKeysInput(keys);
    expect(input[0]).toEqual({
      key: 'D',
      isPrimary: true,
      firstChords: { intro: 'D', verse: null, chorus: 'G', bridge: null },
    });
    expect(input[0]).not.toHaveProperty('id');
    expect(input[1]?.id).toBe('abc');
  });

  it('existing keys pass the keys schema', () => {
    const v = songFormValueFromSong(thousandHallelujahs);
    expect(songKeysInputSchema.safeParse(toKeysInput(v.musical.keys)).success).toBe(true);
  });

  it('theme entries keep form order', () => {
    const v = songFormValueFromSong(thousandHallelujahs);
    expect(toThemeEntries(v.themes)).toEqual(
      thousandHallelujahs.themes.map((t) => ({ section: t.section, themeId: t.theme.id })),
    );
  });

  it('usage entries are plain copies', () => {
    const usage = [{ branchId: BRANCH_IDS.servant, level: 'high' as const }];
    const out = toUsageInput(usage);
    expect(out).toEqual(usage);
    expect(out[0]).not.toBe(usage[0]);
    expect(usageInputSchema.safeParse(out).success).toBe(true);
  });
});

describe('withSavedKeyIds', () => {
  it('copies ids by key name and leaves unmatched keys alone', () => {
    const keys = [
      {
        key: 'D',
        isPrimary: true,
        firstChords: { intro: null, verse: null, chorus: null, bridge: null },
      },
      {
        key: 'E',
        isPrimary: false,
        firstChords: { intro: null, verse: null, chorus: null, bridge: null },
      },
    ];
    const saved = [
      { id: 'k1', songId: NEW_ID, key: 'D', isPrimary: true, firstChords: keys[0]!.firstChords },
    ];
    const out = withSavedKeyIds(keys, saved);
    expect(out[0]?.id).toBe('k1');
    expect(out[1]).toBe(keys[1]);
  });
});

describe('validateSongForm', () => {
  it('passes a minimal song', () => {
    expect(validateSongForm(newSong())).toEqual({});
  });

  it('flags title, composers, keys and arrangement sections without lyrics', () => {
    const v = emptySongFormValue();
    v.basic.title = '  ';
    v.lyrics = {
      lyrics: { chorus: 'Sing', bridge: ' ' },
      arrangement: ['chorus', 'bridge', 'verse_2'],
    };
    const errors = validateSongForm(v);
    expect(errors.title).toEqual([FORM_MESSAGES.title]);
    expect(errors.composerIds).toEqual([FORM_MESSAGES.composers]);
    expect(errors.keys).toBeDefined();
    expect(errors['arrangement.0']).toBeUndefined();
    expect(errors['arrangement.1']).toEqual([FORM_MESSAGES.arrangement('the bridge')]);
    expect(errors['arrangement.2']).toEqual([FORM_MESSAGES.arrangement('verse 2')]);
  });
});

describe('error mapping', () => {
  it('song errors keep their paths; root and message-only errors go to form', () => {
    expect(
      songErrorsToForm(
        fail('VALIDATION', 'Invalid', { title: ['Too long'], '(root)': ['Bad'] }).error,
      ),
    ).toEqual({ title: ['Too long'], form: ['Bad'] });
    expect(songErrorsToForm(fail('NOT_FOUND', 'Song not found.').error)).toEqual({
      form: ['Song not found.'],
    });
  });

  it('key errors are prefixed with keys', () => {
    expect(
      keyErrorsToForm(
        fail('VALIDATION', 'Invalid', {
          '1.key': ['Duplicate key D'],
          '(root)': ['Exactly one key must be primary'],
          '0': ['Bad row'],
        }).error,
      ),
    ).toEqual({
      'keys.1.key': ['Duplicate key D'],
      keys: ['Exactly one key must be primary'],
      'keys.0': ['Bad row'],
    });
  });

  it('key conflicts show only the message', () => {
    expect(
      keyErrorsToForm(fail('CONFLICT', 'Remove the resources first', { D: ['Chord chart'] }).error),
    ).toEqual({ keys: ['Remove the resources first'] });
    expect(keyErrorsToForm(fail('VALIDATION', 'Invalid input.').error)).toEqual({
      keys: ['Invalid input.'],
    });
  });

  it('theme errors pass entries paths through and gather the rest', () => {
    expect(
      themeErrorsToForm(
        fail('VALIDATION', 'Some themes no longer exist.', {
          'entries.2.themeId': ['Unknown theme.'],
          songId: ['Bad id'],
        }).error,
      ),
    ).toEqual({ 'entries.2.themeId': ['Unknown theme.'], themes: ['Bad id'] });
    expect(themeErrorsToForm(fail('NOT_FOUND', 'Gone').error)).toEqual({ themes: ['Gone'] });
  });

  it('usage errors are prefixed with usage', () => {
    expect(
      usageErrorsToForm(
        fail('VALIDATION', 'Unknown branch.', { '0.branchId': ['Unknown branch.'], songId: ['x'] })
          .error,
      ),
    ).toEqual({ 'usage.0.branchId': ['Unknown branch.'], usage: ['x'] });
    expect(usageErrorsToForm(fail('INTERNAL', 'Oops').error)).toEqual({ usage: ['Oops'] });
  });

  it('mergeErrors concatenates messages per key and skips empty lists', () => {
    expect(mergeErrors({ a: ['1'], b: [] }, { a: ['2'] })).toEqual({ a: ['1', '2'] });
  });
});

describe('tabs', () => {
  it.each([
    ['title', 'basic'],
    ['composerIds', 'basic'],
    ['keys.0.firstChords.verse', 'musical'],
    ['tempoBpm', 'musical'],
    ['lyrics.chorus', 'lyrics'],
    ['arrangement.2', 'lyrics'],
    ['entries.1.themeId', 'themes'],
    ['usage.0.level', 'usage'],
    ['resources', 'files'],
    ['form', null],
    ['constructor', null],
    ['', null],
  ])('%s → %s', (key, tab) => {
    expect(tabForErrorKey(key)).toBe(tab);
  });

  it('lists tabs with errors in tab order', () => {
    expect(tabsWithErrors({ 'usage.0': ['x'], title: ['y'], form: ['z'], lyrics: [] })).toEqual([
      'basic',
      'usage',
    ]);
  });
});

describe('saveSong', () => {
  it('creates, then saves keys; skips empty themes and usage', async () => {
    const actions = fakeActions();
    const result = await saveSong(newSong(), actions, {
      songId: null,
      saved: null,
      canWriteUsage: true,
    });
    expect(result).toMatchObject({ ok: true, songId: NEW_ID, created: true });
    expect(result.keys).toHaveLength(1);
    expect(actions.createSong).toHaveBeenCalledWith(
      expect.objectContaining({ title: '1000 Hallelujahs' }),
    );
    expect(actions.setSongKeys).toHaveBeenCalledWith(NEW_ID, toKeysInput(newSong().musical.keys));
    expect(actions.setSongThemes).not.toHaveBeenCalled();
    expect(actions.setBranchUsage).not.toHaveBeenCalled();
    expect(actions.updateSong).not.toHaveBeenCalled();
  });

  it('on create, sends non-empty themes and usage', async () => {
    const v = newSong();
    v.themes = [{ section: 'chorus', theme: { id: 't1', name: 'glory' } }];
    v.usage = [{ branchId: BRANCH_IDS.portland, level: 'low' }];
    const actions = fakeActions();
    await saveSong(v, actions, { songId: null, saved: null, canWriteUsage: true });
    expect(actions.setSongThemes).toHaveBeenCalledWith(NEW_ID, [
      { section: 'chorus', themeId: 't1' },
    ]);
    expect(actions.setBranchUsage).toHaveBeenCalledWith(NEW_ID, v.usage);
  });

  it('skips usage without usage:write', async () => {
    const v = newSong();
    v.usage = [{ branchId: BRANCH_IDS.portland, level: 'low' }];
    const actions = fakeActions();
    await saveSong(v, actions, { songId: null, saved: null, canWriteUsage: false });
    expect(actions.setBranchUsage).not.toHaveBeenCalled();
  });

  it('stops when create fails and maps its errors', async () => {
    const actions = fakeActions({
      createSong: vi.fn(async () => fail('VALIDATION', 'Invalid', { title: ['Required'] })),
    });
    const result = await saveSong(newSong(), actions, {
      songId: null,
      saved: null,
      canWriteUsage: true,
    });
    expect(result).toEqual({
      ok: false,
      songId: null,
      created: true,
      keys: null,
      errors: { title: ['Required'] },
    });
    expect(actions.setSongKeys).not.toHaveBeenCalled();
  });

  it('reports a thrown action (network) as a form error', async () => {
    const actions = fakeActions({
      createSong: vi.fn(async () => {
        throw new Error('fetch failed');
      }),
    });
    const result = await saveSong(newSong(), actions, {
      songId: null,
      saved: null,
      canWriteUsage: true,
    });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors.form?.[0]).toMatch(/connection/);
  });

  it('keeps the new id when a later step fails', async () => {
    const v = newSong();
    v.themes = [{ section: 'chorus', theme: { id: 't1', name: 'glory' } }];
    const actions = fakeActions({
      setSongKeys: vi.fn(async () => fail('VALIDATION', 'Invalid', { '0.key': ['Bad key'] })),
      setSongThemes: vi.fn(async () =>
        fail('VALIDATION', 'x', { 'entries.0.themeId': ['Unknown theme.'] }),
      ),
    });
    const result = await saveSong(v, actions, { songId: null, saved: null, canWriteUsage: true });
    expect(result).toEqual({
      ok: false,
      songId: NEW_ID,
      created: true,
      keys: null,
      errors: { 'keys.0.key': ['Bad key'], 'entries.0.themeId': ['Unknown theme.'] },
    });
  });

  it('returns saved keys even when usage fails', async () => {
    const v = newSong();
    v.usage = [{ branchId: BRANCH_IDS.portland, level: 'low' }];
    const actions = fakeActions({
      setBranchUsage: vi.fn(async () =>
        fail('VALIDATION', 'Unknown branch.', { '0.branchId': ['Unknown branch.'] }),
      ),
    });
    const result = await saveSong(v, actions, { songId: null, saved: null, canWriteUsage: true });
    expect(result.ok).toBe(false);
    expect(result.keys).toHaveLength(1);
    expect(!result.ok && result.errors).toEqual({ 'usage.0.branchId': ['Unknown branch.'] });
  });

  describe('editing', () => {
    const saved = songFormValueFromSong(thousandHallelujahs);
    const opts = { songId: thousandHallelujahs.id, saved, canWriteUsage: true };

    it('sends nothing when nothing changed', async () => {
      const actions = fakeActions();
      const result = await saveSong(structuredClone(saved), actions, opts);
      expect(result).toEqual({
        ok: true,
        songId: thousandHallelujahs.id,
        created: false,
        keys: null,
      });
      for (const fn of Object.values(actions)) expect(fn).not.toHaveBeenCalled();
    });

    it('sends only the changed slices', async () => {
      const v = structuredClone(saved);
      v.basic.title = 'A Thousand Hallelujahs (live)';
      v.themes = [];
      const actions = fakeActions();
      await saveSong(v, actions, opts);
      expect(actions.updateSong).toHaveBeenCalledWith(
        thousandHallelujahs.id,
        expect.objectContaining({ title: 'A Thousand Hallelujahs (live)' }),
      );
      expect(actions.setSongThemes).toHaveBeenCalledWith(thousandHallelujahs.id, []);
      expect(actions.setSongKeys).not.toHaveBeenCalled();
      expect(actions.setBranchUsage).not.toHaveBeenCalled();
    });

    it('sends keys and usage when they change', async () => {
      const v = structuredClone(saved);
      v.musical.keys[1]!.firstChords.bridge = 'Db';
      v.usage = [];
      const actions = fakeActions();
      await saveSong(v, actions, opts);
      expect(actions.updateSong).not.toHaveBeenCalled();
      expect(actions.setSongKeys).toHaveBeenCalledOnce();
      expect(actions.setBranchUsage).toHaveBeenCalledWith(thousandHallelujahs.id, []);
    });

    it('sends everything when the saved state is unknown', async () => {
      const actions = fakeActions();
      await saveSong(structuredClone(saved), actions, { ...opts, saved: null });
      expect(actions.updateSong).toHaveBeenCalledOnce();
      expect(actions.setSongKeys).toHaveBeenCalledOnce();
      expect(actions.setSongThemes).toHaveBeenCalledOnce();
      expect(actions.setBranchUsage).toHaveBeenCalledOnce();
    });

    it('stops when the update fails', async () => {
      const v = structuredClone(saved);
      v.basic.title = 'x';
      v.themes = [];
      const actions = fakeActions({
        updateSong: vi.fn(async () => fail('NOT_FOUND', 'Song not found.')),
      });
      const result = await saveSong(v, actions, opts);
      expect(result).toEqual({
        ok: false,
        songId: thousandHallelujahs.id,
        created: false,
        keys: null,
        errors: { form: ['Song not found.'] },
      });
      expect(actions.setSongThemes).not.toHaveBeenCalled();
    });
  });
});
