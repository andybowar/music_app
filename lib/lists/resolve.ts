import {
  CHORD_SLOTS,
  MISSING_CHORD,
  type ChordSlot,
  type ListItem,
  type ResolvedItem,
  type SongDetail,
  type SongKey,
  type SongSummary,
} from '@/types/domain';

/** The compact row shape of a song, as `SongSummary` defines it. */
function toSummary(song: SongDetail, primary: SongKey | undefined): SongSummary {
  return {
    id: song.id,
    title: song.title,
    year: song.year,
    tempoBpm: song.tempoBpm,
    timeSignature: song.timeSignature,
    energyLevel: song.energyLevel,
    primaryKey: primary?.key ?? null,
    composers: song.composers.map(({ name, popMember }) => ({ name, popMember })),
    addedByBranchCode: song.addedByBranchCode,
    resourceCount: song.resources.length,
    createdAt: song.createdAt,
  };
}

/** First chords for a key row; every unknown slot (or a missing row) shows MISSING_CHORD. */
function chordsFor(row: SongKey | undefined): Record<ChordSlot, string> {
  const entries = CHORD_SLOTS.map((slot) => [slot, row?.firstChords[slot] ?? MISSING_CHORD]);
  return Object.fromEntries(entries) as Record<ChordSlot, string>;
}

/**
 * Implements REQ-LIST-04: decides what a setlist row shows.
 * - Effective key = `overrideKey ?? primary key`; BPM and energy fall back to the song's own values.
 * - Chords come from the effective key's `song_keys` row, else MISSING_CHORD for every slot.
 * - Resources = keyed resources of the effective key + unkeyed (projection) resources.
 * - `needsUpload` is true when the effective (override) key has no `song_keys` row.
 */
export function resolveItemDisplay(song: SongDetail, item: ListItem): ResolvedItem {
  const primary = song.keys.find((k) => k.isPrimary);
  const key = item.overrideKey ?? primary?.key ?? null;
  const row = key === null ? undefined : song.keys.find((k) => k.key === key);

  return {
    item,
    song: toSummary(song, primary),
    key,
    bpm: item.overrideBpm ?? song.tempoBpm,
    energy: item.overrideEnergy ?? song.energyLevel,
    isOverridden: {
      key: item.overrideKey !== null,
      bpm: item.overrideBpm !== null,
      energy: item.overrideEnergy !== null,
    },
    firstChords: chordsFor(row),
    resources: song.resources.filter(
      (r) => r.songKeyId === null || (row !== undefined && r.songKeyId === row.id),
    ),
    needsUpload: key !== null && row === undefined,
  };
}
