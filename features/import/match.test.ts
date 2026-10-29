import { describe, expect, it } from 'vitest';

import { songs } from '@/fixtures';
import type { SongDetail } from '@/types/domain';

import {
  FUZZY_THRESHOLD,
  matchFiles,
  normalizeKey,
  normalizeTitle,
  parseFileName,
  similarity,
} from './match';
import { importIdempotencyKey } from './parse';
import type { ImportRow } from './types';

/** An ImportRow shaped like what `parseImportCsv` produces for a fixture song. */
function toRow(song: SongDetail, line: number): ImportRow {
  const primaryKey = song.primaryKey;
  return {
    line,
    idempotencyKey: importIdempotencyKey(song.title, song.year),
    title: song.title,
    altTitles: song.altTitles,
    composers: song.composers.map((c) => ({ name: c.name, popMember: c.popMember })),
    sourceGroup: song.sourceGroup,
    year: song.year,
    primaryKey,
    altKeys: song.keys.map((k) => k.key).filter((k) => k !== primaryKey),
    tempoBpm: song.tempoBpm,
    timeSignature: song.timeSignature,
    energyLevel: song.energyLevel,
    energyNotes: song.energyNotes,
    firstChords: { intro: null, verse: null, chorus: null, bridge: null },
    themes: {
      chorus: [],
      verse_1: [],
      verse_2: [],
      verse_3: [],
      verse_4: [],
      verse_5: [],
      bridge: [],
    },
    usage: [],
    addedByBranchCode: song.addedByBranchCode,
    youtubeLinks: [],
  };
}

const rows = songs.map((s, i) => toRow(s, i + 2));
const byTitle = (title: string) => rows.find((r) => r.title === title)!;
const hallelujahs = byTitle('A Thousand Hallelujahs');
const reasons = byTitle('10000 Reasons');

describe('normalizeTitle', () => {
  it('folds case, accents, punctuation, apostrophes, & and whitespace', () => {
    expect(normalizeTitle('  Be  Exalted,   O God! ')).toBe('be exalted o god');
    expect(normalizeTitle('Jesus’ Name & Glory')).toBe('jesus name and glory');
    expect(normalizeTitle("Jesus' Name")).toBe('jesus name');
    expect(normalizeTitle('Cántico Nuevo')).toBe('cantico nuevo');
    expect(normalizeTitle('Amazing Grace (My Chains Are Gone)')).toBe(
      'amazing grace my chains are gone',
    );
    expect(normalizeTitle('!!!')).toBe('');
  });
});

describe('normalizeKey', () => {
  it.each([
    ['D', 'D'],
    ['d', 'D'],
    ['Db', 'Db'],
    ['DB', 'Db'],
    ['db', 'Db'],
    ['D♭', 'Db'],
    ['F#', 'F#'],
    ['f♯', 'F#'],
    ['F#m', 'F#m'],
    ['Bbm', 'Bbm'],
    ['bm', 'Bm'],
    ['C min', 'Cm'],
    ['A minor', 'Am'],
    [' E ', 'E'],
  ])('%s → %s', (raw, key) => {
    expect(normalizeKey(raw)).toBe(key);
  });

  it.each(['H', 'Dx', 'D##', 'CM', 'Key of D', '', 'Dmaj'])('rejects %j', (raw) => {
    expect(normalizeKey(raw)).toBeNull();
  });
});

describe('similarity', () => {
  it('is 1 for equal strings and 0 against an empty string', () => {
    expect(similarity('abc', 'abc')).toBe(1);
    expect(similarity('', 'abc')).toBe(0);
    expect(similarity('abc', '')).toBe(0);
  });

  it('is 1 minus edit distance over the longer length', () => {
    expect(similarity('kitten', 'sitting')).toBeCloseTo(1 - 3 / 7);
    expect(similarity('agnus dei', 'agnes dei')).toBeCloseTo(1 - 1 / 9);
  });
});

