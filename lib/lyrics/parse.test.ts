import { songInputSchema } from '@/types/validation';

import { firstLine, parseLyrics } from './parse';

// All lyrics below are invented.
const V1 = 'Morning light upon the hill\nEvery heart is waiting still';
const V2 = 'River running to the sea\nCarry all our songs to thee';
const V3 = 'Lanterns burning through the night';
const CH = 'Sing out, sing out\nLet the whole earth shout';
const BR = 'Higher, higher, ever higher';

const join = (...parts: string[]) => parts.join('\n');

function expectValid(result: ReturnType<typeof parseLyrics>) {
  const parsed = songInputSchema.safeParse({
    title: 'Invented song',
    composerIds: ['3f2b8c1e-6a4d-4e2f-9b1a-7c5d3e8f0a12'],
    lyrics: result.lyrics,
    arrangement: result.arrangement,
  });
  expect(parsed.success).toBe(true);
}

describe('parseLyrics', () => {
  it('splits a standard verse/chorus/bridge song', () => {
    const r = parseLyrics(
      join('Verse 1', V1, '', 'Chorus', CH, '', 'Verse 2', V2, '', 'Chorus', '', 'Bridge', BR),
    );
    expect(r.lyrics).toEqual({ verse_1: V1, verse_2: V2, chorus: CH, bridge: BR });
    expect(r.arrangement).toEqual(['verse_1', 'chorus', 'verse_2', 'chorus', 'bridge']);
    expect(r.warnings).toEqual([]);
    expectValid(r);
  });

  it.each([
    'Chorus',
    'CHORUS:',
    '[Chorus]',
    '[Chorus:]',
    '(Chorus)',
    '{chorus}',
    '## Chorus',
    '**Chorus**',
    'Refrain',
    'Chorus 1',
    'Final chorus',
    'Cho.',
    '  chorus  ',
  ])('recognises %j as the chorus', (heading) => {
    const r = parseLyrics(join(heading, CH));
    expect(r.lyrics).toEqual({ chorus: CH });
    expect(r.arrangement).toEqual(['chorus']);
  });

  it.each([
    ['Verse 1', 'verse_1'],
    ['V1', 'verse_1'],
    ['v.2', 'verse_2'],
    ['Verse One', 'verse_1'],
    ['VERSE TWO:', 'verse_2'],
    ['[Verse 3]', 'verse_3'],
    ['Verse 4.', 'verse_4'],
    ['First verse', 'verse_1'],
    ['2nd Verse', 'verse_2'],
    ['Verse IV', 'verse_4'],
    ['Stanza 5', 'verse_5'],
    ['Vs 3', 'verse_3'],
  ])('recognises %j as %s', (heading, section) => {
    const r = parseLyrics(join(heading, V1));
    expect(r.lyrics).toEqual({ [section]: V1 });
    expect(r.arrangement).toEqual([section]);
  });

  it.each(['Bridge', 'BRIDGE:', '[Bridge]', 'Br', 'Bridge 1'])(
    'recognises %j as the bridge',
    (h) => {
      expect(parseLyrics(join(h, BR)).lyrics).toEqual({ bridge: BR });
    },
  );

  it('does not treat lyric lines that merely start with a heading word as headings', () => {
    const text = join(
      'Verse 1',
      'Chorus of angels singing',
      'Verse after verse we sing',
      'Change the night to day',
      'Bridges over water',
      'Vamp',
    );
    const r = parseLyrics(text);
    expect(r.lyrics.verse_1).toBe(
      'Chorus of angels singing\nVerse after verse we sing\nChange the night to day\nBridges over water',
    );
    expect(r.warnings).toEqual(['Ignored the "Vamp" heading because it has no lyrics under it.']);
  });

  it('expands repeat markers into the arrangement', () => {
    for (const h of [
      'Chorus x2',
      'Chorus (x2)',
      'CHORUS X 2:',
      '[Chorus x2]',
      '[Chorus] (2x)',
      'Chorus ×2',
      'Chorus 2 times',
    ]) {
      const r = parseLyrics(join('Verse 1', V1, h, CH));
      expect(r.arrangement, h).toEqual(['verse_1', 'chorus', 'chorus']);
      expect(r.lyrics.chorus, h).toBe(CH);
    }
  });

  it('treats a repeated heading with no body as "sing it again"', () => {
    const r = parseLyrics(
      join('Chorus', CH, 'Verse 1', V1, 'Chorus', 'Repeat chorus', '(Chorus x2)'),
    );
    expect(r.arrangement).toEqual(['chorus', 'verse_1', 'chorus', 'chorus', 'chorus', 'chorus']);
    expect(r.lyrics).toEqual({ chorus: CH, verse_1: V1 });
    expect(r.warnings).toEqual([]);
  });

  it('treats "Chorus (repeat)" as a repeat', () => {
    const r = parseLyrics(join('Chorus', CH, 'Chorus (repeat)'));
    expect(r.arrangement).toEqual(['chorus', 'chorus']);
  });

  it('does not duplicate text when a repeated heading carries the same lyrics', () => {
    const r = parseLyrics(join('Chorus:', CH, '', 'Verse 1', V1, '', 'CHORUS', CH.toUpperCase()));
    expect(r.lyrics.chorus).toBe(CH);
    expect(r.arrangement).toEqual(['chorus', 'verse_1', 'chorus']);
    expect(r.warnings).toEqual([]);
  });

  it('appends differing text under a repeated heading and warns', () => {
    const r = parseLyrics(join('Chorus', CH, 'Verse 1', V1, 'Chorus', 'A different ending line'));
    expect(r.lyrics.chorus).toBe(`${CH}\n\nA different ending line`);
    expect(r.arrangement).toEqual(['chorus', 'verse_1', 'chorus']);
    expect(r.warnings).toEqual([
      '"Chorus" has different lyrics from the earlier Chorus, so they were added to the end of Chorus.',
    ]);
  });

  it('folds a second bridge into the bridge field (SPEC §6 default)', () => {
    const r = parseLyrics(join('Bridge', BR, 'Chorus', CH, 'Bridge 2', 'Deeper, deeper still'));
    expect(r.lyrics.bridge).toBe(`${BR}\n\nDeeper, deeper still`);
    expect(r.arrangement).toEqual(['bridge', 'chorus', 'bridge']);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toContain('"Bridge 2"');
  });

  it('collapses back-to-back merged sections into one arrangement entry', () => {
    const r = parseLyrics(join('Bridge', BR, 'Bridge 2', 'Deeper, deeper still'));
    expect(r.arrangement).toEqual(['bridge']);
    expect(r.lyrics.bridge).toBe(`${BR}\n\nDeeper, deeper still`);
  });

  it('folds a pre-chorus into the previous section', () => {
    const r = parseLyrics(
      join(
        'Verse 1',
        V1,
        'Pre-Chorus',
        'Lift it up',
        'Chorus',
        CH,
        'Verse 2',
        V2,
        'PRE-CHORUS:',
        'Lift it up',
        'Chorus',
      ),
    );
    expect(r.lyrics.verse_1).toBe(`${V1}\n\nLift it up`);
    expect(r.lyrics.verse_2).toBe(`${V2}\n\nLift it up`);
    expect(r.arrangement).toEqual(['verse_1', 'chorus', 'verse_2', 'chorus']);
    expect(r.warnings).toEqual([
      '"Pre-Chorus" has no field of its own, so its lyrics were added to the end of Verse 1.',
      '"PRE-CHORUS" has no field of its own, so its lyrics were added to the end of Verse 2.',
    ]);
    expectValid(r);
  });

  it('reuses a remembered pre-chorus when its heading repeats without lyrics', () => {
    const r = parseLyrics(
      join(
        'Verse 1',
        V1,
        '[Prechorus]',
        'Lift it up',
        'Chorus',
        CH,
        'Verse 2',
        V2,
        '[Prechorus]',
        'Chorus',
      ),
    );
    expect(r.lyrics.verse_2).toBe(`${V2}\n\nLift it up`);
    expect(r.warnings).toContain(
      '"Prechorus" has no field of its own, so its lyrics were added to the end of Verse 2.',
    );
  });

  it('does not re-append a remembered fold that is already there', () => {
    const r = parseLyrics(
      join('Chorus', CH, 'Tag', 'One more time', 'Verse 1', V1, 'Chorus', 'Tag'),
    );
    expect(r.lyrics.chorus).toBe(`${CH}\n\nOne more time`);
    expect(r.arrangement).toEqual(['chorus', 'verse_1', 'chorus']);
    expect(r.warnings).toEqual([
      '"Tag" has no field of its own, so its lyrics were added to the end of Chorus.',
    ]);
  });

  it('does not append the same fold text twice in a row', () => {
    const r = parseLyrics(join('Chorus', CH, 'Tag', 'One more time', 'Tag', 'One more time'));
    expect(r.lyrics.chorus).toBe(`${CH}\n\nOne more time`);
  });

  it('ignores an empty fold heading when the current section is a repeat', () => {
    const r = parseLyrics(
      join('Chorus', CH, 'Tag', 'One more', 'Verse 1', V1, 'Tag', 'Chorus', 'Tag x2'),
    );
    // "Tag" after verse 1: verse is fresh, so the tag is appended there.
    expect(r.lyrics.verse_1).toBe(`${V1}\n\nOne more`);
    // "Tag x2" after a repeated chorus that already ends with it: nothing to do.
    expect(r.lyrics.chorus).toBe(`${CH}\n\nOne more`);
  });

  it('warns and ignores fold headings with no lyrics and nothing to reuse', () => {
    const r = parseLyrics(join('Intro', 'Verse 1', V1, 'Instrumental', 'Outro'));
    expect(r.lyrics).toEqual({ verse_1: V1 });
    expect(r.arrangement).toEqual(['verse_1']);
    expect(r.warnings).toEqual([
      'Ignored the "Intro" heading because it has no lyrics under it.',
      'Ignored the "Instrumental" heading because it has no lyrics under it.',
      'Ignored the "Outro" heading because it has no lyrics under it.',
    ]);
  });

  it('ignores an empty remembered fold when the current section is not fresh', () => {
    const r = parseLyrics(join('Verse 1', V1, 'Tag', 'Amen', 'Chorus', CH, 'Verse 1', 'Tag'));
    // verse 1 repeated (no new text) and already ends with the tag: skipped silently.
    expect(r.lyrics.verse_1).toBe(`${V1}\n\nAmen`);
    const r2 = parseLyrics(join('Verse 1', V1, 'Tag', 'Amen', 'Chorus', CH, 'Chorus', 'Tag'));
    expect(r2.lyrics.chorus).toBe(CH);
    expect(r2.warnings).toContain('Ignored the "Tag" heading because it has no lyrics under it.');
  });

  it('warns that a repeat on a folded heading is ignored', () => {
    const r = parseLyrics(join('Chorus', CH, 'Tag x3', 'Forever'));
    expect(r.lyrics.chorus).toBe(`${CH}\n\nForever`);
    expect(r.arrangement).toEqual(['chorus']);
    expect(r.warnings).toContain(
      'The repeat on "Tag x3" was ignored because it was folded into Chorus.',
    );
  });

  it('folds a heading before any section into verse 1', () => {
    const r = parseLyrics(join('Pre-chorus 1', 'Lift it up', 'Chorus', CH, 'Verse', V2));
    expect(r.lyrics.verse_1).toBe('Lift it up');
    expect(r.lyrics.verse_2).toBe(V2);
    expect(r.arrangement).toEqual(['verse_1', 'chorus', 'verse_2']);
    expectValid(r);
  });

  it('puts unlabeled leading text in verse 1', () => {
    const r = parseLyrics(join(V1, '', 'Chorus', CH, '', 'Verse 2', V2));
    expect(r.lyrics).toEqual({ verse_1: V1, chorus: CH, verse_2: V2 });
    expect(r.arrangement).toEqual(['verse_1', 'chorus', 'verse_2']);
    expect(r.warnings).toEqual(['Text before the first heading was put in Verse 1.']);
  });

  it('puts everything in verse 1 when there are no headings', () => {
    const r = parseLyrics(join(V1, '', '', '', V2));
    expect(r.lyrics).toEqual({ verse_1: `${V1}\n\n${V2}` });
    expect(r.arrangement).toEqual(['verse_1']);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toMatch(/No section headings found/);
  });

  it('numbers unlabeled "Verse" headings in order and repeats the last verse when empty', () => {
    const r = parseLyrics(
      join('Verse', V1, 'Chorus', CH, 'Verse', V2, 'Chorus', 'Verse', 'Verse:', V1, 'Verse', V3),
    );
    expect(r.lyrics).toEqual({ verse_1: V1, verse_2: V2, verse_3: V3, chorus: CH });
    expect(r.arrangement).toEqual([
      'verse_1',
      'chorus',
      'verse_2',
      'chorus',
      'verse_2',
      'verse_1',
      'verse_3',
    ]);
  });

  it('continues numbering after explicitly numbered verses', () => {
    const r = parseLyrics(join('Verse 2', V2, 'Verse', V3));
    expect(r.lyrics).toEqual({ verse_2: V2, verse_3: V3 });
  });

  it('merges an explicit verse 1 into leading unlabeled text', () => {
    const r = parseLyrics(join('A short preface line', 'Verse 1', V1, 'Verse', V2));
    expect(r.lyrics.verse_1).toBe(`A short preface line\n\n${V1}`);
    expect(r.lyrics.verse_2).toBe(V2);
    expect(r.arrangement).toEqual(['verse_1', 'verse_2']);
    expect(r.warnings).toHaveLength(2);
  });

  it('merges an unnumbered verse into text already folded into verse 1', () => {
    const r = parseLyrics(join('Tag', 'Amen', 'Verse', V2));
    expect(r.lyrics).toEqual({ verse_2: V2, verse_1: 'Amen' });
  });

  it('counts an empty numbered verse heading when numbering later verses', () => {
    // "Verse 1" with no body bumps the counter to 1 but leaves verse_1 empty; the "Verse"
    // that follows then becomes verse 2.
    const r = parseLyrics(join('Verse 1', 'Verse', V1, 'Verse 2', V2));
    expect(r.lyrics.verse_2).toBe(`${V1}\n\n${V2}`);
    expect(r.warnings).toContain(
      '"Verse 2" has different lyrics from the earlier Verse 2, so they were added to the end of Verse 2.',
    );
    expect(r.warnings).toContain('"Verse 1" was left out of the order because it has no lyrics.');
    expectValid(r);
  });

  it('keeps numbering and folds after empty or repeated verse headings', () => {
    const r = parseLyrics(join('Verse 1', V1, 'Verse 2', 'Verse 1', 'Verse', V3));
    // counter is at 2 (verse_2 empty), so "Verse" → verse_3.
    expect(r.lyrics.verse_3).toBe(V3);
    const r2 = parseLyrics(join('Verse', V1, 'Tag', 'Amen', 'Verse 2', V2, 'Verse 1'));
    expect(r2.lyrics.verse_1).toBe(`${V1}\n\nAmen`);
  });

  it('folds verses beyond 5 into verse 5 and warns', () => {
    const verses = [1, 2, 3, 4, 5, 6, 7].map((n) => `Verse ${n}\nLine of verse ${n}`);
    const r = parseLyrics(verses.join('\n\n'));
    expect(r.lyrics.verse_5).toBe('Line of verse 5\n\nLine of verse 6\n\nLine of verse 7');
    expect(r.arrangement).toEqual(['verse_1', 'verse_2', 'verse_3', 'verse_4', 'verse_5']);
    expect(r.warnings).toEqual([
      'Only 5 verses are supported; "Verse 6" was added to Verse 5.',
      'Only 5 verses are supported; "Verse 7" was added to Verse 5.',
    ]);
    expectValid(r);
  });

  it('folds unnumbered verses beyond 5 into verse 5 and warns', () => {
    const r = parseLyrics([1, 2, 3, 4, 5, 6].map((n) => `Verse\nLine of verse ${n}`).join('\n'));
    expect(r.lyrics.verse_5).toBe('Line of verse 5\n\nLine of verse 6');
    expect(r.warnings).toEqual(['Only 5 verses are supported; verse 6 was added to Verse 5.']);
  });

  it('accepts a verse 6 when verse 5 is still empty', () => {
    const r = parseLyrics(join('Verse 6', V1));
    expect(r.lyrics).toEqual({ verse_5: V1 });
    expect(r.warnings).toHaveLength(1);
  });

  it('handles CRLF, CR, tabs, BOM, trailing whitespace and extra blank lines', () => {
    const text =
      '﻿Verse 1:   \r\n\tMorning light upon the hill   \r\nEvery heart is waiting still\t\r\n\r\n\r\n\r\n' +
      '[Chorus]\rSing out, sing out  \r\n   Let the whole earth shout\r\n   \r\n';
    const r = parseLyrics(text);
    expect(r.lyrics).toEqual({ verse_1: V1, chorus: CH });
    expect(r.arrangement).toEqual(['verse_1', 'chorus']);
    expect(r.warnings).toEqual([]);
  });

  it('keeps one blank line between stanzas inside a section', () => {
    const r = parseLyrics(join('Chorus', 'Line one', '', '', '', 'Line two', '', ''));
    expect(r.lyrics.chorus).toBe('Line one\n\nLine two');
  });

  it('supports a heading with its first lyric line on the same line', () => {
    const r = parseLyrics(
      join(
        'Verse 1: Morning light upon the hill',
        'Every heart is waiting still',
        '[Chorus] Sing out, sing out',
        'Let the whole earth shout',
        'Note: not a heading',
      ),
    );
    expect(r.lyrics.verse_1).toBe(V1);
    expect(r.lyrics.chorus).toBe(`${CH}\nNote: not a heading`);
  });

  it('drops arrangement entries whose section never gets lyrics', () => {
    const r = parseLyrics(join('Chorus', 'Verse 1', V1, 'Bridge', 'Bridge'));
    expect(r.lyrics).toEqual({ verse_1: V1 });
    expect(r.arrangement).toEqual(['verse_1']);
    expect(r.warnings).toEqual([
      '"Chorus" was left out of the order because it has no lyrics.',
      '"Bridge" was left out of the order because it has no lyrics.',
    ]);
    expectValid(r);
  });

  it('keeps an arrangement entry for a heading listed before its lyrics', () => {
    const r = parseLyrics(join('Verse', 'Chorus', CH));
    expect(r.arrangement).toEqual(['chorus']);
    expect(r.warnings).toEqual(['"Verse 1" was left out of the order because it has no lyrics.']);
  });

  it('caps repeats per heading and the arrangement length', () => {
    const r = parseLyrics(join('Chorus x50', CH));
    expect(r.arrangement).toHaveLength(10);
    const many = parseLyrics(join('Chorus x10', CH, 'Chorus x10', 'Chorus x10', 'Chorus x5'));
    expect(many.arrangement).toHaveLength(30);
    expect(many.warnings).toEqual(['The order was cut to the first 30 sections.']);
    expectValid(many);
  });

  it('treats x0 as a single occurrence', () => {
    expect(parseLyrics(join('Chorus x0', CH)).arrangement).toEqual(['chorus']);
  });

  it('warns when a section is longer than the schema allows', () => {
    const long = 'la '.repeat(2000).trim();
    const r = parseLyrics(join('Chorus', long));
    expect(r.warnings).toEqual(['Chorus is longer than 5000 characters and must be shortened.']);
  });

  it('rejects headings with unknown numbers or overly long labels', () => {
    const r = parseLyrics(
      join(
        'Chorus',
        CH,
        'Verse zero',
        'Verse 0',
        'Chorus three hundred',
        'Bridge over',
        `Chorus ${'x'.repeat(50)}`,
      ),
    );
    expect(r.lyrics.chorus).toBe(
      `${CH}\nVerse zero\nVerse 0\nChorus three hundred\nBridge over\nChorus ${'x'.repeat(50)}`,
    );
  });

  it('returns empty results for empty or blank input', () => {
    expect(parseLyrics('')).toEqual({ lyrics: {}, arrangement: [], warnings: [] });
    expect(parseLyrics(' \r\n\n\t ')).toEqual({ lyrics: {}, arrangement: [], warnings: [] });
  });

  it('produces input that songInputSchema accepts for a messy paste', () => {
    const r = parseLyrics(
      join(
        'Intro',
        'V1',
        V1,
        'Pre-Chorus:',
        'Lift it up',
        '[CHORUS x2]',
        CH,
        'Verse Two',
        V2,
        'Pre-Chorus',
        'Chorus',
        'Bridge',
        BR,
        'Bridge 2',
        'Deeper still',
        'Refrain (x2)',
        'Tag',
        'Amen',
        'Outro',
      ),
    );
    expect(r.arrangement).toEqual([
      'verse_1',
      'chorus',
      'chorus',
      'verse_2',
      'chorus',
      'bridge',
      'chorus',
      'chorus',
    ]);
    expect(r.lyrics.bridge).toBe(`${BR}\n\nDeeper still`);
    expectValid(r);
  });
});

describe('firstLine', () => {
  it('returns the first non-blank trimmed line', () => {
    expect(firstLine('\n  \r\n  Morning light upon the hill  \nEvery heart')).toBe(
      'Morning light upon the hill',
    );
    expect(firstLine('Sing out\r\nLet the earth')).toBe('Sing out');
  });

  it('returns null for null, empty or blank text', () => {
    expect(firstLine(null)).toBeNull();
    expect(firstLine('')).toBeNull();
    expect(firstLine(' \n\t\r\n')).toBeNull();
  });
});
