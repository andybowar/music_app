import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { importIdempotencyKey, parseImportCsv } from './parse';

const MIN_HEADER = 'title,composers';

/** Header + rows joined with LF. */
const csv = (...lines: string[]) => lines.join('\n');

/** Parses a body under `header` and returns the single row (fails the test otherwise). */
function one(header: string, line: string) {
  const result = parseImportCsv(csv(header, line));
  expect(result.errors).toEqual([]);
  expect(result.rows).toHaveLength(1);
  return result.rows[0]!;
}

/** Parses a body under `header` and returns the messages of the errors. */
function messages(header: string, ...lines: string[]) {
  return parseImportCsv(csv(header, ...lines)).errors.map((e) => e.message);
}

describe('template', () => {
  it('parses docs/import-template.csv without errors', () => {
    const text = readFileSync(path.join(process.cwd(), 'docs/import-template.csv'), 'utf8');
    const { rows, errors } = parseImportCsv(text, { branchCodes: ['SV', 'OR', 'CO', 'RF'] });
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(2);

    const [praise, hymn] = rows;
    expect(praise).toEqual({
      line: 2,
      idempotencyKey: 'example song of praise|2004',
      title: 'Example Song of Praise',
      altTitles: ['Example Praise Song', 'Song of Praise'],
      composers: [
        { name: 'Jane Example', popMember: 'current' },
        { name: 'John Sample', popMember: 'none' },
      ],
      sourceGroup: 'Example Music Group',
      year: 2004,
      primaryKey: 'D',
      altKeys: ['C', 'Eb'],
      tempoBpm: 128,
      timeSignature: '4/4',
      energyLevel: 'high_praise',
      energyNotes: 'Builds after verse 2; "big" final chorus',
      firstChords: { intro: 'D', verse: 'D', chorus: 'G', bridge: 'Bm' },
      themes: {
        chorus: ['praise', 'joy'],
        verse_1: ['creation'],
        verse_2: [],
        verse_3: [],
        verse_4: [],
        verse_5: [],
        bridge: ['trust'],
      },
      usage: [
        { branchCode: 'SV', level: 'high' },
        { branchCode: 'OR', level: 'low' },
        { branchCode: 'CO', level: 'rare' },
        { branchCode: 'RF', level: 'none' },
      ],
      addedByBranchCode: 'SV',
      youtubeLinks: ['https://www.youtube.com/watch?v=abcdefghijk'],
    });
    expect(hymn).toMatchObject({
      line: 3,
      composers: [{ name: 'Mary Placeholder', popMember: 'past' }],
      sourceGroup: null,
      primaryKey: 'Bbm',
      altKeys: [],
      energyNotes: null,
      firstChords: { intro: null, verse: 'Bbm', chorus: 'Gb', bridge: null },
      usage: [{ branchCode: 'SV', level: 'low' }],
      addedByBranchCode: 'OR',
      youtubeLinks: [],
    });
  });
});

describe('minimal row', () => {
  it('defaults every optional field', () => {
    expect(one(MIN_HEADER, 'Song,Someone')).toEqual({
      line: 2,
      idempotencyKey: 'song|',
      title: 'Song',
      altTitles: [],
      composers: [{ name: 'Someone', popMember: 'none' }],
      sourceGroup: null,
      year: null,
      primaryKey: null,
      altKeys: [],
      tempoBpm: null,
      timeSignature: null,
      energyLevel: null,
      energyNotes: null,
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
      addedByBranchCode: null,
      youtubeLinks: [],
    });
  });
});

