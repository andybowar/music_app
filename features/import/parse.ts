import type { z } from 'zod';

import {
  CHORD_SLOTS,
  ENERGY_LEVELS,
  ENERGY_META,
  MISSING_CHORD,
  SECTIONS,
  USAGE_LEVELS,
} from '@/types/domain';
import type {
  ChordSlot,
  EnergyLevel,
  MusicalKey,
  PopMember,
  Section,
  UsageLevel,
} from '@/types/domain';
import {
  resourceLinkInputSchema,
  songInputSchema,
  songKeyInputSchema,
  songKeysInputSchema,
  themeNameSchema,
} from '@/types/validation';

import type {
  ImportComposer,
  ImportError,
  ImportParseOptions,
  ImportParseResult,
  ImportRow,
  ImportUsage,
} from './types';

// ---------- CSV tokenizer (RFC 4180) ----------

interface CsvRecord {
  /** 1-based physical line where the record starts. */
  line: number;
  fields: string[];
  error?: string;
}

const isBreak = (c: string | undefined) => c === '\r' || c === '\n';

/**
 * Splits CSV text into records. Fields may be quoted with `"`; inside quotes `""` is a literal
 * quote and commas/line breaks are data. Line breaks are LF, CRLF or CR; breaks inside quoted
 * fields become `\n`. A `"` inside an unquoted field is kept literally. Never throws: a
 * malformed record carries an `error` and parsing moves on to the next line.
 */
function readRecords(text: string): CsvRecord[] {
  const records: CsvRecord[] = [];
  const n = text.length;
  let i = 0;
  let line = 1;

  while (i < n) {
    const record: CsvRecord = { line, fields: [] };
    for (;;) {
      let field = '';
      if (text[i] === '"') {
        i++;
        let closed = false;
        while (i < n) {
          const c = text[i]!;
          if (c === '"') {
            if (text[i + 1] === '"') {
              field += '"';
              i += 2;
              continue;
            }
            i++;
            closed = true;
            break;
          }
          if (isBreak(c)) {
            if (c === '\r' && text[i + 1] === '\n') i++;
            field += '\n';
            line++;
          } else {
            field += c;
          }
          i++;
        }
        if (!closed) {
          record.error = 'Quoted field is never closed';
        } else if (i < n && text[i] !== ',' && !isBreak(text[i])) {
          record.error ??= 'Unexpected text after a closing quote';
          while (i < n && text[i] !== ',' && !isBreak(text[i])) field += text[i++];
        }
      } else {
        while (i < n && text[i] !== ',' && !isBreak(text[i])) field += text[i++];
      }
      record.fields.push(field);

      if (text[i] === ',') {
        i++;
        continue;
      }
      if (i < n) {
        // Line break ends the record.
        if (text[i] === '\r' && text[i + 1] === '\n') i++;
        i++;
        line++;
      }
      break;
    }
    records.push(record);
  }
  return records;
}

// ---------- Columns ----------

const SCALAR_COLUMNS = [
  'title',
  'alt_titles',
  'composers',
  'source_group',
  'year',
  'primary_key',
  'alt_keys',
  'tempo_bpm',
  'time_signature',
  'energy_level',
  'energy_notes',
  'added_by',
  'youtube_links',
] as const;
type ScalarColumn = (typeof SCALAR_COLUMNS)[number];

const REQUIRED_COLUMNS: readonly ScalarColumn[] = ['title', 'composers'];

const chordColumn = (slot: ChordSlot) => `${slot}_chord`;
const themeColumn = (section: Section) => `themes_${section}`;
const USAGE_PREFIX = 'usage_';

type Column =
  | { kind: 'scalar'; name: ScalarColumn }
  | { kind: 'chord'; slot: ChordSlot }
  | { kind: 'theme'; section: Section }
  | { kind: 'usage'; code: string };

const NAMED_COLUMNS = new Map<string, Column>([
  ...SCALAR_COLUMNS.map((name): [string, Column] => [name, { kind: 'scalar', name }]),
  ...CHORD_SLOTS.map((slot): [string, Column] => [chordColumn(slot), { kind: 'chord', slot }]),
  ...SECTIONS.map((section): [string, Column] => [
    themeColumn(section),
    { kind: 'theme', section },
  ]),
]);

/** Mirrors the `branches.code` check in contracts/schema.md. */
const BRANCH_CODE_RE = /^[A-Z]{2,3}$/;
/** Mirrors `songInputSchema.composerIds` max. */
const MAX_COMPOSERS = 10;
const MAX_COMPOSER_NAME = 200;

