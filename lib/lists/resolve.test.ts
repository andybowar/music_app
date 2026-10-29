import { getItemsForList, getSong, LIST_IDS, SONG_IDS, toSummary } from '@/fixtures';
import { CHORD_SLOTS, MISSING_CHORD, type ListItem, type SongDetail } from '@/types/domain';

import { resolveItemDisplay } from './resolve';

const ALL_MISSING = Object.fromEntries(CHORD_SLOTS.map((s) => [s, MISSING_CHORD]));

/** The fixture item for `songId` in list `listId`. */
function itemFor(listId: string, songId: string): ListItem {
  const item = getItemsForList(listId).find((i) => i.songId === songId);
  if (!item) throw new Error(`No item for song ${songId} in list ${listId}`);
  return item;
}

/** A fixture item with its overrides cleared, then the given overrides applied. */
function withOverrides(base: ListItem, patch: Partial<ListItem>): ListItem {
  return { ...base, overrideKey: null, overrideBpm: null, overrideEnergy: null, ...patch };
}

function keyRow(song: SongDetail, key: string) {
  const row = song.keys.find((k) => k.key === key);
  if (!row) throw new Error(`No ${key} row on ${song.title}`);
  return row;
}

describe('resolveItemDisplay', () => {
  it('with no overrides shows the primary key, song BPM and energy', () => {
    const song = getSong(SONG_IDS.thousandHallelujahs);
    const item = itemFor(LIST_IDS.bg41926, SONG_IDS.thousandHallelujahs);
    const primary = keyRow(song, 'D');

    const r = resolveItemDisplay(song, item);

    expect(r.item).toBe(item);
    expect(r.song).toEqual(toSummary(song));
    expect(r.key).toBe('D');
    expect(r.bpm).toBe(song.tempoBpm);
    expect(r.energy).toBe(song.energyLevel);
    expect(r.isOverridden).toEqual({ key: false, bpm: false, energy: false });
    expect(r.firstChords).toEqual(primary.firstChords);
    expect(r.needsUpload).toBe(false);
    expect(r.resources).toEqual(
      song.resources.filter((x) => x.songKeyId === primary.id || x.songKeyId === null),
    );
    // Includes unkeyed projection resources and excludes other keys' files.
    expect(r.resources.some((x) => x.songKeyId === null)).toBe(true);
    expect(r.resources.length).toBeLessThan(song.resources.length);
  });

  it('with an override to an existing key uses that key row for chords and resources', () => {
    const song = getSong(SONG_IDS.reviveThisLand);
    const item = itemFor(LIST_IDS.ag42526, SONG_IDS.reviveThisLand);
    expect(item.overrideKey).toBe('D');
    const row = keyRow(song, 'D');

    const r = resolveItemDisplay(song, item);

    expect(r.key).toBe('D');
    expect(r.song.primaryKey).toBe('E');
    expect(r.isOverridden).toEqual({ key: true, bpm: false, energy: false });
    expect(r.firstChords).toEqual(row.firstChords);
    expect(r.needsUpload).toBe(false);
    expect(r.resources.every((x) => x.songKeyId === row.id || x.songKeyId === null)).toBe(true);
    expect(r.resources.some((x) => x.songKeyId === null)).toBe(true);
  });

  it('with an override to a missing key shows X for every chord and needsUpload', () => {
    const song = getSong(SONG_IDS.beTheCenter);
    const item = itemFor(LIST_IDS.bg41926, SONG_IDS.beTheCenter);
    expect(item.overrideKey).toBe('C');
    expect(song.keys.some((k) => k.key === 'C')).toBe(false);

    const r = resolveItemDisplay(song, item);

    expect(r.key).toBe('C');
    expect(r.isOverridden.key).toBe(true);
    expect(r.firstChords).toEqual(ALL_MISSING);
    expect(r.needsUpload).toBe(true);
    expect(r.resources).toEqual([]);
  });

  it('with a missing override key still lists unkeyed (projection) resources', () => {
    const song = getSong(SONG_IDS.thousandHallelujahs);
    const item = withOverrides(itemFor(LIST_IDS.bg41926, SONG_IDS.thousandHallelujahs), {
      overrideKey: 'F#',
    });

    const r = resolveItemDisplay(song, item);

    expect(r.needsUpload).toBe(true);
    expect(r.firstChords).toEqual(ALL_MISSING);
    expect(r.resources).toEqual(song.resources.filter((x) => x.songKeyId === null));
    expect(r.resources.length).toBeGreaterThan(0);
  });

  it('with only a BPM override changes BPM and nothing else', () => {
    const song = getSong(SONG_IDS.causeToCelebrate);
    const item = itemFor(LIST_IDS.bg41926, SONG_IDS.causeToCelebrate);
    expect(item.overrideBpm).toBe(126);

    const r = resolveItemDisplay(song, item);

    expect(r.bpm).toBe(126);
    expect(r.song.tempoBpm).toBe(song.tempoBpm);
    expect(r.key).toBe(r.song.primaryKey);
    expect(r.energy).toBe(song.energyLevel);
    expect(r.isOverridden).toEqual({ key: false, bpm: true, energy: false });
    expect(r.needsUpload).toBe(false);
  });

  it('with only an energy override changes energy and nothing else', () => {
    const song = getSong(SONG_IDS.holySpirit);
    const item = itemFor(LIST_IDS.bg41926, SONG_IDS.holySpirit);
    expect(item.overrideEnergy).toBe('mid_worship');

    const r = resolveItemDisplay(song, item);

    expect(r.energy).toBe('mid_worship');
    expect(r.song.energyLevel).toBe(song.energyLevel);
    expect(r.bpm).toBe(song.tempoBpm);
    expect(r.key).toBe(r.song.primaryKey);
    expect(r.isOverridden).toEqual({ key: false, bpm: false, energy: true });
  });

  it('with BPM and energy overrides together leaves the key alone', () => {
    const song = getSong(SONG_IDS.agnusDei);
    const base = itemFor(LIST_IDS.bg41926, SONG_IDS.thousandHallelujahs);
    const item = withOverrides(
      { ...base, songId: song.id },
      { overrideBpm: 80, overrideEnergy: 'quiet_worship' },
    );

    const r = resolveItemDisplay(song, item);

    expect(r).toMatchObject({ key: 'A', bpm: 80, energy: 'quiet_worship', needsUpload: false });
    expect(r.isOverridden).toEqual({ key: false, bpm: true, energy: true });
  });

  it('shows X for slots a key row leaves unknown', () => {
    const song = getSong(SONG_IDS.thousandHallelujahs);
    const item = withOverrides(itemFor(LIST_IDS.bg41926, SONG_IDS.thousandHallelujahs), {
      overrideKey: 'Db',
    });

    const r = resolveItemDisplay(song, item);

    expect(r.firstChords).toEqual({
      intro: 'Db',
      verse: 'Db',
      chorus: 'Gb',
      bridge: MISSING_CHORD,
    });
    expect(r.needsUpload).toBe(false);
  });

  it('shows X everywhere for a song whose primary key has no chords yet', () => {
    const song = getSong(SONG_IDS.beExaltedOGod);
    const item = withOverrides(itemFor(LIST_IDS.bg41926, SONG_IDS.thousandHallelujahs), {
      songId: song.id,
    });

    const r = resolveItemDisplay(song, item);

    expect(r.key).toBe('Eb');
    expect(r.bpm).toBeNull();
    expect(r.energy).toBeNull();
    expect(r.firstChords).toEqual(ALL_MISSING);
    expect(r.needsUpload).toBe(false);
    expect(r.resources).toEqual([]);
  });

  it('with no keys and no override has no key, X chords and does not ask for an upload', () => {
    const fixture = getSong(SONG_IDS.thousandHallelujahs);
    const song: SongDetail = {
      ...fixture,
      keys: [],
      resources: fixture.resources.filter((x) => x.songKeyId === null),
    };
    const item = itemFor(LIST_IDS.bg41926, SONG_IDS.thousandHallelujahs);

    const r = resolveItemDisplay(song, item);

    expect(r.key).toBeNull();
    expect(r.song.primaryKey).toBeNull();
    expect(r.firstChords).toEqual(ALL_MISSING);
    expect(r.needsUpload).toBe(false);
    expect(r.resources).toEqual(song.resources);
  });

  it('resolves every fixture list item without throwing', () => {
    for (const listId of Object.values(LIST_IDS)) {
      for (const item of getItemsForList(listId)) {
        const r = resolveItemDisplay(getSong(item.songId), item);
        expect(Object.keys(r.firstChords).sort()).toEqual([...CHORD_SLOTS].sort());
      }
    }
  });
});
