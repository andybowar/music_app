import { MAX_UPLOAD_BYTES } from './domain';
import type { SearchParams } from './domain';
import {
  listInputSchema,
  listItemPatchSchema,
  resourceLinkInputSchema,
  searchParamsSchema,
  serializeSearchParams,
  songInputSchema,
  songKeyInputSchema,
  songKeysInputSchema,
  themeNameSchema,
  uploadRequestSchema,
  usageInputSchema,
} from './validation';

const ID1 = '00000000-0000-4000-8000-000000000001';
const ID2 = '00000000-0000-4000-8000-000000000002';
const SEQ_ID = '00000000-0000-0000-0000-000000000003'; // hand-written fixture style

const issuePaths = (r: { success: boolean; error?: { issues: { path: PropertyKey[] }[] } }) =>
  r.error?.issues.map((i) => i.path.join('.')) ?? [];

describe('songInputSchema', () => {
  const minimal = { title: 'Sample song', composerIds: [ID1] };

  it('accepts a minimal song and fills defaults', () => {
    expect(songInputSchema.parse(minimal)).toEqual({
      title: 'Sample song',
      altTitles: [],
      composerIds: [ID1],
      sourceGroup: null,
      year: null,
      tempoBpm: null,
      timeSignature: null,
      energyLevel: null,
      energyNotes: null,
      lyrics: {},
      arrangement: [],
    });
  });

  it('accepts a full song with arrangement repeats', () => {
    const r = songInputSchema.safeParse({
      ...minimal,
      title: '  Trimmed  ',
      altTitles: ['Other name'],
      composerIds: [ID2, ID1, SEQ_ID],
      sourceGroup: 'Group',
      year: 1999,
      tempoBpm: 72,
      timeSignature: '6/8',
      energyLevel: 'deep_worship',
      energyNotes: 'starts light, slow build',
      lyrics: { verse_1: 'First line', chorus: 'Chorus line', bridge: null },
      arrangement: ['verse_1', 'chorus', 'verse_1', 'chorus'],
      addedByBranchId: ID1,
    });
    expect(r.success).toBe(true);
    expect(r.data?.title).toBe('Trimmed');
    expect(r.data?.composerIds).toEqual([ID2, ID1, SEQ_ID]); // order kept
  });

  it.each([
    ['empty title', { title: '   ' }, 'title'],
    ['long title', { title: 'x'.repeat(201) }, 'title'],
    ['too many alt titles', { altTitles: Array(11).fill('a') }, 'altTitles'],
    ['long alt title', { altTitles: ['x'.repeat(201)] }, 'altTitles.0'],
    ['no composers', { composerIds: [] }, 'composerIds'],
    ['too many composers', { composerIds: Array(11).fill(ID1) }, 'composerIds'],
    ['bad composer id', { composerIds: ['nope'] }, 'composerIds.0'],
    ['long source group', { sourceGroup: 'x'.repeat(101) }, 'sourceGroup'],
    ['year too low', { year: 999 }, 'year'],
    ['year too high', { year: 2101 }, 'year'],
    ['fractional year', { year: 1999.5 }, 'year'],
    ['tempo too low', { tempoBpm: 19 }, 'tempoBpm'],
    ['tempo too high', { tempoBpm: 301 }, 'tempoBpm'],
    ['bad time signature', { timeSignature: '4-4' }, 'timeSignature'],
    ['bad energy', { energyLevel: 'loud' }, 'energyLevel'],
    ['long energy notes', { energyNotes: 'x'.repeat(501) }, 'energyNotes'],
    ['long lyrics', { lyrics: { chorus: 'x'.repeat(5001) } }, 'lyrics.chorus'],
    ['bad section', { arrangement: ['pre_chorus'] }, 'arrangement.0'],
    ['bad branch id', { addedByBranchId: 'SV' }, 'addedByBranchId'],
  ])('rejects %s', (_name, patch, path) => {
    const r = songInputSchema.safeParse({ ...minimal, ...patch });
    expect(r.success).toBe(false);
    expect(issuePaths(r)).toContain(path);
  });

  it('rejects arrangements longer than 30', () => {
    const r = songInputSchema.safeParse({
      ...minimal,
      lyrics: { chorus: 'Line' },
      arrangement: Array(31).fill('chorus'),
    });
    expect(issuePaths(r)).toContain('arrangement');
  });

  it('rejects arrangement entries whose section has no lyrics', () => {
    const r = songInputSchema.safeParse({
      ...minimal,
      lyrics: { chorus: 'Line', verse_1: '  ', verse_2: null },
      arrangement: ['chorus', 'verse_1', 'verse_2', 'bridge'],
    });
    expect(r.success).toBe(false);
    expect(issuePaths(r)).toEqual(['arrangement.1', 'arrangement.2', 'arrangement.3']);
  });
});