describe('CSV syntax', () => {
  it('handles quoted commas, escaped quotes and embedded line breaks', () => {
    const { rows, errors } = parseImportCsv(
      csv(
        'title,composers,energy_notes',
        '"Song, with comma","A ""Quoted"" Name","line one\nline two\r\nline three\rend"',
        'Next,B',
      ),
    );
    expect(errors).toEqual([]);
    expect(rows[0]).toMatchObject({
      line: 2,
      title: 'Song, with comma',
      composers: [{ name: 'A "Quoted" Name', popMember: 'none' }],
      energyNotes: 'line one\nline two\nline three\nend',
    });
    // The quoted field spanned four physical lines (2–5).
    expect(rows[1]!.line).toBe(6);
  });

  it('accepts an empty quoted field', () => {
    expect(one('title,composers,year', 'Song,A,""').year).toBeNull();
  });

  it('keeps a stray quote inside an unquoted field', () => {
    expect(one('title,composers', 'The 12" Song,A').title).toBe('The 12" Song');
  });

  it('strips a UTF-8 BOM', () => {
    expect(one('﻿title,composers', 'Song,A').title).toBe('Song');
  });

  it('handles CRLF and CR line endings, with or without a final break', () => {
    for (const text of [
      'title,composers\r\nA,X\r\nB,Y\r\n',
      'title,composers\rA,X\rB,Y',
      'title,composers\nA,X\nB,Y\n',
    ]) {
      const { rows, errors } = parseImportCsv(text);
      expect(errors).toEqual([]);
      expect(rows.map((r) => [r.line, r.title])).toEqual([
        [2, 'A'],
        [3, 'B'],
      ]);
    }
  });

  it('skips blank rows, including rows of empty cells, but keeps line numbers', () => {
    const { rows, errors } = parseImportCsv(
      csv('', 'title,composers', '', ',', ' , ', 'Song,A', '', 'Other,B', ''),
    );
    expect(errors).toEqual([]);
    expect(rows.map((r) => r.line)).toEqual([6, 8]);
  });

  it('reports an unclosed quote on the line where the record starts', () => {
    const { rows, errors } = parseImportCsv(csv(MIN_HEADER, 'Good,A', 'Bad,"never closed', 'x'));
    expect(rows.map((r) => r.title)).toEqual(['Good']);
    expect(errors).toEqual([{ line: 3, message: 'Quoted field is never closed' }]);
  });

  it('reports text after a closing quote and continues with the next row', () => {
    const { rows, errors } = parseImportCsv(csv(MIN_HEADER, '"Bad"x,"A"y', 'Good,A', '"Fine",A'));
    expect(errors).toEqual([{ line: 2, message: 'Unexpected text after a closing quote' }]);
    expect(rows.map((r) => r.title)).toEqual(['Good', 'Fine']);
  });

  it('treats missing trailing cells as empty', () => {
    expect(one('title,composers,year,tempo_bpm', 'Song,A').tempoBpm).toBeNull();
  });

  it('trims cell values', () => {
    expect(one(' Title , COMPOSERS ', '  Song  ,  A  ')).toMatchObject({
      title: 'Song',
      composers: [{ name: 'A' }],
    });
  });
});

describe('header', () => {
  it('errors on an empty file', () => {
    for (const text of ['', '﻿', '\n\n', ',,\n']) {
      expect(parseImportCsv(text)).toEqual({
        rows: [],
        errors: [{ line: 1, message: 'The file is empty; a header row is required' }],
      });
    }
  });

  it('accepts a header with no data rows', () => {
    expect(parseImportCsv(MIN_HEADER)).toEqual({ rows: [], errors: [] });
  });

  it('accepts columns in any order and any case', () => {
    expect(one('YEAR,Composers,Title', '1999,A,Song')).toMatchObject({ title: 'Song', year: 1999 });
  });

  it('stops on a malformed header', () => {
    expect(parseImportCsv(csv('"title,composers', 'Song,A'))).toEqual({
      rows: [],
      errors: [{ line: 1, message: 'Header: Quoted field is never closed' }],
    });
  });

  it('stops when a required column is missing', () => {
    expect(parseImportCsv(csv('title,year', 'Song,2000'))).toEqual({
      rows: [],
      errors: [{ line: 1, message: 'Missing required column "composers"' }],
    });
    expect(parseImportCsv(csv('composers', 'A')).errors).toEqual([
      { line: 1, message: 'Missing required column "title"' },
    ]);
  });

  it('stops on a duplicate column, including usage columns that differ only in case', () => {
    expect(parseImportCsv(csv('title,composers,Title', 'a,b,c'))).toEqual({
      rows: [],
      errors: [{ line: 1, message: 'Column "Title" appears more than once' }],
    });
    expect(parseImportCsv(csv('title,composers,usage_SV,usage_sv', 'a,b,,')).errors).toEqual([
      { line: 1, message: 'Column "usage_sv" appears more than once' },
    ]);
  });

  it('reports unknown columns, ignores them, and still parses rows', () => {
    const { rows, errors } = parseImportCsv(csv('title,composers,lyrics', 'Song,A,Some words'));
    expect(errors).toEqual([
      { line: 1, message: 'Unknown column "lyrics"; the column is ignored' },
    ]);
    expect(rows).toHaveLength(1);
  });

  it('reports malformed usage columns', () => {
    const { rows, errors } = parseImportCsv(csv('title,composers,usage_,usage_Seattle', 'S,A,,'));
    expect(errors.map((e) => e.message)).toEqual([
      'Column "usage_" is not a valid branch column (use usage_<CODE>, e.g. usage_SV)',
      'Column "usage_Seattle" is not a valid branch column (use usage_<CODE>, e.g. usage_SV)',
    ]);
    expect(rows).toHaveLength(1);
  });

  it('reports usage columns for unknown branches when branch codes are given', () => {
    const text = csv('title,composers,usage_SV,usage_XX', 'Song,A,high,low');
    const { rows, errors } = parseImportCsv(text, { branchCodes: [' sv ', 'OR'] });
    expect(errors).toEqual([
      { line: 1, message: 'Column "usage_XX" refers to unknown branch XX; the column is ignored' },
    ]);
    expect(rows[0]!.usage).toEqual([{ branchCode: 'SV', level: 'high' }]);
    // Without a branch list any well-formed code is accepted.
    expect(parseImportCsv(text).rows[0]!.usage).toEqual([
      { branchCode: 'SV', level: 'high' },
      { branchCode: 'XX', level: 'low' },
    ]);
  });

  it('allows an unnamed trailing column but rejects values in it', () => {
    expect(one('title,composers,', 'Song,A,').title).toBe('Song');
    expect(messages('title,composers,', 'Song,A,oops', 'Song 2,B,,extra')).toEqual([
      'Value "oops" in column 3, which has no recognised header',
      'Value "extra" in column 4, which has no recognised header',
    ]);
  });
});

