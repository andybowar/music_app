// @vitest-environment node
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ImportRow } from '@/features/import/types';
import { MAX_UPLOAD_BYTES } from '@/types/domain';

import type { ImportReport } from './import';

vi.mock('server-only', () => ({}));

const {
  changedSongFields,
  chordColumnsFromRow,
  errorMessage,
  fileProblem,
  linkLabel,
  listFiles,
  main,
  parseArgs,
  renderReport,
  songFieldsFromRow,
  uploadLabel,
  UsageError,
} = await import('./import');

function row(overrides: Partial<ImportRow> = {}): ImportRow {
  return {
    line: 2,
    idempotencyKey: 'example song|2004',
    title: 'Example Song',
    altTitles: [],
    composers: [{ name: 'Jane Example', popMember: 'none' }],
    sourceGroup: null,
    year: 2004,
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
    ...overrides,
  };
}

describe('parseArgs', () => {
  it('reads every flag, in either form', () => {
    expect(
      parseArgs([
        '--csv',
        'songs.csv',
        '--files=./folder',
        '--actor',
        ' admin@example.test ',
        '--dry-run',
        '--report',
        'out.md',
      ]),
    ).toEqual({
      csv: 'songs.csv',
      files: './folder',
      actor: 'admin@example.test',
      dryRun: true,
      report: 'out.md',
    });
  });

  it('defaults the optional flags and ignores a bare --', () => {
    expect(parseArgs(['--', '--csv', 'a.csv', '--actor', 'a@example.test'])).toEqual({
      csv: 'a.csv',
      files: null,
      actor: 'a@example.test',
      dryRun: false,
      report: null,
    });
  });

  it.each([
    [[], '--csv is required.'],
    [['--csv', 'a.csv'], '--actor is required (an admin email).'],
    [['--csv'], '--csv needs a value.'],
    [['--csv', '--dry-run'], '--csv needs a value.'],
    [['--csv='], '--csv needs a value.'],
    [['--csv', 'a', '--csv', 'b'], '--csv was given twice.'],
    [['--nope'], 'Unknown argument "--nope".'],
    [['songs.csv'], 'Unknown argument "songs.csv".'],
  ])('rejects %j', (argv, message) => {
    expect(() => parseArgs(argv)).toThrow(new UsageError(message));
  });
});

describe('errorMessage', () => {
  it('prefers the cause of a failed query and keeps other causes', () => {
    const failed = new Error('Failed query: select 1', { cause: new Error('connection refused') });
    expect(errorMessage(failed)).toBe('connection refused');
    expect(errorMessage(new Error('outer', { cause: new Error('inner') }))).toBe('outer (inner)');
    expect(errorMessage(new Error('plain'))).toBe('plain');
    expect(errorMessage('text')).toBe('text');
    expect(errorMessage({ code: 1 })).toBe('{"code":1}');
  });
});

describe('main', () => {
  it('prints usage and exits 2 on bad arguments', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await main(['--bogus'])).toBe(2);
    expect(error.mock.calls[0]![0]).toContain('Usage: pnpm run import');
    error.mockRestore();
  });
});

describe('songFieldsFromRow', () => {
  it('sets only title and year when the other cells are empty', () => {
    expect(songFieldsFromRow(row(), null)).toEqual({ title: 'Example Song', year: 2004 });
  });

  it('includes every filled cell', () => {
    expect(
      songFieldsFromRow(
        row({
          altTitles: ['Other'],
          sourceGroup: 'Group',
          tempoBpm: 120,
          timeSignature: '6/8',
          energyLevel: 'high_praise',
          energyNotes: 'Big',
          year: null,
        }),
        'branch-1',
      ),
    ).toEqual({
      title: 'Example Song',
      year: null,
      altTitles: ['Other'],
      sourceGroup: 'Group',
      tempoBpm: 120,
      timeSignature: '6/8',
      energyLevel: 'high_praise',
      energyNotes: 'Big',
      addedByBranchId: 'branch-1',
    });
  });
});

describe('changedSongFields', () => {
  const current = {
    title: 'Example Song',
    year: 2004,
    altTitles: ['Other'],
    sourceGroup: null,
    tempoBpm: 100,
    timeSignature: '4/4',
    energyLevel: null,
    energyNotes: null,
    addedByBranchId: null,
  };

  it('is empty when nothing differs', () => {
    expect(
      changedSongFields(current, { title: 'Example Song', year: 2004, altTitles: ['Other'] }),
    ).toEqual([]);
  });

  it('lists the differing fields with labels', () => {
    expect(
      changedSongFields(current, {
        title: 'Example song',
        year: 2004,
        altTitles: ['Other', 'More'],
        tempoBpm: 110,
        energyLevel: 'quiet_worship',
      }),
    ).toEqual([
      ['title', 'title'],
      ['altTitles', 'alternate titles'],
      ['tempoBpm', 'tempo'],
      ['energyLevel', 'energy'],
    ]);
  });
});

describe('chordColumnsFromRow', () => {
  it('maps only filled chords', () => {
    expect(
      chordColumnsFromRow(
        row({ firstChords: { intro: 'D', verse: null, chorus: 'G', bridge: null } }),
      ),
    ).toEqual({ introChord: 'D', chorusChord: 'G' });
    expect(
      chordColumnsFromRow(
        row({ firstChords: { intro: null, verse: 'A', chorus: null, bridge: 'Bm' } }),
      ),
    ).toEqual({ verseChord: 'A', bridgeChord: 'Bm' });
  });
});