describe('songKeyInputSchema', () => {
  it.each(['C', 'Db', 'F#m', 'Bbm'])('accepts key %s', (key) => {
    expect(songKeyInputSchema.safeParse({ key, isPrimary: true }).success).toBe(true);
  });

  it('accepts an optional id and rejects a non-uuid one', () => {
    const id = '30000000-0000-4000-8000-000000000001';
    expect(songKeyInputSchema.parse({ id, key: 'D', isPrimary: true }).id).toBe(id);
    expect(songKeyInputSchema.parse({ key: 'D', isPrimary: true }).id).toBeUndefined();
    expect(
      issuePaths(songKeyInputSchema.safeParse({ id: 'x', key: 'D', isPrimary: true })),
    ).toContain('id');
  });

  it('accepts first chords, partial and null', () => {
    const r = songKeyInputSchema.parse({
      key: 'D',
      isPrimary: false,
      firstChords: { intro: 'G', verse: 'D/F#', chorus: null },
    });
    expect(r.firstChords).toEqual({ intro: 'G', verse: 'D/F#', chorus: null });
    expect(songKeyInputSchema.parse({ key: 'D', isPrimary: false }).firstChords).toEqual({});
  });

  it.each([
    ['lowercase key', { key: 'd', isPrimary: true }, 'key'],
    ['bad key', { key: 'H', isPrimary: true }, 'key'],
    ['missing isPrimary', { key: 'D' }, 'isPrimary'],
    ['bad chord', { key: 'D', isPrimary: true, firstChords: { intro: 'X' } }, 'firstChords.intro'],
    [
      'long chord',
      { key: 'D', isPrimary: true, firstChords: { verse: 'Cmaj7add9sus4' } },
      'firstChords.verse',
    ],
  ])('rejects %s', (_name, input, path) => {
    expect(issuePaths(songKeyInputSchema.safeParse(input))).toContain(path);
  });
});

describe('songKeysInputSchema', () => {
  it('accepts one primary and unique keys', () => {
    const r = songKeysInputSchema.safeParse([
      { key: 'D', isPrimary: true },
      { key: 'Dm', isPrimary: false },
      { key: 'E', isPrimary: false },
    ]);
    expect(r.success).toBe(true);
  });

  it.each([
    ['empty', []],
    ['more than 12', Array.from({ length: 13 }, (_, i) => ({ key: 'C', isPrimary: i === 0 }))],
    ['no primary', [{ key: 'D', isPrimary: false }]],
    [
      'two primaries',
      [
        { key: 'D', isPrimary: true },
        { key: 'E', isPrimary: true },
      ],
    ],
    [
      'duplicate ids',
      [
        { id: '30000000-0000-4000-8000-000000000001', key: 'D', isPrimary: true },
        { id: '30000000-0000-4000-8000-000000000001', key: 'E', isPrimary: false },
      ],
    ],
    [
      'duplicate keys',
      [
        { key: 'D', isPrimary: true },
        { key: 'D', isPrimary: false },
      ],
    ],
  ])('rejects %s', (_name, input) => {
    expect(songKeysInputSchema.safeParse(input).success).toBe(false);
  });
});

describe('resourceLinkInputSchema', () => {
  const link = {
    songId: ID1,
    songKeyId: ID2,
    kind: 'video_link',
    label: 'YouTube',
    url: 'https://example.com/watch?v=1',
  };

  it('accepts a key-less projection link', () => {
    const parsed = resourceLinkInputSchema.safeParse({
      ...link,
      kind: 'projection',
      songKeyId: null,
    });
    expect(parsed.success).toBe(true);
    expect(
      resourceLinkInputSchema.safeParse({ ...link, kind: 'projection', songKeyId: undefined }).data
        ?.songKeyId,
    ).toBeNull();
  });

  it('accepts an http(s) link for a keyed kind', () => {
    expect(resourceLinkInputSchema.safeParse(link).success).toBe(true);
    expect(resourceLinkInputSchema.safeParse({ ...link, url: 'http://example.com' }).success).toBe(
      true,
    );
  });

  it.each([
    ['missing song key', { songKeyId: undefined }, 'songKeyId'],
    ['null song key', { songKeyId: null }, 'songKeyId'],
    ['bad song id', { songId: 'x' }, 'songId'],
    ['bad kind', { kind: 'tab' }, 'kind'],
    ['kind without url format', { kind: 'full_score' }, 'kind'],
    ['projection link with key', { kind: 'projection' }, 'songKeyId'],
    ['empty label', { label: ' ' }, 'label'],
    ['long label', { label: 'x'.repeat(121) }, 'label'],
    ['ftp url', { url: 'ftp://example.com/file' }, 'url'],
    ['javascript url', { url: 'javascript:alert(1)' }, 'url'],
    ['not a url', { url: 'example' }, 'url'],
  ])('rejects %s', (_name, patch, path) => {
    expect(issuePaths(resourceLinkInputSchema.safeParse({ ...link, ...patch }))).toContain(path);
  });
});