describe('parseFileName', () => {
  it('reads the keyed convention', () => {
    expect(parseFileName('1000 Hallelujahs - Db - Chord Chart.pdf')).toEqual({
      title: '1000 Hallelujahs',
      key: 'Db',
      kind: 'chord_chart',
      format: 'pdf',
      index: 1,
      label: 'Chord Chart',
    });
  });

  it('reads numbered duplicates', () => {
    expect(parseFileName('1000 Hallelujahs - D - Chord Chart 2.pdf')).toMatchObject({
      key: 'D',
      kind: 'chord_chart',
      index: 2,
      label: 'Chord Chart 2',
    });
    expect(parseFileName('X - D - Chord Chart 1.pdf')).toMatchObject({
      index: 1,
      label: 'Chord Chart',
    });
    expect(parseFileName('X - D - Chord Chart3.pdf')).toMatchObject({ index: 3 });
  });

  it('maps every kind name case-insensitively', () => {
    expect(parseFileName('X - D - full score.pdf')?.kind).toBe('full_score');
    expect(parseFileName('X - D - LEAD SHEET.PDF')).toMatchObject({
      kind: 'lead_sheet',
      format: 'pdf',
    });
    expect(parseFileName('X - D - Lead_Sheet.pdf')?.kind).toBe('lead_sheet');
    expect(parseFileName('X - D - Audio.m4a')).toMatchObject({ kind: 'audio', format: 'm4a' });
    expect(parseFileName('X - D - MP3.mp3')).toMatchObject({ kind: 'audio', label: 'Audio' });
    expect(parseFileName('X - D - mp3 2.mp3')).toMatchObject({ kind: 'audio', index: 2 });
    expect(parseFileName('X - D - Instruction.mp3')?.kind).toBe('instruction_link');
    expect(parseFileName('X - D - Instruction.pdf')?.kind).toBe('instruction_link');
  });

  it('reads projection files without a key', () => {
    for (const ext of ['pro', 'mdb', 'ppt', 'pptx', 'PPTX']) {
      expect(parseFileName(`Agnus Dei - Projection.${ext}`)).toEqual({
        title: 'Agnus Dei',
        key: null,
        kind: 'projection',
        format: ext.toLowerCase(),
        index: 1,
        label: 'Projection',
      });
    }
    expect(parseFileName('Agnus Dei - Projection 2.pro')).toMatchObject({
      index: 2,
      label: 'Projection 2',
    });
  });

  it('ignores folders, tolerates spacing and dashes, and keeps " - " inside titles', () => {
    expect(parseFileName('import/Songs/A/Agnus Dei - A - Lead Sheet.pdf')?.title).toBe('Agnus Dei');
    expect(parseFileName('C:\\import\\Agnus Dei - A - Lead Sheet.pdf')?.title).toBe('Agnus Dei');
    expect(parseFileName('  Agnus Dei   -   a  -  lead sheet .pdf')).toMatchObject({
      title: 'Agnus Dei',
      key: 'A',
      kind: 'lead_sheet',
    });
    expect(parseFileName('Agnus Dei – A — Lead Sheet.pdf')?.title).toBe('Agnus Dei');
    expect(parseFileName('Lord - Have Mercy - G - Chord Chart.pdf')).toMatchObject({
      title: 'Lord - Have Mercy',
      key: 'G',
    });
  });

  it.each([
    ['no extension', 'Agnus Dei - A - Lead Sheet'],
    ['dotfile', '.DS_Store'],
    ['unsupported extension', 'Agnus Dei - A - Lead Sheet.docx'],
    ['url is not a file format', 'Agnus Dei - A - Audio.url'],
    ['extension wrong for kind', 'Agnus Dei - A - Chord Chart.mp3'],
    ['projection extension wrong', 'Agnus Dei - Projection.pdf'],
    ['audio as pdf', 'Agnus Dei - A - Audio.pdf'],
    ['no separators', 'Agnus Dei Lead Sheet.pdf'],
    ['unknown kind', 'Agnus Dei - A - Sheet Music.pdf'],
    ['unknown numbered kind', 'Agnus Dei - A - Sheet Music 2.pdf'],
    ['missing key', 'Agnus Dei - Chord Chart.pdf'],
    ['invalid key', 'Agnus Dei - H - Chord Chart.pdf'],
    ['number zero', 'Agnus Dei - A - Chord Chart 0.pdf'],
    ['empty title', ' - A - Chord Chart.pdf'],
    ['punctuation-only title', '!!! - A - Chord Chart.pdf'],
    ['hyphen without spaces', 'Agnus Dei-A-Chord Chart.pdf'],
  ])('rejects %s', (_, path) => {
    expect(parseFileName(path)).toBeNull();
  });
});