describe('linkLabel', () => {
  it('names YouTube links and numbers later ones', () => {
    expect(linkLabel('https://youtu.be/abcdefghijk', 1)).toBe('YouTube');
    expect(linkLabel('https://www.youtube.com/watch?v=abcdefghijk', 2)).toBe('YouTube 2');
    expect(linkLabel('https://vimeo.com/123', 1)).toBe('Video');
    expect(linkLabel('https://vimeo.com/123', 3)).toBe('Video 3');
  });
});

describe('fileProblem', () => {
  const pdf = new TextEncoder().encode('%PDF-1.7');

  it('accepts a well-formed file', () => {
    expect(fileProblem(pdf.length, pdf, 'pdf')).toBeNull();
  });

  it('rejects empty, oversized and mislabelled files', () => {
    expect(fileProblem(0, new Uint8Array(), 'pdf')).toBe('the file is empty');
    expect(fileProblem(MAX_UPLOAD_BYTES + 1, pdf, 'pdf')).toBe('the file is larger than 50 MB');
    expect(fileProblem(pdf.length, pdf, 'mp3')).toBe("the file doesn't look like a .mp3 file");
  });
});

describe('uploadLabel', () => {
  it('adds the key when there is one', () => {
    expect(uploadLabel({ label: 'Chord Chart 2', key: 'D' })).toBe('Chord Chart 2 (D)');
    expect(uploadLabel({ label: 'Projection', key: null })).toBe('Projection');
  });
});

describe('listFiles', () => {
  let dir: string | undefined;
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it('lists nested files relative to the folder, skipping hidden ones', async () => {
    dir = await mkdtemp(join(tmpdir(), 'imp03-'));
    await mkdir(join(dir, 'Sub'));
    await mkdir(join(dir, '.git'));
    await writeFile(join(dir, 'B - D - Chord Chart.pdf'), 'x');
    await writeFile(join(dir, 'Sub', 'A - Projection.pptx'), 'x');
    await writeFile(join(dir, '.DS_Store'), 'x');
    await writeFile(join(dir, '.git', 'config'), 'x');
    expect(await listFiles(dir)).toEqual(['B - D - Chord Chart.pdf', 'Sub/A - Projection.pptx']);
  });
});

describe('renderReport', () => {
  const base: ImportReport = {
    dryRun: false,
    csvPath: 'songs.csv',
    filesDir: './files',
    actorEmail: 'admin@example.test',
    songs: [],
    errors: [],
    unmatchedFiles: [],
  };

  it('renders every section with counts', () => {
    const md = renderReport({
      ...base,
      songs: [
        {
          line: 2,
          title: 'New *Song*',
          year: 2004,
          status: 'created',
          changes: [],
          uploads: ['Chord Chart (D)'],
          warnings: ['new composer "Jane Example"'],
        },
        {
          line: 3,
          title: 'Old Song',
          year: null,
          status: 'updated',
          changes: ['tempo', 'themes (chorus)'],
          uploads: ['Projection'],
          warnings: [],
        },
        {
          line: 4,
          title: 'Same Song',
          year: 1990,
          status: 'skipped',
          changes: [],
          uploads: [],
          warnings: [],
        },
      ],
      errors: [
        { line: 5, message: 'composers: at least one is required' },
        { line: null, message: 'general problem' },
      ],
      unmatchedFiles: ['Mystery - D - Chord Chart.pdf'],
    });

    expect(md).toContain('# Song import report\n');
    expect(md).not.toContain('Dry run');
    expect(md).toContain('| 1 | 1 | 1 | 2 | 2 | 1 |');
    expect(md).toContain(
      '## Created\n\n- line 2: **New \\*Song\\*** (2004) (files: Chord Chart (D))',
    );
    expect(md).toContain(
      '## Updated\n\n- line 3: **Old Song**: tempo; themes (chorus); Projection uploaded',
    );
    expect(md).toContain('## Unchanged (skipped)\n\n- line 4: **Same Song** (1990)');
    expect(md).toContain('- line 5: composers: at least one is required');
    expect(md).toContain('\n- general problem');
    expect(md).toContain('## Warnings\n\n- line 2: **New \\*Song\\*** (2004): new composer');
    expect(md).toContain('## Unmatched files\n\n- `Mystery - D - Chord Chart.pdf`');
  });

  it('marks a dry run and leaves out empty sections', () => {
    const md = renderReport({
      ...base,
      dryRun: true,
      filesDir: null,
      songs: [
        {
          line: 2,
          title: 'A',
          year: null,
          status: 'created',
          changes: [],
          uploads: [],
          warnings: [],
        },
      ],
    });
    expect(md).toContain('# Song import report (dry run)');
    expect(md).toContain('nothing was saved');
    expect(md).toContain('- Files folder: none');
    expect(md).toContain('## Would be created\n\n- line 2: **A**\n');
    for (const heading of ['Updated', 'Unchanged', 'Errors', 'Warnings', 'Unmatched']) {
      expect(md).not.toContain(`## ${heading}`);
    }
  });
});