describe('uploadRequestSchema', () => {
  const upload = {
    songId: ID1,
    songKeyId: ID2,
    kind: 'lead_sheet',
    format: 'pdf',
    label: 'Lead sheet',
    sizeBytes: 1024,
    mimeType: 'application/pdf',
  };

  it('accepts keyed and projection uploads', () => {
    expect(uploadRequestSchema.safeParse(upload).success).toBe(true);
    expect(
      uploadRequestSchema.safeParse({
        ...upload,
        kind: 'projection',
        format: 'pro',
        songKeyId: null,
        sizeBytes: MAX_UPLOAD_BYTES,
      }).success,
    ).toBe(true);
  });

  it.each([
    ['format not allowed for kind', { format: 'mp3' }, 'format'],
    ['url format', { kind: 'audio', format: 'url' }, 'format'],
    ['keyed kind without key', { songKeyId: null }, 'songKeyId'],
    ['projection with key', { kind: 'projection', format: 'pptx' }, 'songKeyId'],
    ['too large', { sizeBytes: MAX_UPLOAD_BYTES + 1 }, 'sizeBytes'],
    ['zero bytes', { sizeBytes: 0 }, 'sizeBytes'],
    ['empty mime type', { mimeType: '' }, 'mimeType'],
    ['empty label', { label: '' }, 'label'],
  ])('rejects %s', (_name, patch, path) => {
    expect(issuePaths(uploadRequestSchema.safeParse({ ...upload, ...patch }))).toContain(path);
  });
});

describe('themeNameSchema', () => {
  it('trims, collapses whitespace and lowercases', () => {
    expect(themeNameSchema.parse('  Holy   Spirit\t Fire ')).toBe('holy spirit fire');
  });

  it.each(['', '   ', 'x'.repeat(61)])('rejects %j', (name) => {
    expect(themeNameSchema.safeParse(name).success).toBe(false);
  });

  it('accepts 60 chars after normalization', () => {
    expect(themeNameSchema.safeParse(` ${'X'.repeat(60)} `).success).toBe(true);
  });
});

describe('usageInputSchema', () => {
  it('accepts rows and an empty list', () => {
    expect(
      usageInputSchema.safeParse([
        { branchId: ID1, level: 'high' },
        { branchId: ID2, level: 'none' },
      ]).success,
    ).toBe(true);
    expect(usageInputSchema.safeParse([]).success).toBe(true);
  });

  it.each([
    ['bad level', [{ branchId: ID1, level: 'often' }]],
    ['bad branch id', [{ branchId: 'SV', level: 'high' }]],
    [
      'duplicate branch',
      [
        { branchId: ID1, level: 'high' },
        { branchId: ID1, level: 'low' },
      ],
    ],
    ['not an array', { branchId: ID1, level: 'high' }],
  ])('rejects %s', (_name, input) => {
    expect(usageInputSchema.safeParse(input).success).toBe(false);
  });
});