describe('per-row errors', () => {
  it('reports every problem with its line, skips bad rows, and never throws', () => {
    const { rows, errors } = parseImportCsv(
      csv(
        'title,composers,year,primary_key',
        'Good,A,2000,D',
        ',A,2000,D',
        'Bad,,abc,H',
        'Also good,B,,',
      ),
    );
    expect(rows.map((r) => r.title)).toEqual(['Good', 'Also good']);
    expect(errors).toEqual([
      { line: 3, message: 'title is required' },
      { line: 4, message: 'composers: at least one composer is required' },
      { line: 4, message: 'year "abc": Invalid input: expected number, received string' },
      { line: 4, message: 'primary_key "H": not a valid key (e.g. D, Db, F#m)' },
    ]);
  });

  it('rejects a title that is too long', () => {
    expect(messages(MIN_HEADER, `${'x'.repeat(201)},A`)).toEqual([
      'title: Too big: expected string to have <=200 characters',
    ]);
  });

  it('rejects duplicate songs (same lower-cased title and year) after the first', () => {
    const { rows, errors } = parseImportCsv(
      csv('title,composers,year', 'Song,A,2000', ' SONG ,B,2000', 'Song,C,2001', 'song,D,2000'),
    );
    expect(rows.map((r) => r.line)).toEqual([2, 4]);
    expect(errors).toEqual([
      { line: 3, message: 'Duplicate of line 2 (same title and year)' },
      { line: 5, message: 'Duplicate of line 2 (same title and year)' },
    ]);
  });
});

