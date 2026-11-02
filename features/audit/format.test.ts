import { describe, expect, it } from 'vitest';

import type { AuditEntry } from '@/types/domain';

import {
  MAX_VALUE_LENGTH,
  describeChanges,
  entryTitle,
  fieldLabel,
  formatValue,
  humanize,
} from './format';

type E = Pick<AuditEntry, 'entity' | 'action' | 'diff'>;
const entry = (entity: string, action: AuditEntry['action'], diff: AuditEntry['diff'] = {}): E => ({
  entity,
  action,
  diff,
});

describe('humanize', () => {
  it('splits camelCase and snake_case into sentence case', () => {
    expect(humanize('verseChord')).toBe('Verse chord');
    expect(humanize('video_link')).toBe('Video link');
    expect(humanize('')).toBe('');
  });
});

describe('fieldLabel', () => {
  it('uses known labels, section names, branch codes, then humanizes', () => {
    expect(fieldLabel('song', 'tempoBpm')).toBe('Tempo (BPM)');
    expect(fieldLabel('song_themes', 'verse_2')).toBe('Verse 2');
    expect(fieldLabel('branch_usage', 'SV')).toBe('SV');
    expect(fieldLabel('song', 'somethingNew')).toBe('Something new');
  });
});

describe('formatValue', () => {
  it('treats null, blank strings and empty lists as not set', () => {
    expect(formatValue('title', null)).toBeNull();
    expect(formatValue('title', undefined)).toBeNull();
    expect(formatValue('title', '  ')).toBeNull();
    expect(formatValue('altTitles', [])).toBeNull();
  });

  it('formats scalars', () => {
    expect(formatValue('year', 2020)).toBe('2020');
    expect(formatValue('isPrimary', true)).toBe('Yes');
    expect(formatValue('isPrimary', false)).toBe('No');
    expect(formatValue('energyLevel', 'deep_worship')).toBe("Deep 'Worship'");
    expect(formatValue('energyLevel', 'unknown')).toBe('unknown');
    expect(formatValue('kind', 'chord_chart')).toBe('Chord chart');
    expect(formatValue('popMember', 'current')).toBe('Current');
    expect(formatValue('x', BigInt(5))).toBe('5');
  });

  it('joins lists, with section names for arrangements', () => {
    expect(formatValue('altTitles', ['A', 'B'])).toBe('A, B');
    expect(formatValue('arrangement', ['verse_1', 'chorus'])).toBe('Verse 1 · Chorus');
    expect(formatValue('altTitles', ['A', null])).toBe('A, ');
  });

  it('formats branch usage levels and other objects', () => {
    expect(formatValue('SV', { level: 'high', source: 'manual' })).toBe('High');
    expect(formatValue('SV', { level: 'rare', source: 'derived' })).toBe('Rare (from setlists)');
    expect(formatValue('x', { a: 1 })).toBe('{"a":1}');
  });

  it('cuts long text', () => {
    const long = 'x'.repeat(MAX_VALUE_LENGTH + 10);
    const out = formatValue('energyNotes', long)!;
    expect(out).toHaveLength(MAX_VALUE_LENGTH);
    expect(out.endsWith('…')).toBe(true);
  });
});

describe('describeChanges', () => {
  it('lists changed fields in a readable order and skips no-op changes', () => {
    const changes = describeChanges(
      entry('song', 'update', {
        zzz: { from: 1, to: 2 },
        year: { from: 2001, to: 2002 },
        title: { from: 'Old', to: 'New' },
        altTitles: { from: [], to: null },
      }),
    );
    expect(changes).toEqual([
      { kind: 'value', field: 'title', label: 'Title', from: 'Old', to: 'New' },
      { kind: 'value', field: 'year', label: 'Year', from: '2001', to: '2002' },
      { kind: 'value', field: 'zzz', label: 'Zzz', from: '1', to: '2' },
    ]);
  });

  it('orders theme sections in song order', () => {
    const changes = describeChanges(
      entry('song_themes', 'update', {
        bridge: { from: null, to: ['Hope'] },
        chorus: { from: ['Joy'], to: null },
      }),
    );
    expect(changes.map((c) => c.label)).toEqual(['Chorus', 'Bridge']);
  });

  it('reports lyric changes as section names, never text', () => {
    const changes = describeChanges(
      entry('song', 'update', {
        lyrics: { from: { bridge: 'old words' }, to: { bridge: 'new words', chorus: 'x' } },
      }),
    );
    expect(changes).toEqual([
      { kind: 'sections', field: 'lyrics', label: 'Lyrics', sections: ['Chorus', 'Bridge'] },
    ]);
    expect(describeChanges(entry('song', 'update', { lyrics: { from: {}, to: null } }))).toEqual(
      [],
    );
    expect(describeChanges(entry('song', 'update', { lyrics: { from: 'a', to: 'b' } }))).toEqual([
      { kind: 'value', field: 'lyrics', label: 'Lyrics', from: 'a', to: 'b' },
    ]);
  });
});

describe('entryTitle', () => {
  it('describes song entries', () => {
    expect(entryTitle(entry('song', 'create'))).toBe('Created the song');
    expect(entryTitle(entry('song', 'update'))).toBe('Edited song details');
    expect(entryTitle(entry('song', 'delete'))).toBe('Deleted the song');
    expect(entryTitle(entry('song_composers', 'update'))).toBe('Changed composers');
    expect(entryTitle(entry('song_themes', 'update'))).toBe('Changed themes');
    expect(entryTitle(entry('branch_usage', 'update'))).toBe('Changed branch usage');
  });

  it('names keys when it can', () => {
    expect(entryTitle(entry('song_key', 'create', { key: { from: null, to: 'G' } }))).toBe(
      'Added key G',
    );
    expect(entryTitle(entry('song_key', 'delete', { key: { from: 'D', to: null } }))).toBe(
      'Removed key D',
    );
    expect(entryTitle(entry('song_key', 'create'))).toBe('Added a key');
    expect(entryTitle(entry('song_key', 'delete'))).toBe('Removed a key');
    expect(entryTitle(entry('song_key', 'update'))).toBe('Edited a key');
  });

  it('names files and links', () => {
    const file = { label: { from: null, to: 'Lead sheet' }, format: { from: null, to: 'pdf' } };
    const link = { label: { from: 'Video', to: null }, format: { from: 'url', to: null } };
    expect(entryTitle(entry('resource', 'create', file))).toBe('Added file “Lead sheet”');
    expect(entryTitle(entry('resource', 'delete', link))).toBe('Removed link “Video”');
    expect(entryTitle(entry('resource', 'create'))).toBe('Added a file');
    expect(entryTitle(entry('resource', 'delete'))).toBe('Removed a file');
    expect(entryTitle(entry('resource', 'update', { label: { from: 'A', to: 'B' } }))).toBe(
      'Edited file “B”',
    );
    expect(entryTitle(entry('resource', 'update'))).toBe('Edited a file or link');
  });

  it('falls back to a generic title', () => {
    expect(entryTitle(entry('theme', 'create'))).toBe('Created theme');
    expect(entryTitle(entry('composer', 'update'))).toBe('Edited composer');
    expect(entryTitle(entry('composer', 'delete'))).toBe('Deleted composer');
  });
});
