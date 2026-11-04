import { describe, expect, it } from 'vitest';

import { SONG_IDS, getSong, thousandHallelujahs } from '@/fixtures';
import { resolveItemDisplay } from '@/lib/lists/resolve';
import type { ListItem } from '@/types/domain';

import {
  chartOptions,
  hasLyrics,
  hasTypedChords,
  keyMismatch,
  projectionResources,
  sectionCues,
} from './charts';

const item = (songId: string, overrideKey: string | null = null): ListItem => ({
  id: '90000000-0000-4000-8000-000000000001',
  listId: '80000000-0000-4000-8000-000000000001',
  songId,
  position: 0,
  overrideKey,
  overrideBpm: null,
  overrideEnergy: null,
  resourceId: null,
  notes: null,
});
const resolve = (songId: string, key: string | null = null) =>
  resolveItemDisplay(getSong(songId), item(songId, key));

describe('chartOptions', () => {
  it('puts typed chords first, then chord charts, lead sheets and scores', () => {
    const amazing = getSong(SONG_IDS.amazingGrace);
    const options = chartOptions(resolve(SONG_IDS.amazingGrace), amazing);
    expect(options.map((o) => o.label)).toEqual(['Typed chords', 'Chord chart', 'Lead sheet']);
    expect(options[0]).toMatchObject({ type: 'typed', key: 'G' });
  });

  it('numbers PDFs with the same label and skips non-PDF resources', () => {
    const options = chartOptions(resolve(SONG_IDS.thousandHallelujahs), thousandHallelujahs);
    const labels = options.map((o) => o.label);
    expect(labels[0]).toMatch(/^Chord chart/);
    expect(labels).toContain('Full score');
    expect(labels).toContain('Lead sheet');
    expect(new Set(labels).size).toBe(labels.length);
    expect(options.every((o) => o.type === 'pdf')).toBe(true);
    expect(labels.indexOf('Lead sheet')).toBeLessThan(labels.indexOf('Full score'));
  });

  it('is empty without details or files', () => {
    expect(chartOptions(resolve(SONG_IDS.beExaltedOGod), getSong(SONG_IDS.beExaltedOGod))).toEqual(
      [],
    );
    expect(chartOptions(resolve(SONG_IDS.holySpirit, 'E'), undefined)).toEqual([]);
  });
});

describe('helpers', () => {
  it('hasTypedChords and hasLyrics', () => {
    expect(hasTypedChords(getSong(SONG_IDS.amazingGrace))).toBe(true);
    expect(hasTypedChords(thousandHallelujahs)).toBe(false);
    expect(hasTypedChords(undefined)).toBe(false);
    expect(hasLyrics(thousandHallelujahs)).toBe(true);
    expect(hasLyrics(undefined)).toBe(false);
  });

  it('keyMismatch warns only when both keys are known and differ', () => {
    expect(keyMismatch('G', 'A')).toBe(
      'These chords are written in G; this setlist plays the song in A.',
    );
    expect(keyMismatch('G', 'G')).toBeNull();
    expect(keyMismatch(null, 'A')).toBeNull();
    expect(keyMismatch('G', null)).toBeNull();
  });

  it('sectionCues follows the arrangement, then the other sections with lyrics', () => {
    const song = { ...thousandHallelujahs, arrangement: ['chorus' as const] };
    const cues = sectionCues(song);
    expect(cues[0]).toEqual({ section: 'chorus', line: 'With a thousand hallelujahs' });
    expect(cues.map((c) => c.section)).toEqual(['chorus', 'verse_1', 'verse_2', 'bridge']);
  });

  it('projectionResources keeps projection files only', () => {
    const files = projectionResources(resolve(SONG_IDS.thousandHallelujahs));
    expect(files.map((r) => r.label)).toEqual(['ProPresenter', 'Lyric database', 'Slides']);
  });
});