describe('listInputSchema', () => {
  it('accepts a setlist with a date and a playlist without one', () => {
    expect(
      listInputSchema.parse({ type: 'setlist', name: 'Sunday', eventDate: '2026-11-01' }),
    ).toEqual({ type: 'setlist', name: 'Sunday', eventDate: '2026-11-01' });
    expect(listInputSchema.parse({ type: 'playlist', name: 'Quiet' })).toEqual({
      type: 'playlist',
      name: 'Quiet',
      eventDate: null,
    });
  });

  it.each([
    ['setlist without date', { type: 'setlist', name: 'Sunday' }, 'eventDate'],
    ['setlist with null date', { type: 'setlist', name: 'Sunday', eventDate: null }, 'eventDate'],
    ['bad date', { type: 'playlist', name: 'Q', eventDate: '2026-13-01' }, 'eventDate'],
    ['datetime', { type: 'playlist', name: 'Q', eventDate: '2026-11-01T10:00:00Z' }, 'eventDate'],
    ['bad type', { type: 'mix', name: 'Q' }, 'type'],
    ['empty name', { type: 'playlist', name: '' }, 'name'],
    ['long name', { type: 'playlist', name: 'x'.repeat(121) }, 'name'],
  ])('rejects %s', (_name, input, path) => {
    expect(issuePaths(listInputSchema.safeParse(input))).toContain(path);
  });
});

describe('listItemPatchSchema', () => {
  it('accepts empty, values and nulls', () => {
    expect(listItemPatchSchema.parse({})).toEqual({});
    const full = {
      overrideKey: 'Eb',
      overrideBpm: 120,
      overrideEnergy: 'high_praise',
      resourceId: ID1,
      notes: 'Capo 1',
    };
    expect(listItemPatchSchema.parse(full)).toEqual(full);
    const cleared = {
      overrideKey: null,
      overrideBpm: null,
      overrideEnergy: null,
      resourceId: null,
      notes: null,
    };
    expect(listItemPatchSchema.parse(cleared)).toEqual(cleared);
  });

  it.each([
    ['bad key', { overrideKey: 'E#b' }, 'overrideKey'],
    ['bpm too high', { overrideBpm: 301 }, 'overrideBpm'],
    ['bpm too low', { overrideBpm: 10 }, 'overrideBpm'],
    ['bad energy', { overrideEnergy: 'medium' }, 'overrideEnergy'],
    ['bad resource id', { resourceId: '1' }, 'resourceId'],
    ['long notes', { notes: 'x'.repeat(501) }, 'notes'],
  ])('rejects %s', (_name, input, path) => {
    expect(issuePaths(listItemPatchSchema.safeParse(input))).toContain(path);
  });
});

describe('searchParamsSchema', () => {
  const parse = (x: unknown) => searchParamsSchema.parse(x);

  it('parses an empty query to {}', () => {
    expect(parse(new URLSearchParams())).toEqual({});
    expect(parse('')).toEqual({});
  });

  it('parses every param', () => {
    expect(
      parse(
        new URLSearchParams(
          'q=amazing+grace&fields=lyrics,title&energy=quiet_worship&energy=high_praise' +
            '&key=D&key=F%23m&decade=1990,1980&branch=SV&usage=high,rare' +
            '&chordChorus=G&chordVerse=D%2FF%23&chordBridge=Em7&sort=alpha&dir=asc&page=3&pageSize=20',
        ),
      ),
    ).toEqual({
      q: 'amazing grace',
      fields: ['title', 'lyrics'],
      energy: ['high_praise', 'quiet_worship'],
      key: ['D', 'F#m'],
      decade: [1980, 1990],
      branch: 'SV',
      usage: ['high', 'rare'],
      chordChorus: ['G'],
      chordVerse: ['D/F#'],
      chordBridge: ['Em7'],
      sort: 'alpha',
      dir: 'asc',
      page: 3,
      pageSize: 20,
    });
  });

  it('accepts query strings and Next.js searchParams records', () => {
    expect(parse('?q=love&energy=mid_worship')).toEqual({ q: 'love', energy: ['mid_worship'] });
    expect(
      parse({ q: 'love', energy: ['mid_worship', 'deep_worship'], key: undefined, x: 1 }),
    ).toEqual({ q: 'love', energy: ['mid_worship', 'deep_worship'] });
  });

  it('treats repeated keys and comma lists the same', () => {
    expect(parse('energy=high_praise&energy=mid_worship')).toEqual(
      parse('energy=mid_worship,high_praise'),
    );
  });

  it('drops invalid values and keeps valid ones', () => {
    expect(
      parse(
        'q=%20%20&fields=title,nope&energy=loud,high_praise&key=H,d,Db&decade=1995,abc,1990,3000' +
          '&branch=nowhere&usage=high&chordChorus=X,G,,Cmaj7add9sus4&sort=random&dir=up' +
          '&page=0&pageSize=500&unknown=1',
      ),
    ).toEqual({
      fields: ['title'],
      energy: ['high_praise'],
      key: ['Db'],
      decade: [1990],
      chordChorus: ['G'],
    });
  });

  it.each([
    ['page', 'page=-1'],
    ['page', 'page=1.5'],
    ['page', 'page=1e3'],
    ['page', 'page=99999999'],
    ['pageSize', 'pageSize=0'],
    ['pageSize', 'pageSize=101'],
  ])('drops invalid %s (%s)', (_k, qs) => {
    expect(parse(qs)).toEqual({});
  });

  it('omits defaults', () => {
    expect(
      parse('fields=title,lyrics,themes,composer&sort=date&page=1&pageSize=50&branch=OR'),
    ).toEqual({ branch: 'OR' });
    expect(parse('branch=OR&usage=rare,high,low')).toEqual({ branch: 'OR' });
  });

  it('keeps sort=date when q is present (default is then relevance)', () => {
    expect(parse('q=joy&sort=date')).toEqual({ q: 'joy', sort: 'date' });
  });

  it('drops usage without a branch and normalizes branch case', () => {
    expect(parse('usage=high')).toEqual({});
    expect(parse('branch=sv&usage=none')).toEqual({ branch: 'SV', usage: ['none'] });
  });

  it('dedupes lists and caps q length', () => {
    expect(parse('key=D,D,C&energy=high_praise,high_praise')).toEqual({
      key: ['C', 'D'],
      energy: ['high_praise'],
    });
    expect(parse(`q=${'a'.repeat(300)}`).q).toHaveLength(200);
  });

  it.each([null, undefined, 42, true, [], () => 'x', new Date()])('never throws on %s', (input) => {
    expect(() => parse(input)).not.toThrow();
    expect(searchParamsSchema.safeParse(input).success).toBe(true);
  });

  it('never throws on malformed encodings', () => {
    expect(() => parse('q=%E0%A4%A&%zz=1&energy=%')).not.toThrow();
  });
});

