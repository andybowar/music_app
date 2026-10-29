import { KIND_FORMATS, RESOURCE_FORMATS } from '@/types/domain';
import type { MusicalKey, ResourceFormat, ResourceKind } from '@/types/domain';

import type { ImportRow } from './types';

/**
 * One file in the import folder matched to a CSV row (REQ-LIB-13).
 *
 * Naming convention (`contracts/api.md`):
 * - keyed: `<Title> - <Key> - <Kind>[ <n>].<ext>`, e.g. `1000 Hallelujahs - D - Chord Chart 2.pdf`
 * - projection: `<Title> - Projection[ <n>].<pro|mdb|ppt|pptx>`
 */
export interface FileMatch {
  /** The path exactly as given. */
  path: string;
  /** The matched row's `idempotencyKey`. */
  idempotencyKey: string;
  /** The matched row's `line`, so the runner can report against the CSV. */
  line: number;
  /** Which field of the row the filename title matched. */
  matchedOn: 'title' | 'alt_title';
  /** 1 for an exact match after normalization; in `[FUZZY_THRESHOLD, 1)` for a fuzzy one. */
  confidence: number;
  /** Normalized key (`MUSICAL_KEY_RE`); null for projection files. */
  key: MusicalKey | null;
  /** True when `key` is the row's primary key or one of its alt keys (always true for projection). */
  keyInRow: boolean;
  kind: ResourceKind;
  format: ResourceFormat;
  /** `<n>` from the filename; 1 when absent. */
  index: number;
  /** Resource label, e.g. `Chord Chart`, `Chord Chart 2`, `Projection`. */
  label: string;
}

export interface MatchFilesResult {
  matched: FileMatch[];
  unmatched: string[];
}

/** Minimum similarity (0–1) for a fuzzy title match. */
export const FUZZY_THRESHOLD = 0.85;

/** Filename kind names (normalized) → resource kind and display label. */
const KIND_NAMES: Record<string, { kind: ResourceKind; label: string }> = {
  'full score': { kind: 'full_score', label: 'Full Score' },
  'lead sheet': { kind: 'lead_sheet', label: 'Lead Sheet' },
  'chord chart': { kind: 'chord_chart', label: 'Chord Chart' },
  audio: { kind: 'audio', label: 'Audio' },
  mp3: { kind: 'audio', label: 'Audio' },
  instruction: { kind: 'instruction_link', label: 'Instruction' },
  projection: { kind: 'projection', label: 'Projection' },
};

const FILE_FORMATS = RESOURCE_FORMATS.filter((f) => f !== 'url');

/**
 * Normalizes a title for comparison: Unicode-folded, diacritics and apostrophes removed,
 * `&` read as `and`, other punctuation as a space, lower case, whitespace collapsed.
 */