describe('composers', () => {
  const header = MIN_HEADER;

  it('reads POP markers case-insensitively and keeps order', () => {
    expect(one(header, 'S,Ann [past]; Bob ;Cy [Current];Di[PAST]').composers).toEqual([
      { name: 'Ann', popMember: 'past' },
      { name: 'Bob', popMember: 'none' },
      { name: 'Cy', popMember: 'current' },
      { name: 'Di', popMember: 'past' },
    ]);
  });

  it('collapses repeats of the same composer (case-insensitive)', () => {
    expect(one(header, 'S,Ann [past];ann [past];Bob').composers).toEqual([
      { name: 'Ann', popMember: 'past' },
      { name: 'Bob', popMember: 'none' },
    ]);
  });

  it('rejects conflicting markers for one composer', () => {
    expect(messages(header, 'S,Ann [past];Ann')).toEqual([
      'composers: "Ann" is listed twice with different markers',
    ]);
  });

  it('rejects unknown markers and malformed entries', () => {
    expect(messages(header, 'S,Ann [former];Bob [past;[current];C]d')).toEqual([
      'composers "Ann [former]": unknown marker [former] (use [past] or [current])',
      'composers "Bob [past": expected "Name", "Name [past]" or "Name [current]"',
      'composers "[current]": expected "Name", "Name [past]" or "Name [current]"',
      'composers "C]d": expected "Name", "Name [past]" or "Name [current]"',
    ]);
  });

  it('rejects an over-long name and too many composers', () => {
    expect(messages(header, `S,${'n'.repeat(201)}`)).toEqual([
      `composers "${'n'.repeat(201)}": name is too long`,
    ]);
    const eleven = Array.from({ length: 11 }, (_, i) => `C${i}`).join(';');
    expect(messages(header, `S,${eleven}`)).toEqual([
      'composers: at most 10 composers are allowed',
    ]);
  });

  it('requires a composer even when the cell holds only separators', () => {
    expect(messages(header, 'S, ; ;')).toEqual(['composers: at least one composer is required']);
  });
});

describe('multi-value cells', () => {
  it('splits on ";", trims and drops empties', () => {
    const row = one(
      'title,composers,alt_titles,themes_chorus,youtube_links',
      'S,A, One ;;Two; ,Joy; Holy  Spirit ;joy,https://youtu.be/a; https://youtu.be/b;https://youtu.be/a',
    );
    expect(row.altTitles).toEqual(['One', 'Two']);
    expect(row.themes.chorus).toEqual(['joy', 'holy spirit']);
    expect(row.youtubeLinks).toEqual(['https://youtu.be/a', 'https://youtu.be/b']);
  });

  it('maps every themes_<section> column', () => {
    const header =
      'title,composers,themes_chorus,themes_verse_1,themes_verse_2,themes_verse_3,themes_verse_4,themes_verse_5,themes_bridge';
    expect(one(header, 'S,A,c,v1,v2,v3,v4,v5,b').themes).toEqual({
      chorus: ['c'],
      verse_1: ['v1'],
      verse_2: ['v2'],
      verse_3: ['v3'],
      verse_4: ['v4'],
      verse_5: ['v5'],
      bridge: ['b'],
    });
  });

  it('rejects bad values inside multi-value cells', () => {
    expect(
      messages(
        'title,composers,alt_titles,themes_bridge,youtube_links',
        `S,A,${Array.from({ length: 11 }, (_, i) => `T${i}`).join(';')},${'t'.repeat(61)},ftp://x;not a url`,
      ),
    ).toEqual([
      'alt_titles: Too big: expected array to have <=10 items',
      `themes_bridge "${'t'.repeat(61)}": Too big: expected string to have <=60 characters`,
      'youtube_links "ftp://x": expected an http(s) URL',
      'youtube_links "not a url": expected an http(s) URL',
    ]);
  });
});

describe('scalar fields', () => {
  const header = 'title,composers,source_group,year,tempo_bpm,time_signature,energy_notes';

  it('parses valid values', () => {
    expect(one(header, 'S,A,Group,1975,96,6/8,Soft start')).toMatchObject({
      sourceGroup: 'Group',
      year: 1975,
      tempoBpm: 96,
      timeSignature: '6/8',
      energyNotes: 'Soft start',
      idempotencyKey: 's|1975',
    });
  });

  it('rejects out-of-range or malformed values', () => {
    expect(messages(header, `S,A,${'g'.repeat(101)},999,1.5,four,${'n'.repeat(501)}`)).toEqual([
      `source_group "${'g'.repeat(101)}": Too big: expected string to have <=100 characters`,
      'year "999": Too small: expected number to be >=1000',
      'tempo_bpm "1.5": Invalid input: expected number, received string',
      'time_signature "four": expected a time signature like 4/4 or 6/8',
      `energy_notes "${'n'.repeat(501)}": Too big: expected string to have <=500 characters`,
    ]);
    expect(messages(header, 'S,A,,2101,301,,')).toEqual([
      'year "2101": Too big: expected number to be <=2100',
      'tempo_bpm "301": Too big: expected number to be <=300',
    ]);
  });
});