interface Header {
  /**
   * Column index → column. `'ignored'` for named columns that were reported and are skipped;
   * null for unnamed columns, whose cells must stay empty.
   */
  columns: Array<Column | 'ignored' | null>;
  /** Column name (scalar/chord/theme) → index. */
  index: Map<string, number>;
  /** Usage columns in header order. */
  usage: Array<{ code: string; index: number }>;
}

function readHeader(
  record: CsvRecord,
  branchCodes: ReadonlySet<string> | null,
  errors: ImportError[],
): Header | null {
  const fail = (message: string) => errors.push({ line: record.line, message });
  if (record.error) {
    fail(`Header: ${record.error}`);
    return null;
  }

  const header: Header = { columns: [], index: new Map(), usage: [] };
  const seen = new Set<string>();
  let fatal = false;

  for (const [i, cell] of record.fields.entries()) {
    const raw = cell.trim();
    const name = raw.toLowerCase();
    let column: Column | 'ignored' | null = null;

    if (name === '') {
      // Unnamed column (e.g. a trailing comma); its cells must stay empty.
    } else if (name.startsWith(USAGE_PREFIX)) {
      const code = raw.slice(USAGE_PREFIX.length).trim().toUpperCase();
      if (!BRANCH_CODE_RE.test(code)) {
        fail(`Column "${raw}" is not a valid branch column (use usage_<CODE>, e.g. usage_SV)`);
        column = 'ignored';
      } else if (branchCodes && !branchCodes.has(code)) {
        fail(`Column "${raw}" refers to unknown branch ${code}; the column is ignored`);
        column = 'ignored';
      } else {
        column = { kind: 'usage', code };
      }
    } else {
      column = NAMED_COLUMNS.get(name) ?? 'ignored';
      if (column === 'ignored') fail(`Unknown column "${raw}"; the column is ignored`);
    }

    if (column && column !== 'ignored') {
      const key = column.kind === 'usage' ? `${USAGE_PREFIX}${column.code}` : name;
      if (seen.has(key)) {
        fail(`Column "${raw}" appears more than once`);
        fatal = true;
      } else {
        seen.add(key);
        if (column.kind === 'usage') header.usage.push({ code: column.code, index: i });
        else header.index.set(name, i);
      }
    }
    header.columns.push(column);
  }

  for (const required of REQUIRED_COLUMNS) {
    if (!header.index.has(required)) {
      fail(`Missing required column "${required}"`);
      fatal = true;
    }
  }
  return fatal ? null : header;
}

// ---------- Cell helpers ----------

const splitMulti = (cell: string) =>
  cell
    .split(';')
    .map((v) => v.trim())
    .filter((v) => v.length > 0);

const firstIssue = (error: z.ZodError) => error.issues[0]!.message;

const ENERGY_LOOKUP = new Map<string, EnergyLevel>(
  ENERGY_LEVELS.flatMap((level): Array<[string, EnergyLevel]> => [
    [level, level],
    [ENERGY_META[level].label.toLowerCase(), level],
    [ENERGY_META[level].color, level],
  ]),
);

const COMPOSER_RE = /^(.*?)\s*\[([^\]]*)\]$/;
const COMPOSER_MARKERS: Readonly<Record<string, PopMember>> = {
  past: 'past',
  current: 'current',
};

const songShape = songInputSchema.shape;
const keySchema = songKeyInputSchema.shape.key;
const chordSchema = songKeyInputSchema.shape.firstChords.unwrap().shape.intro;
const urlSchema = resourceLinkInputSchema.shape.url;

export function importIdempotencyKey(title: string, year: number | null): string {
  return `${title.trim().toLowerCase()}|${year ?? ''}`;
}

// ---------- Rows ----------