export function normalizeTitle(title: string): string {
  return title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['‘’`]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/**
 * Reads a key as written in a filename: `D`, `db`, `DB`, `F#`, `F♯`, `Bbm`, `C min`, `A minor`.
 * Returns the canonical form matching `MUSICAL_KEY_RE` (`Db`, `F#`, `Bbm`, `Cm`) or null.
 */
export function normalizeKey(raw: string): MusicalKey | null {
  const m = /^([A-Ga-g])\s*([#♯b♭B]?)\s*(m|min|minor)?$/i.exec(raw.trim());
  if (!m) return null;
  const letter = m[1]!;
  const accidental = m[2];
  const minor = m[3];
  const acc = accidental === '♯' || accidental === '#' ? '#' : accidental ? 'b' : '';
  // `M` alone usually means major in chord notation, so do not read it as minor.
  if (minor === 'M') return null;
  return `${letter.toUpperCase()}${acc}${minor ? 'm' : ''}`;
}

interface ParsedName {
  title: string;
  key: MusicalKey | null;
  kind: ResourceKind;
  format: ResourceFormat;
  index: number;
  label: string;
}

const kindKey = (s: string) =>
  s
    .toLowerCase()
    .replace(/[\s_]+/g, ' ')
    .trim();

/**
 * Reads `<Kind>[ <n>]`. The whole text is tried as a kind name first, so the `3` in `MP3`
 * is not taken for a number.
 */
function readKind(text: string): { entry: (typeof KIND_NAMES)[string]; index: number } | null {
  const whole = KIND_NAMES[kindKey(text)];
  if (whole) return { entry: whole, index: 1 };
  const m = /^(.*?)\s*(\d+)$/.exec(text);
  const entry = m && KIND_NAMES[kindKey(m[1]!)];
  return entry ? { entry, index: Number(m[2]) } : null;
}

/** Parses a path's file name against the naming convention; null when it does not fit. */
export function parseFileName(path: string): ParsedName | null {
  const base = path.split(/[\\/]/).pop()!.normalize('NFC').trim();
  const dot = base.lastIndexOf('.');
  if (dot <= 0) return null;
  const ext = base.slice(dot + 1).toLowerCase();
  const format = FILE_FORMATS.find((f) => f === ext);
  if (!format) return null;

  const parts = base
    .slice(0, dot)
    .split(/\s+[-–—]\s+/)
    .map((p) => p.trim());
  if (parts.length < 2) return null;

  const kindPart = readKind(parts.pop()!);
  if (!kindPart) return null;
  const { entry, index } = kindPart;
  if (index < 1) return null;
  if (!KIND_FORMATS[entry.kind].includes(format)) return null;

  let key: MusicalKey | null = null;
  if (entry.kind !== 'projection') {
    if (parts.length < 2) return null;
    key = normalizeKey(parts.pop()!);
    if (!key) return null;
  }

  const title = parts.join(' - ');
  if (!normalizeTitle(title)) return null;
  const label = index === 1 ? entry.label : `${entry.label} ${index}`;
  return { title, key, kind: entry.kind, format, index, label };
}

/** Levenshtein-based similarity in [0, 1]. */
export function similarity(a: string, b: string): number {
  if (a === b) return 1;
  const longest = Math.max(a.length, b.length);
  if (!a.length || !b.length) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + cost);
    }
    prev = cur;
  }
  return 1 - prev[b.length]! / longest;
}

interface Candidate {
  row: ImportRow;
  normalized: string;
  matchedOn: FileMatch['matchedOn'];
}

interface Best {
  row: ImportRow;
  matchedOn: FileMatch['matchedOn'];
  confidence: number;
}

interface Index {
  exact: Map<string, Candidate[]>;
  all: Candidate[];
}

function buildIndex(rows: ImportRow[]): Index {
  const all: Candidate[] = rows.flatMap((row) => [
    { row, normalized: normalizeTitle(row.title), matchedOn: 'title' as const },
    ...row.altTitles.map((alt) => ({
      row,
      normalized: normalizeTitle(alt),
      matchedOn: 'alt_title' as const,
    })),
  ]);
  const exact = new Map<string, Candidate[]>();
  for (const c of all) {
    const list = exact.get(c.normalized);
    if (list) list.push(c);
    else exact.set(c.normalized, [c]);
  }
  return { exact, all };
}

/**
 * Finds the best row for a title. An exact normalized match on a title or alt title wins
 * (confidence 1, preferring the title when a row matches on both); otherwise the most similar
 * candidate at or above `FUZZY_THRESHOLD`. Returns null when nothing qualifies or when two
 * different rows tie for best (ambiguous, e.g. the same title in two years).
 */
function findRow(title: string, index: Index): Best | null {
  const target = normalizeTitle(title);
  const exact = index.exact.get(target);
  if (exact) {
    const first = exact[0]!;
    if (exact.some((c) => c.row !== first.row)) return null;
    const onTitle = exact.some((c) => c.matchedOn === 'title');
    return { row: first.row, matchedOn: onTitle ? 'title' : 'alt_title', confidence: 1 };
  }

  let best: Best | null = null;
  let tied = false;
  for (const c of index.all) {
    // Cheap bound: the length gap alone caps the similarity.
    const longest = Math.max(target.length, c.normalized.length);
    if (1 - Math.abs(target.length - c.normalized.length) / longest < FUZZY_THRESHOLD) continue;
    const confidence = similarity(target, c.normalized);
    if (confidence < FUZZY_THRESHOLD) continue;
    if (!best || confidence > best.confidence) {
      best = { row: c.row, matchedOn: c.matchedOn, confidence };
      tied = false;
    } else if (confidence === best.confidence && c.row !== best.row) {
      tied = true;
    }
  }
  return tied ? null : best;
}

/**
 * Maps import-folder files to CSV rows by file name (REQ-LIB-13). Pure; never throws.
 *
 * - Folders in the path are ignored; only the file name is read (`/` and `\` separators).
 * - Extension, kind and key are case-insensitive; spacing around ` - ` is flexible.
 * - The extension must be an accepted format for the kind (`KIND_FORMATS`).
 * - When two files resolve to the same slot (row, key, kind, number), the higher-confidence one
 *   wins (ties: first in input order); the other goes to `unmatched`. Repeated identical paths
 *   are counted once.
 * - `matched` and `unmatched` keep input order.
 */
export function matchFiles(paths: string[], rows: ImportRow[]): MatchFilesResult {
  const index = buildIndex(rows);

  const seen = new Set<string>();
  const results: Array<{ path: string; match: FileMatch | null }> = [];
  const slots = new Map<string, FileMatch>();

  for (const path of paths) {
    if (seen.has(path)) continue;
    seen.add(path);

    const parsed = parseFileName(path);
    const best = parsed && findRow(parsed.title, index);
    if (!parsed || !best) {
      results.push({ path, match: null });
      continue;
    }

    const { row } = best;
    const match: FileMatch = {
      path,
      idempotencyKey: row.idempotencyKey,
      line: row.line,
      matchedOn: best.matchedOn,
      confidence: best.confidence,
      key: parsed.key,
      keyInRow:
        parsed.key === null || parsed.key === row.primaryKey || row.altKeys.includes(parsed.key),
      kind: parsed.kind,
      format: parsed.format,
      index: parsed.index,
      label: parsed.label,
    };
    results.push({ path, match });

    const slot = [row.idempotencyKey, match.key, match.kind, match.index].join('\u0000');
    const holder = slots.get(slot);
    if (!holder || match.confidence > holder.confidence) slots.set(slot, match);
  }

  const winners = new Set(slots.values());
  const matched: FileMatch[] = [];
  const unmatched: string[] = [];
  for (const { path, match } of results) {
    if (match && winners.has(match)) matched.push(match);
    else unmatched.push(path);
  }
  return { matched, unmatched };
}