describe('matchFiles', () => {
  it('matches the contract examples on title and alt title', () => {
    const { matched, unmatched } = matchFiles(
      ['A Thousand Hallelujahs - Db - Chord Chart.pdf', '1000 Hallelujahs - D - Chord Chart 2.pdf'],
      rows,
    );
    expect(unmatched).toEqual([]);
    expect(matched).toEqual([
      {
        path: 'A Thousand Hallelujahs - Db - Chord Chart.pdf',
        idempotencyKey: hallelujahs.idempotencyKey,
        line: hallelujahs.line,
        matchedOn: 'title',
        confidence: 1,
        key: 'Db',
        keyInRow: true,
        kind: 'chord_chart',
        format: 'pdf',
        index: 1,
        label: 'Chord Chart',
      },
      {
        path: '1000 Hallelujahs - D - Chord Chart 2.pdf',
        idempotencyKey: hallelujahs.idempotencyKey,
        line: hallelujahs.line,
        matchedOn: 'alt_title',
        confidence: 1,
        key: 'D',
        keyInRow: true,
        kind: 'chord_chart',
        format: 'pdf',
        index: 2,
        label: 'Chord Chart 2',
      },
    ]);
  });

  it('keeps numbered duplicates as separate resources', () => {
    const paths = [
      'Agnus Dei - A - Chord Chart.pdf',
      'Agnus Dei - A - Chord Chart 2.pdf',
      'Agnus Dei - A - Chord Chart 3.pdf',
    ];
    const { matched, unmatched } = matchFiles(paths, rows);
    expect(unmatched).toEqual([]);
    expect(matched.map((m) => [m.index, m.label])).toEqual([
      [1, 'Chord Chart'],
      [2, 'Chord Chart 2'],
      [3, 'Chord Chart 3'],
    ]);
  });

  it('matches projection files to the song with no key', () => {
    const { matched, unmatched } = matchFiles(
      ['Agnus Dei - Projection.pro', 'agnus dei - projection 2.PPTX'],
      rows,
    );
    expect(unmatched).toEqual([]);
    expect(matched).toMatchObject([
      { kind: 'projection', key: null, keyInRow: true, format: 'pro', label: 'Projection' },
      { kind: 'projection', key: null, keyInRow: true, format: 'pptx', label: 'Projection 2' },
    ]);
  });

  it('ignores case, punctuation and whitespace differences in titles', () => {
    const { matched, unmatched } = matchFiles(
      [
        'be exalted o god - EB - lead sheet.pdf',
        'AMAZING GRACE  MY CHAINS ARE GONE - g - Full Score.pdf',
        'folder/sub/10,000 Reasons (Bless the Lord) - e - Audio.mp3',
      ],
      rows,
    );
    expect(unmatched).toEqual([]);
    expect(matched.map((m) => [m.idempotencyKey, m.matchedOn, m.confidence])).toEqual([
      [byTitle('Be Exalted, O God').idempotencyKey, 'title', 1],
      [byTitle('Amazing Grace (My Chains Are Gone)').idempotencyKey, 'title', 1],
      [reasons.idempotencyKey, 'alt_title', 1],
    ]);
  });

  it('fuzzy-matches near titles with confidence below 1', () => {
    const { matched, unmatched } = matchFiles(
      ['Revive This Lnd - E - Chord Chart.pdf', 'The Lord Almighty Riegns - E - Audio.mp3'],
      rows,
    );
    expect(unmatched).toEqual([]);
    expect(matched[0]).toMatchObject({
      idempotencyKey: byTitle('Revive This Land').idempotencyKey,
      matchedOn: 'title',
    });
    expect(matched[1]!.idempotencyKey).toBe(byTitle('The Lord Almighty Reigns').idempotencyKey);
    for (const m of matched) {
      expect(m.confidence).toBeLessThan(1);
      expect(m.confidence).toBeGreaterThanOrEqual(FUZZY_THRESHOLD);
    }
  });

  it('fuzzy-matches alt titles and picks the closest candidate', () => {
    const { matched } = matchFiles(['My Chains Are Gonee - G - Lead Sheet.pdf'], rows);
    expect(matched).toMatchObject([
      {
        idempotencyKey: byTitle('Amazing Grace (My Chains Are Gone)').idempotencyKey,
        matchedOn: 'alt_title',
      },
    ]);
    // Two candidates clear the threshold; the closer one wins.
    const far = { ...hallelujahs, idempotencyKey: 'far|', title: 'abcdefghijklmnopqrxx' };
    const near = { ...hallelujahs, idempotencyKey: 'near|', title: 'abcdefghijklmnopqrst' };
    const pick = (list: ImportRow[]) =>
      matchFiles(['abcdefghijklmnopqrsz - D - Audio.mp3'], list).matched.map(
        (m) => m.idempotencyKey,
      );
    expect(pick([far, near])).toEqual(['near|']);
    expect(pick([near, far])).toEqual(['near|']);
    // Same row reached twice at the same score is not a tie.
    const twice = { ...near, altTitles: ['abcdefghijklmnopqrst!'] };
    expect(matchFiles(['abcdefghijklmnopqrsz - D - Audio.mp3'], [twice]).matched).toHaveLength(1);
  });

  it('leaves titles below the fuzzy threshold unmatched', () => {
    const paths = ['Completely Different Song - D - Chord Chart.pdf', 'Agnus - A - Audio.mp3'];
    expect(matchFiles(paths, rows)).toEqual({ matched: [], unmatched: paths });
  });

  it('flags keys the row does not list', () => {
    const { matched } = matchFiles(
      ['Agnus Dei - A - Audio.mp3', 'Agnus Dei - Bb - Audio.mp3', 'At the Cross - am - Audio.mp3'],
      rows,
    );
    expect(matched.map((m) => [m.key, m.keyInRow])).toEqual([
      ['A', true],
      ['Bb', false],
      ['Am', true],
    ]);
    const noKeys = { ...hallelujahs, primaryKey: null, altKeys: [] };
    expect(matchFiles(['A Thousand Hallelujahs - D - Audio.mp3'], [noKeys]).matched).toMatchObject([
      { key: 'D', keyInRow: false },
    ]);
  });

  it('reports unsupported extensions and files that fit no pattern as unmatched', () => {
    const paths = [
      '.DS_Store',
      'Agnus Dei - A - Lead Sheet.docx',
      'Agnus Dei - A - Chord Chart.mp3',
      'Agnus Dei - Chord Chart.pdf',
      'notes.txt',
      'Agnus Dei - A - Lead Sheet.pdf',
    ];
    const { matched, unmatched } = matchFiles(paths, rows);
    expect(matched.map((m) => m.path)).toEqual(['Agnus Dei - A - Lead Sheet.pdf']);
    expect(unmatched).toEqual(paths.slice(0, 5));
  });

  it('leaves a title shared by two rows unmatched (ambiguous)', () => {
    const v1 = { ...hallelujahs, idempotencyKey: 'a thousand hallelujahs|2021' };
    const v2 = { ...hallelujahs, idempotencyKey: 'a thousand hallelujahs|2022', line: 99 };
    const exact = matchFiles(['A Thousand Hallelujahs - D - Audio.mp3'], [v1, v2]);
    expect(exact).toEqual({ matched: [], unmatched: ['A Thousand Hallelujahs - D - Audio.mp3'] });
    // Also when the tie is fuzzy.
    const fuzzy = matchFiles(['A Thousand Halelujahs - D - Audio.mp3'], [v1, v2]);
    expect(fuzzy.matched).toEqual([]);
    // One row's alt title equal to another row's title is ambiguous too.
    const other = { ...reasons, altTitles: ['A Thousand Hallelujahs'] };
    expect(matchFiles(['A Thousand Hallelujahs - D - Audio.mp3'], [v1, other]).matched).toEqual([]);
  });

  it('prefers the title when a row matches on title and alt title', () => {
    const row = { ...hallelujahs, altTitles: ['A thousand hallelujahs!'] };
    expect(matchFiles(['A Thousand Hallelujahs - D - Audio.mp3'], [row]).matched).toMatchObject([
      { matchedOn: 'title' },
    ]);
    const altFirst = { ...hallelujahs, title: 'Zzz', altTitles: ['Foo', 'Foo!'] };
    expect(matchFiles(['Foo - D - Audio.mp3'], [altFirst]).matched).toMatchObject([
      { matchedOn: 'alt_title' },
    ]);
  });

  it('keeps one file per slot: first on equal confidence, else the more confident', () => {
    const paths = [
      'a/Agnus Dei - A - Chord Chart.pdf',
      'b/Agnus Dei - A - Chord Chart.pdf',
      'Agnus Dei - A - Chord Chart 1.pdf',
      'AGNUS DEI - a - chord chart.PDF',
    ];
    expect(matchFiles(paths, rows)).toMatchObject({
      matched: [{ path: paths[0] }],
      unmatched: paths.slice(1),
    });

    const fuzzyFirst = ['Agnus Dee - A - Audio.mp3', 'Agnus Dei - A - Audio.mp3'];
    expect(matchFiles(fuzzyFirst, rows)).toMatchObject({
      matched: [{ path: fuzzyFirst[1], confidence: 1 }],
      unmatched: [fuzzyFirst[0]],
    });
  });

  it('treats the same key, kind and number in different keys or kinds as separate slots', () => {
    const paths = [
      'A Thousand Hallelujahs - D - Chord Chart.pdf',
      'A Thousand Hallelujahs - E - Chord Chart.pdf',
      'A Thousand Hallelujahs - D - Lead Sheet.pdf',
      'Agnus Dei - A - Chord Chart.pdf',
    ];
    expect(matchFiles(paths, rows).matched).toHaveLength(4);
  });

  it('counts a repeated identical path once', () => {
    const path = 'Agnus Dei - A - Audio.mp3';
    expect(matchFiles([path, path, path], rows)).toMatchObject({
      matched: [{ path }],
      unmatched: [],
    });
  });

  it('handles empty input', () => {
    expect(matchFiles([], rows)).toEqual({ matched: [], unmatched: [] });
    expect(matchFiles(['Agnus Dei - A - Audio.mp3'], [])).toEqual({
      matched: [],
      unmatched: ['Agnus Dei - A - Audio.mp3'],
    });
  });
});