function readRow(
  record: CsvRecord,
  header: Header,
  branchCodes: ReadonlySet<string> | null,
  errors: ImportError[],
): ImportRow | null {
  const before = errors.length;
  const fail = (message: string) => errors.push({ line: record.line, message });
  const cellAt = (i: number | undefined) =>
    i === undefined ? '' : (record.fields[i] ?? '').trim();
  const cell = (name: string) => cellAt(header.index.get(name));

  record.fields.forEach((value, i) => {
    if (!header.columns[i] && value.trim() !== '') {
      fail(`Value "${value.trim()}" in column ${i + 1}, which has no recognised header`);
    }
  });

  /** Parses an optional cell with a schema; '' → null. */
  const optional = <T>(
    column: string,
    schema: z.ZodType<T | null>,
    convert: (raw: string) => unknown = (raw) => raw,
    hint?: string,
  ): T | null => {
    const raw = cell(column);
    if (raw === '') return null;
    const parsed = schema.safeParse(convert(raw));
    if (!parsed.success) {
      fail(`${column} "${raw}": ${hint ?? firstIssue(parsed.error)}`);
      return null;
    }
    return parsed.data;
  };
  const integer = (raw: string) => (/^\d+$/.test(raw) ? Number(raw) : raw);

  // title
  const title = cell('title');
  const titleParsed = songShape.title.safeParse(title);
  if (!titleParsed.success) {
    fail(title === '' ? 'title is required' : `title: ${firstIssue(titleParsed.error)}`);
  }

  // alt_titles
  const altTitlesRaw = splitMulti(cell('alt_titles'));
  const altTitlesParsed = songShape.altTitles.safeParse(altTitlesRaw);
  if (!altTitlesParsed.success) fail(`alt_titles: ${firstIssue(altTitlesParsed.error)}`);

  // composers
  const composers: ImportComposer[] = [];
  const composerNames = new Map<string, ImportComposer>();
  const composerCells = splitMulti(cell('composers'));
  if (composerCells.length === 0) fail('composers: at least one composer is required');
  if (composerCells.length > MAX_COMPOSERS) {
    fail(`composers: at most ${MAX_COMPOSERS} composers are allowed`);
  }
  for (const entry of composerCells) {
    const match = COMPOSER_RE.exec(entry);
    const name = (match ? match[1]! : entry).trim();
    let popMember: PopMember = 'none';
    if (match) {
      const marker = match[2]!.trim().toLowerCase();
      const known = COMPOSER_MARKERS[marker];
      if (!known) {
        fail(`composers "${entry}": unknown marker [${match[2]}] (use [past] or [current])`);
        continue;
      }
      popMember = known;
    }
    if (name === '' || /[[\]]/.test(name)) {
      fail(`composers "${entry}": expected "Name", "Name [past]" or "Name [current]"`);
      continue;
    }
    if (name.length > MAX_COMPOSER_NAME) {
      fail(`composers "${entry}": name is too long`);
      continue;
    }
    const existing = composerNames.get(name.toLowerCase());
    if (existing) {
      if (existing.popMember !== popMember) {
        fail(`composers: "${name}" is listed twice with different markers`);
      }
      continue;
    }
    const composer = { name, popMember };
    composerNames.set(name.toLowerCase(), composer);
    composers.push(composer);
  }

  // scalars
  const sourceGroup = optional('source_group', songShape.sourceGroup);
  const year = optional('year', songShape.year, integer);
  const tempoBpm = optional('tempo_bpm', songShape.tempoBpm, integer);
  const timeSignature = optional(
    'time_signature',
    songShape.timeSignature,
    undefined,
    'expected a time signature like 4/4 or 6/8',
  );
  const energyNotes = optional('energy_notes', songShape.energyNotes);

  const energyRaw = cell('energy_level');
  let energyLevel: EnergyLevel | null = null;
  if (energyRaw !== '') {
    energyLevel = ENERGY_LOOKUP.get(energyRaw.toLowerCase()) ?? null;
    if (!energyLevel) {
      fail(`energy_level "${energyRaw}": expected one of ${ENERGY_LEVELS.join(', ')}`);
    }
  }

  // keys
  const keyHint = 'not a valid key (e.g. D, Db, F#m)';
  const primaryKey = optional<MusicalKey>('primary_key', keySchema, undefined, keyHint);
  const primaryKeyCell = cell('primary_key');
  const altKeys: MusicalKey[] = [];
  let altKeysValid = true;
  for (const key of splitMulti(cell('alt_keys'))) {
    if (keySchema.safeParse(key).success) {
      altKeys.push(key);
    } else {
      fail(`alt_keys "${key}": ${keyHint}`);
      altKeysValid = false;
    }
  }
  if (altKeys.length > 0 && primaryKeyCell === '') {
    fail('alt_keys: primary_key is required when alt_keys is set');
  } else if (primaryKey && altKeysValid) {
    const keys = [primaryKey, ...altKeys].map((key, i) => ({
      key,
      isPrimary: i === 0,
      firstChords: {},
    }));
    const parsed = songKeysInputSchema.safeParse(keys);
    if (!parsed.success) fail(`alt_keys: ${firstIssue(parsed.error)}`);
  }

  // first chords
  const firstChords = Object.fromEntries(CHORD_SLOTS.map((s) => [s, null])) as Record<
    ChordSlot,
    string | null
  >;
  for (const slot of CHORD_SLOTS) {
    const column = chordColumn(slot);
    const raw = cell(column);
    if (raw === '' || raw === MISSING_CHORD) continue;
    if (primaryKeyCell === '') {
      fail(`${column}: primary_key is required when chords are set`);
      continue;
    }
    if (chordSchema.safeParse(raw).success) firstChords[slot] = raw;
    else fail(`${column} "${raw}": not a valid chord (e.g. G, Bm7, D/F#)`);
  }

  // themes
  const themes = Object.fromEntries(SECTIONS.map((s) => [s, [] as string[]])) as Record<
    Section,
    string[]
  >;
  for (const section of SECTIONS) {
    const column = themeColumn(section);
    for (const raw of splitMulti(cell(column))) {
      const parsed = themeNameSchema.safeParse(raw);
      if (!parsed.success) fail(`${column} "${raw}": ${firstIssue(parsed.error)}`);
      else if (!themes[section].includes(parsed.data)) themes[section].push(parsed.data);
    }
  }

  // usage
  const usage: ImportUsage[] = [];
  for (const { code, index } of header.usage) {
    const raw = cellAt(index);
    if (raw === '') continue;
    const level = raw.toLowerCase();
    if ((USAGE_LEVELS as readonly string[]).includes(level)) {
      usage.push({ branchCode: code, level: level as UsageLevel });
    } else {
      fail(`${USAGE_PREFIX}${code} "${raw}": expected one of ${USAGE_LEVELS.join(', ')}`);
    }
  }

  // added_by
  const addedByRaw = cell('added_by');
  let addedByBranchCode: string | null = null;
  if (addedByRaw !== '') {
    const code = addedByRaw.toUpperCase();
    if (!BRANCH_CODE_RE.test(code)) {
      fail(`added_by "${addedByRaw}": expected a branch code like SV`);
    } else if (branchCodes && !branchCodes.has(code)) {
      fail(`added_by "${addedByRaw}": unknown branch ${code}`);
    } else {
      addedByBranchCode = code;
    }
  }

  // youtube_links
  const youtubeLinks: string[] = [];
  for (const raw of splitMulti(cell('youtube_links'))) {
    if (urlSchema.safeParse(raw).success) {
      if (!youtubeLinks.includes(raw)) youtubeLinks.push(raw);
    } else {
      fail(`youtube_links "${raw}": expected an http(s) URL`);
    }
  }

  if (errors.length > before) return null;

  return {
    line: record.line,
    idempotencyKey: importIdempotencyKey(titleParsed.data!, year),
    title: titleParsed.data!,
    altTitles: altTitlesParsed.data!,
    composers,
    sourceGroup,
    year,
    primaryKey,
    altKeys: primaryKey ? altKeys : [],
    tempoBpm,
    timeSignature,
    energyLevel,
    energyNotes,
    firstChords,
    themes,
    usage,
    addedByBranchCode,
    youtubeLinks,
  };
}