describe('serializeSearchParams', () => {
  it('serializes the default search to an empty string', () => {
    expect(serializeSearchParams({})).toBe('');
    expect(serializeSearchParams({ page: 1, pageSize: 50, sort: 'date' })).toBe('');
  });

  it('uses a stable key order and comma lists', () => {
    const p: SearchParams = {
      pageSize: 20,
      sort: 'key',
      chordVerse: ['D/F#', 'C+'],
      key: ['F#m', 'D'],
      energy: ['quiet_worship', 'high_praise'],
      q: 'come, lord',
      branch: 'SV',
      decade: [1990, 1980],
    };
    expect(serializeSearchParams(p)).toBe(
      'q=come%2C%20lord&energy=high_praise,quiet_worship&key=D,F%23m&decade=1980,1990' +
        '&branch=SV&chordVerse=C%2B,D%2FF%23&sort=key&pageSize=20',
    );
  });

  it('drops invalid values in its input', () => {
    expect(
      serializeSearchParams({ key: ['H'], energy: ['nope' as never], page: 0, usage: ['high'] }),
    ).toBe('');
  });

  const samples = [
    '',
    'q=amazing+grace&fields=lyrics,title',
    'energy=quiet_worship&energy=high_praise&key=D&key=F%23m',
    'decade=1990,1980&branch=sv&usage=high,rare&sort=branch_use&dir=desc',
    'chordChorus=G,C&chordVerse=D%2FF%23&chordBridge=Em7&page=3&pageSize=20',
    'q=joy&sort=date&page=1&pageSize=50&fields=title,lyrics,themes,composer',
    'q=%20x%20&key=H&energy=loud&page=abc&branch=OR&usage=low,high,rare',
  ];

  it.each(samples)('round-trips %j', (qs) => {
    const parsed = searchParamsSchema.parse(new URLSearchParams(qs));
    const s = serializeSearchParams(parsed);
    // Inverse: parsing the canonical string gives the same params.
    expect(searchParamsSchema.parse(new URLSearchParams(s))).toEqual(parsed);
    // Idempotent: serializing again gives the identical string.
    expect(serializeSearchParams(searchParamsSchema.parse(s))).toBe(s);
  });

  it('gives equal strings for equivalent URLs', () => {
    const a = serializeSearchParams(
      searchParamsSchema.parse('key=F%23m&energy=mid_worship&key=D&q=hope&page=1'),
    );
    const b = serializeSearchParams(
      searchParamsSchema.parse('q=hope&energy=mid_worship&key=D,F%23m,D'),
    );
    expect(a).toBe(b);
    expect(a).toBe('q=hope&energy=mid_worship&key=D,F%23m');
  });
});