describe('energy_level', () => {
  const header = 'title,composers,energy_level';

  it('accepts the enum value, the display label or the colour, case-insensitively', () => {
    expect(one(header, 'S,A,MID_WORSHIP').energyLevel).toBe('mid_worship');
    expect(one(header, `S,A,"Deep 'Worship'"`).energyLevel).toBe('deep_worship');
    expect(one(header, 'S,A,Yellow').energyLevel).toBe('high_worship');
  });

  it('rejects anything else', () => {
    expect(messages(header, 'S,A,loud')).toEqual([
      'energy_level "loud": expected one of high_praise, high_worship, mid_worship, deep_worship, quiet_worship',
    ]);
  });
});

describe('keys and chords', () => {
  const header =
    'title,composers,primary_key,alt_keys,intro_chord,verse_chord,chorus_chord,bridge_chord';

  it('parses keys and first chords; X means unknown', () => {
    expect(one(header, 'S,A,F#m,Am;Db,F#m,X,D/F#,Bm7')).toMatchObject({
      primaryKey: 'F#m',
      altKeys: ['Am', 'Db'],
      firstChords: { intro: 'F#m', verse: null, chorus: 'D/F#', bridge: 'Bm7' },
    });
  });

  it('rejects bad keys', () => {
    expect(messages(header, 'S,A,H,,,,,')).toEqual([
      'primary_key "H": not a valid key (e.g. D, Db, F#m)',
    ]);
    expect(messages(header, 'S,A,d,,,,,')).toEqual([
      'primary_key "d": not a valid key (e.g. D, Db, F#m)',
    ]);
    expect(messages(header, 'S,A,D,E;Cb#;x,,,,')).toEqual([
      'alt_keys "Cb#": not a valid key (e.g. D, Db, F#m)',
      'alt_keys "x": not a valid key (e.g. D, Db, F#m)',
    ]);
  });

  it('rejects duplicate keys and too many keys', () => {
    expect(messages(header, 'S,A,D,E;D,,,,')).toEqual(['alt_keys: Duplicate key D']);
    const twelve = ['C', 'Db', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B', 'Cm'].join(';');
    expect(messages(header, `S,A,D,${twelve},,,,`)).toEqual([
      'alt_keys: Too big: expected array to have <=12 items',
    ]);
  });

  it('requires primary_key for alt keys and chords', () => {
    expect(messages(header, 'S,A,,E,G,,,')).toEqual([
      'alt_keys: primary_key is required when alt_keys is set',
      'intro_chord: primary_key is required when chords are set',
    ]);
  });

  it('does not repeat key errors when the primary key itself is bad', () => {
    expect(messages(header, 'S,A,H,E,G,,,')).toEqual([
      'primary_key "H": not a valid key (e.g. D, Db, F#m)',
    ]);
  });

  it('rejects bad chords', () => {
    expect(messages(header, 'S,A,D,,H7,Gmaj7add9sus4x,,')).toEqual([
      'intro_chord "H7": not a valid chord (e.g. G, Bm7, D/F#)',
      'verse_chord "Gmaj7add9sus4x": not a valid chord (e.g. G, Bm7, D/F#)',
    ]);
  });
});

describe('usage and added_by', () => {
  const header = 'title,composers,usage_SV,usage_or,added_by';

  it('reads usage levels case-insensitively and leaves empty cells out', () => {
    expect(one(header, 'S,A,HIGH,,or')).toMatchObject({
      usage: [{ branchCode: 'SV', level: 'high' }],
      addedByBranchCode: 'OR',
    });
  });

  it('rejects bad usage levels and branch codes', () => {
    expect(messages(header, 'S,A,often,sometimes,Servant')).toEqual([
      'usage_SV "often": expected one of high, low, rare, none',
      'usage_OR "sometimes": expected one of high, low, rare, none',
      'added_by "Servant": expected a branch code like SV',
    ]);
  });

  it('rejects added_by codes outside the known branches', () => {
    const { errors } = parseImportCsv(csv('title,composers,added_by', 'S,A,ZZ'), {
      branchCodes: ['SV'],
    });
    expect(errors).toEqual([{ line: 2, message: 'added_by "ZZ": unknown branch ZZ' }]);
  });
});

describe('importIdempotencyKey', () => {
  it('lower-cases and trims the title and appends the year', () => {
    expect(importIdempotencyKey('  Amazing Song ', 1999)).toBe('amazing song|1999');
    expect(importIdempotencyKey('Song', null)).toBe('song|');
  });
});