const isBlank = (record: CsvRecord) => !record.error && record.fields.every((f) => f.trim() === '');

/**
 * Parses the import CSV (contracts/api.md §Import format). Header row required; columns may
 * appear in any order and are matched case-insensitively. Blank rows are skipped. Every problem
 * is reported as `{ line, message }` (1-based physical line; header problems use the header's
 * line) and a record with any error is left out of `rows`. Never throws.
 */
export function parseImportCsv(csv: string, options: ImportParseOptions = {}): ImportParseResult {
  const errors: ImportError[] = [];
  const rows: ImportRow[] = [];
  const branchCodes = options.branchCodes
    ? new Set(options.branchCodes.map((c) => c.trim().toUpperCase()))
    : null;

  const records = readRecords(csv.startsWith('﻿') ? csv.slice(1) : csv).filter((r) => !isBlank(r));
  const [headerRecord, ...body] = records;
  if (!headerRecord) {
    errors.push({ line: 1, message: 'The file is empty; a header row is required' });
    return { rows, errors };
  }
  const header = readHeader(headerRecord, branchCodes, errors);
  if (!header) return { rows, errors };

  const firstLineByKey = new Map<string, number>();
  for (const record of body) {
    if (record.error) {
      errors.push({ line: record.line, message: record.error });
      continue;
    }
    const row = readRow(record, header, branchCodes, errors);
    if (!row) continue;
    const firstLine = firstLineByKey.get(row.idempotencyKey);
    if (firstLine !== undefined) {
      errors.push({
        line: row.line,
        message: `Duplicate of line ${firstLine} (same title and year)`,
      });
      continue;
    }
    firstLineByKey.set(row.idempotencyKey, row.line);
    rows.push(row);
  }
  return { rows, errors };
}
