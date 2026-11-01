/**
 * Import runner CLI (IMP-03; REQ-LIB-13). Bulk-loads songs from the import CSV
 * (`contracts/api.md` §Import format) plus a folder of files named by convention.
 *
 *   pnpm run import --csv songs.csv --files ./folder --actor admin@example.org [--dry-run]
 *                   [--report report.md]
 *
 * (`pnpm import` on its own is a built-in pnpm command, so `run` is required.)
 *
 * - Parsing and file matching are IMP-01 (`parseImportCsv`) and IMP-02 (`matchFiles`).
 * - Runs as the service role: Postgres via DATABASE_URL (bypasses RLS) and Storage via
 *   SUPABASE_SERVICE_ROLE_KEY. Every write is attributed to `--actor`, who must be an
 *   enabled admin, and audited like the app's own actions (same `audit_log` entities).
 * - Idempotent: a song is found by `lower(title)` + `year`. A filled CSV cell sets the
 *   value; an empty cell never erases anything. Keys, links and files are only ever added
 *   (a resource already on the song with the same key, kind and label is left alone), so a
 *   second run with the same input changes nothing and reports every song as unchanged.
 * - Each CSV row is its own transaction; a failing row is reported and the rest continue.
 * - `--dry-run` runs exactly the same writes inside a transaction that is rolled back, and
 *   uploads nothing, so the report shows what a real run would do.
 *
 * The SQL lives here rather than in LIB-01..07's server actions because those read the
 * signed-in user from cookies (`requireUser`), which a CLI doesn't have.
 */

import { existsSync } from 'node:fs';
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';

import { createClient } from '@supabase/supabase-js';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from '@/db/schema';
import {
  branches,
  branchUsage,
  composers,
  resources,
  songComposers,
  songKeys,
  songs,
  songThemes,
  themes,
  users,
} from '@/db/schema';
import { matchFiles, type FileMatch } from '@/features/import/match';
import { parseImportCsv } from '@/features/import/parse';
import type { ImportComposer, ImportRow } from '@/features/import/types';
import { recordAudit } from '@/lib/audit';
import type { DB, Tx } from '@/lib/db';
import { canonicalMimeType, resourcePath, RESOURCES_BUCKET, sniffFormat } from '@/lib/storage';
import type { FileFormat } from '@/lib/storage';
import { parseYouTubeId } from '@/lib/youtube';
import type { Section } from '@/types/domain';
import { MAX_UPLOAD_BYTES, SECTIONS } from '@/types/domain';

// ----- CLI arguments ----------------------------------------------------------------------

export const USAGE =
  'Usage: pnpm run import --csv <songs.csv> --actor <admin email> [--files <folder>] ' +
  '[--dry-run] [--report <report.md>]';

export interface CliOptions {
  csv: string;
  files: string | null;
  actor: string;
  dryRun: boolean;
  report: string | null;
}

export class UsageError extends Error {
  override name = 'UsageError';
}

const VALUE_FLAGS = ['--csv', '--files', '--actor', '--report'] as const;
type ValueFlag = (typeof VALUE_FLAGS)[number];

/** Parses `argv` (without node and the script path). Accepts `--flag value` and `--flag=value`. */
export function parseArgs(argv: readonly string[]): CliOptions {
  const values: Partial<Record<ValueFlag, string>> = {};
  let dryRun = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--') continue;
    if (arg === '--dry-run') {
      dryRun = true;
      continue;
    }
    const eq = arg.indexOf('=');
    const name = eq > 0 ? arg.slice(0, eq) : arg;
    const flag = VALUE_FLAGS.find((f) => f === name);
    if (!flag) throw new UsageError(`Unknown argument "${arg}".`);
    const value = eq > 0 ? arg.slice(eq + 1) : argv[++i];
    if (value === undefined || value === '' || (eq < 0 && value.startsWith('--'))) {
      throw new UsageError(`${flag} needs a value.`);
    }
    if (values[flag] !== undefined) throw new UsageError(`${flag} was given twice.`);
    values[flag] = value;
  }

  if (!values['--csv']) throw new UsageError('--csv is required.');
  if (!values['--actor']) throw new UsageError('--actor is required (an admin email).');
  return {
    csv: values['--csv'],
    files: values['--files'] ?? null,
    actor: values['--actor'].trim(),
    dryRun,
    report: values['--report'] ?? null,
  };
}

// ----- Report -----------------------------------------------------------------------------

export type SongStatus = 'created' | 'updated' | 'skipped';

export interface SongOutcome {
  line: number;
  title: string;
  year: number | null;
  status: SongStatus;
  /** What changed, in plain words (empty for a created or skipped song). */
  changes: string[];
  /** Files uploaded (or, in a dry run, that would be). */
  uploads: string[];
  warnings: string[];
}

export interface ReportError {
  /** CSV line; null for problems not tied to a row. */
  line: number | null;
  message: string;
}

export interface ImportReport {
  dryRun: boolean;
  csvPath: string;
  filesDir: string | null;
  actorEmail: string;
  songs: SongOutcome[];
  errors: ReportError[];
  unmatchedFiles: string[];
}

const escapeMd = (s: string) => s.replace(/([\\`*_[\]|<>])/g, '\\$1');

function songLabel(s: Pick<SongOutcome, 'line' | 'title' | 'year'>): string {
  return `line ${s.line}: **${escapeMd(s.title)}**${s.year === null ? '' : ` (${s.year})`}`;
}

/** Renders the report as Markdown (the format leaders review before a real run). */
export function renderReport(report: ImportReport): string {
  const by = (status: SongStatus) => report.songs.filter((s) => s.status === status);
  const created = by('created');
  const updated = by('updated');
  const skipped = by('skipped');
  const uploads = report.songs.reduce((n, s) => n + s.uploads.length, 0);
  const warnings = report.songs.filter((s) => s.warnings.length > 0);
  const heading = (s: string) => (report.dryRun ? `Would be ${s.toLowerCase()}` : s);

  const out: string[] = [];
  out.push(`# Song import report${report.dryRun ? ' (dry run)' : ''}`, '');
  if (report.dryRun) {
    out.push('Dry run: nothing was saved and no files were uploaded.', '');
  }
  out.push(`- CSV: \`${report.csvPath}\``);
  out.push(`- Files folder: ${report.filesDir ? `\`${report.filesDir}\`` : 'none'}`);
  out.push(`- Run as: ${escapeMd(report.actorEmail)}`, '');

  out.push('## Summary', '');
  out.push(
    '| Created | Updated | Unchanged (skipped) | Errors | Files uploaded | Unmatched files |',
  );
  out.push('| --- | --- | --- | --- | --- | --- |');
  out.push(
    `| ${created.length} | ${updated.length} | ${skipped.length} | ${report.errors.length} | ` +
      `${uploads} | ${report.unmatchedFiles.length} |`,
    '',
  );

  const section = (title: string, lines: string[]) => {
    if (lines.length === 0) return;
    out.push(`## ${title}`, '', ...lines, '');
  };
  const fileList = (s: SongOutcome) =>
    s.uploads.length ? ` (files: ${s.uploads.map(escapeMd).join(', ')})` : '';

  section(
    heading('Created'),
    created.map((s) => `- ${songLabel(s)}${fileList(s)}`),
  );
  section(
    heading('Updated'),
    updated.map((s) => {
      const what = [...s.changes.map(escapeMd), ...s.uploads.map((u) => `${escapeMd(u)} uploaded`)];
      return `- ${songLabel(s)}: ${what.join('; ')}`;
    }),
  );
  section(
    'Unchanged (skipped)',
    skipped.map((s) => `- ${songLabel(s)}`),
  );
  section(
    'Errors',
    report.errors.map(
      (e) => `- ${e.line === null ? '' : `line ${e.line}: `}${escapeMd(e.message)}`,
    ),
  );
  section(
    'Warnings',
    warnings.flatMap((s) => s.warnings.map((w) => `- ${songLabel(s)}: ${escapeMd(w)}`)),
  );
  section(
    'Unmatched files',
    report.unmatchedFiles.map((f) => `- \`${f}\``),
  );
  return out.join('\n');
}

// ----- Pure helpers -----------------------------------------------------------------------

type SongRow = typeof songs.$inferSelect;
type SongKeyRow = typeof songKeys.$inferSelect;

/** Song columns the CSV can set. */
export interface SongFields {
  title: string;
  year: number | null;
  altTitles?: string[];
  sourceGroup?: string;
  tempoBpm?: number;
  timeSignature?: string;
  energyLevel?: NonNullable<SongRow['energyLevel']>;
  energyNotes?: string;
  addedByBranchId?: string;
}

/** The song columns a row sets: title and year always, the rest only when the cell is filled. */
export function songFieldsFromRow(row: ImportRow, addedByBranchId: string | null): SongFields {
  const fields: SongFields = { title: row.title, year: row.year };
  if (row.altTitles.length) fields.altTitles = row.altTitles;
  if (row.sourceGroup !== null) fields.sourceGroup = row.sourceGroup;
  if (row.tempoBpm !== null) fields.tempoBpm = row.tempoBpm;
  if (row.timeSignature !== null) fields.timeSignature = row.timeSignature;
  if (row.energyLevel !== null) fields.energyLevel = row.energyLevel;
  if (row.energyNotes !== null) fields.energyNotes = row.energyNotes;
  if (addedByBranchId !== null) fields.addedByBranchId = addedByBranchId;
  return fields;
}

const FIELD_LABELS: Record<keyof SongFields, string> = {
  title: 'title',
  year: 'year',
  altTitles: 'alternate titles',
  sourceGroup: 'source group',
  tempoBpm: 'tempo',
  timeSignature: 'time signature',
  energyLevel: 'energy',
  energyNotes: 'energy notes',
  addedByBranchId: 'added by',
};

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Fields of `next` that differ from `current`, as `[column, label]` pairs. */
export function changedSongFields(
  current: Pick<SongRow, keyof SongFields>,
  next: SongFields,
): Array<[keyof SongFields, string]> {
  return (Object.keys(next) as Array<keyof SongFields>)
    .filter((k) => !sameJson(current[k] ?? null, next[k] ?? null))
    .map((k) => [k, FIELD_LABELS[k]]);
}

type ChordColumns = Pick<SongKeyRow, 'introChord' | 'verseChord' | 'chorusChord' | 'bridgeChord'>;

/** The first-chord columns a row fills (empty cells keep the stored chord). */
export function chordColumnsFromRow(row: ImportRow): Partial<ChordColumns> {
  const c = row.firstChords;
  const out: Partial<ChordColumns> = {};
  if (c.intro !== null) out.introChord = c.intro;
  if (c.verse !== null) out.verseChord = c.verse;
  if (c.chorus !== null) out.chorusChord = c.chorus;
  if (c.bridge !== null) out.bridgeChord = c.bridge;
  return out;
}

/** Label for the n-th (1-based) link in a row's `youtube_links`. */
export function linkLabel(url: string, n: number): string {
  const base = parseYouTubeId(url) ? 'YouTube' : 'Video';
  return n === 1 ? base : `${base} ${n}`;
}

/** Why a file can't be uploaded, or null when it can. */
export function fileProblem(size: number, head: Uint8Array, format: FileFormat): string | null {
  if (size === 0) return 'the file is empty';
  if (size > MAX_UPLOAD_BYTES) {
    return `the file is larger than ${MAX_UPLOAD_BYTES / 1024 / 1024} MB`;
  }
  if (!sniffFormat(head, format)) return `the file doesn't look like a .${format} file`;
  return null;
}

/** How a file is described in the report: `Chord Chart (D)`, `Projection`. */
export function uploadLabel(match: Pick<FileMatch, 'label' | 'key'>): string {
  return match.key ? `${match.label} (${match.key})` : match.label;
}

// ----- Files on disk ----------------------------------------------------------------------

/** Every non-hidden file under `dir`, as paths relative to it (`/`-separated), sorted. */
export async function listFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries
    .filter((e) => e.isFile())
    .map((e) => relative(dir, join(e.parentPath, e.name)).split(sep).join('/'))
    .filter((p) => !p.split('/').some((part) => part.startsWith('.')))
    .sort();
}

/** Reads files from the import folder. Injected so tests can avoid the disk. */
export interface FileSource {
  size(path: string): Promise<number>;
  read(path: string): Promise<Uint8Array>;
}

export function diskFiles(dir: string): FileSource {
  return {
    size: async (path) => (await stat(join(dir, path))).size,
    read: async (path) => new Uint8Array(await readFile(join(dir, path))),
  };
}

/** Writes objects to the private resources bucket. Injected so tests can use a fake. */
export interface StorageTarget {
  upload(path: string, body: Uint8Array, contentType: string): Promise<void>;
  remove(path: string): Promise<void>;
}

/** Storage through the service-role client. */
export function supabaseStorage(supabaseUrl: string, serviceRoleKey: string): StorageTarget {
  const bucket = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }).storage.from(RESOURCES_BUCKET);
  return {
    async upload(path, body, contentType) {
      const { error } = await bucket.upload(path, body, { contentType, upsert: false });
      if (error) throw error;
    },
    async remove(path) {
      const { error } = await bucket.remove([path]);
      if (error) throw error;
    },
  };
}

// ----- Database work ----------------------------------------------------------------------

export function createDb(databaseUrl: string): DB {
  return drizzle(postgres(databaseUrl, { max: 1, onnotice: () => {} }), { schema }) as DB;
}

export class ActorError extends Error {
  override name = 'ActorError';
}

/** The `--actor`: an enabled, approved admin, found by email (case-insensitive). */
export async function findActor(db: DB, email: string): Promise<{ id: string; email: string }> {
  const [user] = await db
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = lower(${email})`);
  if (!user) throw new ActorError(`No user with email ${email}.`);
  if (user.role !== 'admin') throw new ActorError(`${user.email} is not an admin.`);
  if (user.disabledAt || user.accessStatus !== 'approved') {
    throw new ActorError(`${user.email} is disabled or not approved.`);
  }
  return { id: user.id, email: user.email };
}

interface RowContext {
  actorId: string;
  branchIdByCode: ReadonlyMap<string, string>;
  branchCodeById: ReadonlyMap<string, string>;
}

/** A file that still needs uploading after the row's transaction. */
interface PendingUpload {
  match: FileMatch;
  songId: string;
  songKeyId: string | null;
}

interface RowResult {
  songId: string;
  created: boolean;
  changes: string[];
  warnings: string[];
  pending: PendingUpload[];
}

/** What the audit log records about a song (mirrors LIB-01's song snapshot). */
function songSnapshot(song: SongRow, composerIds: string[]): Record<string, unknown> {
  return {
    title: song.title,
    altTitles: song.altTitles,
    composerIds,
    sourceGroup: song.sourceGroup,
    year: song.year,
    tempoBpm: song.tempoBpm,
    timeSignature: song.timeSignature,
    energyLevel: song.energyLevel,
    energyNotes: song.energyNotes,
    addedByBranchId: song.addedByBranchId,
  };
}

async function songComposerIds(tx: Tx, songId: string): Promise<string[]> {
  const rows = await tx
    .select({ id: songComposers.composerId })
    .from(songComposers)
    .where(eq(songComposers.songId, songId))
    .orderBy(asc(songComposers.sortOrder));
  return rows.map((r) => r.id);
}

/** Finds or creates each composer by `lower(name)`. A `[past]`/`[current]` marker sets POP membership. */
async function resolveComposers(
  tx: Tx,
  list: ImportComposer[],
  ctx: RowContext,
  warnings: string[],
): Promise<string[]> {
  const ids: string[] = [];
  for (const c of list) {
    const [found] = await tx
      .select()
      .from(composers)
      .where(sql`lower(${composers.name}) = lower(${c.name})`);
    if (!found) {
      const [inserted] = await tx
        .insert(composers)
        .values({ name: c.name, popMember: c.popMember })
        .returning();
      await recordAudit(tx, {
        actorId: ctx.actorId,
        entity: 'composer',
        entityId: inserted!.id,
        action: 'create',
        after: { name: inserted!.name, popMember: inserted!.popMember },
      });
      warnings.push(`new composer "${c.name}"`);
      ids.push(inserted!.id);
      continue;
    }
    if (c.popMember !== 'none' && c.popMember !== found.popMember) {
      await tx.update(composers).set({ popMember: c.popMember }).where(eq(composers.id, found.id));
      await recordAudit(tx, {
        actorId: ctx.actorId,
        entity: 'composer',
        entityId: found.id,
        action: 'update',
        before: { popMember: found.popMember },
        after: { popMember: c.popMember },
      });
      warnings.push(`composer "${found.name}" marked as ${c.popMember} POP member`);
    }
    ids.push(found.id);
  }
  return ids;
}

function keyAuditFields(row: Pick<SongKeyRow, 'key' | 'isPrimary'> & ChordColumns) {
  return {
    key: row.key,
    isPrimary: row.isPrimary,
    introChord: row.introChord,
    verseChord: row.verseChord,
    chorusChord: row.chorusChord,
    bridgeChord: row.bridgeChord,
  };
}

/**
 * Adds the row's keys (and any key a file needs) without deleting others. The CSV's primary
 * key becomes the primary; its filled first chords are written. Returns key → id.
 */
async function syncKeys(
  tx: Tx,
  songId: string,
  row: ImportRow,
  fileKeys: string[],
  ctx: RowContext,
  changes: string[],
  warnings: string[],
): Promise<Map<string, SongKeyRow>> {
  const existing = await tx.select().from(songKeys).where(eq(songKeys.songId, songId));
  const byKey = new Map(existing.map((r) => [r.key, r]));

  const insertKey = async (key: string, isPrimary: boolean, chords: Partial<ChordColumns>) => {
    const [inserted] = await tx
      .insert(songKeys)
      .values({ songId, key, isPrimary, ...chords })
      .returning();
    await recordAudit(tx, {
      actorId: ctx.actorId,
      entity: 'song_key',
      entityId: inserted!.id,
      action: 'create',
      after: keyAuditFields(inserted!),
    });
    byKey.set(key, inserted!);
  };
  const updateKey = async (current: SongKeyRow, set: Partial<SongKeyRow>) => {
    const before = keyAuditFields(current);
    const after = keyAuditFields({ ...current, ...set });
    if (sameJson(before, after)) return false;
    const [updated] = await tx
      .update(songKeys)
      .set(set)
      .where(eq(songKeys.id, current.id))
      .returning();
    await recordAudit(tx, {
      actorId: ctx.actorId,
      entity: 'song_key',
      entityId: current.id,
      action: 'update',
      before,
      after,
    });
    byKey.set(current.key, updated!);
    return true;
  };

  const primary = row.primaryKey;
  if (primary) {
    const chords = chordColumnsFromRow(row);
    // Clear the old primary first: song_keys_one_primary is checked per statement.
    const oldPrimary = existing.find((r) => r.isPrimary && r.key !== primary);
    if (oldPrimary) {
      await updateKey(oldPrimary, { isPrimary: false });
      changes.push(`primary key ${oldPrimary.key} → ${primary}`);
    }
    const current = byKey.get(primary);
    if (!current) {
      await insertKey(primary, true, chords);
      changes.push(`key ${primary} added`);
    } else if (await updateKey(current, { isPrimary: true, ...chords })) {
      const chordsBefore = keyAuditFields({ ...current, isPrimary: true });
      const chordsAfter = keyAuditFields({ ...current, isPrimary: true, ...chords });
      if (!sameJson(chordsBefore, chordsAfter)) changes.push(`key ${primary} first chords`);
      if (!current.isPrimary && !oldPrimary) changes.push(`primary key set to ${primary}`);
    }
  }

  for (const key of row.altKeys) {
    if (byKey.has(key)) continue;
    await insertKey(key, false, {});
    changes.push(`key ${key} added`);
  }

  for (const key of fileKeys) {
    if (byKey.has(key)) continue;
    await insertKey(key, false, {});
    changes.push(`key ${key} added`);
    warnings.push(`key ${key} is not in the CSV but has files, so it was added`);
  }
  return byKey;
}

async function sectionThemes(tx: Tx, songId: string): Promise<Partial<Record<Section, string[]>>> {
  const rows = await tx
    .select({ section: songThemes.section, name: themes.name })
    .from(songThemes)
    .innerJoin(themes, eq(themes.id, songThemes.themeId))
    .where(eq(songThemes.songId, songId))
    .orderBy(asc(themes.name));
  const out: Partial<Record<Section, string[]>> = {};
  for (const r of rows) (out[r.section] ??= []).push(r.name);
  return out;
}

/** Find-or-create a theme by its normalized name. */
async function themeId(tx: Tx, name: string, ctx: RowContext, warnings: string[]) {
  const [created] = await tx
    .insert(themes)
    .values({ name, createdBy: ctx.actorId })
    .onConflictDoNothing({ target: themes.name })
    .returning();
  if (created) {
    await recordAudit(tx, {
      actorId: ctx.actorId,
      entity: 'theme',
      entityId: created.id,
      action: 'create',
      after: { name: created.name },
    });
    warnings.push(`new theme "${name}"`);
    return created.id;
  }
  const [found] = await tx.select({ id: themes.id }).from(themes).where(eq(themes.name, name));
  return found!.id;
}

/** Replaces the themes of each section the row fills; other sections are kept. */
async function syncThemes(
  tx: Tx,
  songId: string,
  row: ImportRow,
  ctx: RowContext,
  changes: string[],
  warnings: string[],
): Promise<void> {
  const before = await sectionThemes(tx, songId);
  let changed = false;
  for (const section of SECTIONS) {
    const wanted = [...new Set(row.themes[section])].sort();
    if (wanted.length === 0) continue;
    const current = [...(before[section] ?? [])].sort();
    if (sameJson(current, wanted)) continue;
    const ids: string[] = [];
    for (const name of wanted) ids.push(await themeId(tx, name, ctx, warnings));
    await tx
      .delete(songThemes)
      .where(and(eq(songThemes.songId, songId), eq(songThemes.section, section)));
    await tx.insert(songThemes).values(ids.map((id) => ({ songId, themeId: id, section })));
    changes.push(`themes (${section.replace('_', ' ')})`);
    changed = true;
  }
  if (!changed) return;
  await recordAudit(tx, {
    actorId: ctx.actorId,
    entity: 'song_themes',
    entityId: songId,
    action: 'update',
    before,
    after: await sectionThemes(tx, songId),
  });
}

async function usageSnapshot(tx: Tx, songId: string, ctx: RowContext) {
  const rows = await tx
    .select({
      branchId: branchUsage.branchId,
      level: branchUsage.level,
      source: branchUsage.source,
    })
    .from(branchUsage)
    .where(eq(branchUsage.songId, songId));
  return Object.fromEntries(
    rows.map((r) => [
      ctx.branchCodeById.get(r.branchId) ?? r.branchId,
      { level: r.level, source: r.source },
    ]),
  );
}

/** Sets manual usage for each `usage_<CODE>` cell that has a value; other branches are kept. */
async function syncUsage(
  tx: Tx,
  songId: string,
  row: ImportRow,
  ctx: RowContext,
  changes: string[],
): Promise<void> {
  if (row.usage.length === 0) return;
  const before = await usageSnapshot(tx, songId, ctx);
  const changedCodes: string[] = [];
  for (const u of row.usage) {
    const code = u.branchCode.toUpperCase();
    const branchId = ctx.branchIdByCode.get(code);
    if (!branchId) continue; // parse validated codes against the same list
    const current = before[code];
    if (current?.level === u.level && current.source === 'manual') continue;
    await tx
      .insert(branchUsage)
      .values({ songId, branchId, level: u.level, source: 'manual' })
      .onConflictDoUpdate({
        target: [branchUsage.songId, branchUsage.branchId],
        set: { level: u.level, source: 'manual', updatedAt: sql`now()` },
      });
    changedCodes.push(code);
  }
  if (changedCodes.length === 0) return;
  changes.push(`usage (${changedCodes.join(', ')})`);
  await recordAudit(tx, {
    actorId: ctx.actorId,
    entity: 'branch_usage',
    entityId: songId,
    action: 'update',
    before,
    after: await usageSnapshot(tx, songId, ctx),
  });
}

/** Adds each link not already on the song, on its primary key. */
async function syncLinks(
  tx: Tx,
  songId: string,
  row: ImportRow,
  primaryKeyId: string | null,
  ctx: RowContext,
  changes: string[],
  warnings: string[],
): Promise<void> {
  if (row.youtubeLinks.length === 0) return;
  const existing = await tx
    .select({ url: resources.url })
    .from(resources)
    .where(and(eq(resources.songId, songId), eq(resources.format, 'url')));
  const have = new Set(existing.map((r) => r.url));
  for (const [i, url] of row.youtubeLinks.entries()) {
    if (have.has(url)) continue;
    if (!primaryKeyId) {
      warnings.push(`link ${url} skipped: the song has no primary key to attach it to`);
      continue;
    }
    const [inserted] = await tx
      .insert(resources)
      .values({
        songId,
        songKeyId: primaryKeyId,
        kind: 'video_link',
        format: 'url',
        label: linkLabel(url, i + 1),
        url,
        uploadedBy: ctx.actorId,
      })
      .returning();
    await recordAudit(tx, {
      actorId: ctx.actorId,
      entity: 'resource',
      entityId: inserted!.id,
      action: 'create',
      after: inserted!,
    });
    changes.push(`${inserted!.label} link added`);
  }
}

/** Files for this song that aren't on it yet (same key, kind and label, case-insensitive). */
async function pendingUploads(
  tx: Tx,
  songId: string,
  matches: FileMatch[],
  keys: ReadonlyMap<string, SongKeyRow>,
): Promise<PendingUpload[]> {
  if (matches.length === 0) return [];
  const existing = await tx
    .select({ songKeyId: resources.songKeyId, kind: resources.kind, label: resources.label })
    .from(resources)
    .where(eq(resources.songId, songId));
  const slot = (keyId: string | null, kind: string, label: string) =>
    `${keyId ?? ''}|${kind}|${label.toLowerCase()}`;
  const have = new Set(existing.map((r) => slot(r.songKeyId, r.kind, r.label)));
  const out: PendingUpload[] = [];
  for (const match of matches) {
    const songKeyId = match.key ? (keys.get(match.key)?.id ?? null) : null;
    if (match.key && !songKeyId) continue; // syncKeys added every file key
    if (have.has(slot(songKeyId, match.kind, match.label))) continue;
    out.push({ match, songId, songKeyId });
  }
  return out;
}

/** Upserts one CSV row inside `tx`: song, composers, keys, themes, usage and links. */
async function importRow(
  tx: Tx,
  row: ImportRow,
  matches: FileMatch[],
  ctx: RowContext,
): Promise<RowResult> {
  const changes: string[] = [];
  const warnings: string[] = [];
  for (const m of matches) {
    if (m.confidence < 1) {
      warnings.push(`"${m.path}" matched by a similar title (${Math.round(m.confidence * 100)}%)`);
    }
  }

  const found = await tx
    .select()
    .from(songs)
    .where(
      and(
        isNull(songs.deletedAt),
        sql`lower(${songs.title}) = lower(${row.title})`,
        row.year === null ? isNull(songs.year) : eq(songs.year, row.year),
      ),
    )
    .orderBy(asc(songs.createdAt), asc(songs.id))
    .limit(2)
    .for('update');
  if (found.length > 1) {
    warnings.push('the library already has more than one song with this title and year');
  }

  const addedBy = row.addedByBranchCode
    ? (ctx.branchIdByCode.get(row.addedByBranchCode) ?? null)
    : null;
  const fields = songFieldsFromRow(row, addedBy);
  const composerIds = await resolveComposers(tx, row.composers, ctx, warnings);

  let song = found[0];
  const created = !song;
  if (!song) {
    const [inserted] = await tx
      .insert(songs)
      .values({ ...fields, createdBy: ctx.actorId, updatedBy: ctx.actorId })
      .returning();
    song = inserted!;
    await tx
      .insert(songComposers)
      .values(
        composerIds.map((composerId, sortOrder) => ({ songId: song!.id, composerId, sortOrder })),
      );
    await recordAudit(tx, {
      actorId: ctx.actorId,
      entity: 'song',
      entityId: song.id,
      action: 'create',
      after: songSnapshot(song, composerIds),
    });
  } else {
    const before = song;
    const beforeComposers = await songComposerIds(tx, song.id);
    const changed = changedSongFields(before, fields);
    const composersChanged = !sameJson(beforeComposers, composerIds);
    if (changed.length || composersChanged) {
      const set = Object.fromEntries(changed.map(([k]) => [k, fields[k] ?? null]));
      const [updated] = await tx
        .update(songs)
        .set({ ...set, updatedBy: ctx.actorId })
        .where(eq(songs.id, song.id))
        .returning();
      if (composersChanged) {
        await tx.delete(songComposers).where(eq(songComposers.songId, song.id));
        await tx.insert(songComposers).values(
          composerIds.map((composerId, sortOrder) => ({
            songId: before.id,
            composerId,
            sortOrder,
          })),
        );
      }
      song = updated!;
      await recordAudit(tx, {
        actorId: ctx.actorId,
        entity: 'song',
        entityId: song.id,
        action: 'update',
        before: songSnapshot(before, beforeComposers),
        after: songSnapshot(song, composerIds),
      });
      changes.push(...changed.map(([, label]) => label));
      if (composersChanged) changes.push('composers');
    }
  }

  const songId = song.id;
  const fileKeys = [...new Set(matches.flatMap((m) => (m.key ? [m.key] : [])))];
  const childChanges: string[] = [];
  const keys = await syncKeys(tx, songId, row, fileKeys, ctx, childChanges, warnings);
  await syncThemes(tx, songId, row, ctx, childChanges, warnings);
  await syncUsage(tx, songId, row, ctx, childChanges);
  const primaryKeyId = [...keys.values()].find((k) => k.isPrimary)?.id ?? null;
  await syncLinks(tx, songId, row, primaryKeyId, ctx, childChanges, warnings);

  if (!created && childChanges.length && !changes.length) {
    // Child edits bump the song's updated_at like the app's actions do.
    await tx
      .update(songs)
      .set({ updatedAt: new Date(), updatedBy: ctx.actorId })
      .where(eq(songs.id, songId));
  }
  changes.push(...childChanges);

  const pending = await pendingUploads(tx, songId, matches, keys);
  return { songId, created, changes: created ? [] : changes, warnings, pending };
}

/** Thrown to roll a dry run's transaction back while keeping its result. */
class DryRunRollback extends Error {
  constructor(readonly result: RowResult) {
    super('dry run');
  }
}

/** Checks a file and, unless `dryRun`, uploads it and records the resource. */
async function uploadFile(
  db: DB,
  storage: StorageTarget | null,
  files: FileSource,
  upload: PendingUpload,
  ctx: RowContext,
  dryRun: boolean,
): Promise<void> {
  const { match, songId, songKeyId } = upload;
  const format = match.format as FileFormat;
  const size = await files.size(match.path);
  const body =
    size > 0 && size <= MAX_UPLOAD_BYTES ? await files.read(match.path) : new Uint8Array();
  const problem = fileProblem(size, body.subarray(0, 64), format);
  if (problem) throw new Error(problem);
  if (dryRun) return;
  if (!storage) throw new Error('storage is not configured');

  const resourceId = randomUUID();
  const ext = match.path.slice(match.path.lastIndexOf('.') + 1).toLowerCase();
  const path = resourcePath(songId, songKeyId, resourceId, ext);
  const mimeType = canonicalMimeType(format);
  await storage.upload(path, body, mimeType);
  try {
    await db.transaction(async (tx) => {
      const [inserted] = await tx
        .insert(resources)
        .values({
          id: resourceId,
          songId,
          songKeyId,
          kind: match.kind,
          format,
          label: match.label,
          storagePath: path,
          sizeBytes: size,
          mimeType,
          uploadedBy: ctx.actorId,
        })
        .returning();
      await recordAudit(tx, {
        actorId: ctx.actorId,
        entity: 'resource',
        entityId: resourceId,
        action: 'create',
        after: inserted!,
      });
      await tx
        .update(songs)
        .set({ updatedAt: new Date(), updatedBy: ctx.actorId })
        .where(eq(songs.id, songId));
    });
  } catch (err) {
    await storage.remove(path).catch(() => {});
    throw err;
  }
}

export interface RunImportOptions {
  csvPath: string;
  csvText: string;
  filesDir: string | null;
  /** Paths relative to `filesDir`, as `listFiles` returns them. */
  filePaths: string[];
  files: FileSource;
  /** Null only for a dry run. */
  storage: StorageTarget | null;
  actorEmail: string;
  dryRun: boolean;
  log?: (message: string) => void;
}

/** A one-line message; Drizzle's "Failed query" errors carry the useful part in `cause`. */
export function errorMessage(err: unknown): string {
  if (!(err instanceof Error)) return typeof err === 'string' ? err : JSON.stringify(err);
  const cause = err.cause instanceof Error ? err.cause.message : null;
  if (cause && err.message.startsWith('Failed query')) return cause;
  return cause ? `${err.message} (${cause})` : err.message;
}

/** Runs the import (or dry run) and returns its report. Throws only for an invalid actor. */
export async function runImport(db: DB, opts: RunImportOptions): Promise<ImportReport> {
  const log = opts.log ?? (() => {});
  const actor = await findActor(db, opts.actorEmail);
  const branchRows = await db.select({ id: branches.id, code: branches.code }).from(branches);
  const ctx: RowContext = {
    actorId: actor.id,
    branchIdByCode: new Map(branchRows.map((b) => [b.code, b.id])),
    branchCodeById: new Map(branchRows.map((b) => [b.id, b.code])),
  };

  const parsed = parseImportCsv(opts.csvText, { branchCodes: branchRows.map((b) => b.code) });
  const { matched, unmatched } = matchFiles(opts.filePaths, parsed.rows);
  const report: ImportReport = {
    dryRun: opts.dryRun,
    csvPath: opts.csvPath,
    filesDir: opts.filesDir,
    actorEmail: actor.email,
    songs: [],
    errors: parsed.errors.map((e) => ({ line: e.line, message: e.message })),
    unmatchedFiles: unmatched,
  };

  for (const row of parsed.rows) {
    const matches = matched.filter((m) => m.idempotencyKey === row.idempotencyKey);
    let result: RowResult;
    try {
      result = await db.transaction(async (tx) => {
        const r = await importRow(tx, row, matches, ctx);
        if (opts.dryRun) throw new DryRunRollback(r);
        return r;
      });
    } catch (err) {
      if (err instanceof DryRunRollback) {
        result = err.result;
      } else {
        report.errors.push({ line: row.line, message: `"${row.title}": ${errorMessage(err)}` });
        continue;
      }
    }

    const uploads: string[] = [];
    for (const upload of result.pending) {
      try {
        await uploadFile(db, opts.storage, opts.files, upload, ctx, opts.dryRun);
        uploads.push(uploadLabel(upload.match));
      } catch (err) {
        report.errors.push({
          line: row.line,
          message: `"${upload.match.path}" not uploaded: ${errorMessage(err)}`,
        });
      }
    }

    const status: SongStatus = result.created
      ? 'created'
      : result.changes.length || uploads.length
        ? 'updated'
        : 'skipped';
    report.songs.push({
      line: row.line,
      title: row.title,
      year: row.year,
      status,
      changes: result.changes,
      uploads,
      warnings: result.warnings,
    });
    log(`line ${row.line}: ${row.title} — ${status}`);
  }
  return report;
}

// ----- Entry point ------------------------------------------------------------------------

/** The CLI: reads env, runs, writes the report. Returns the process exit code. */
export async function main(argv: readonly string[]): Promise<number> {
  let options: CliOptions;
  try {
    options = parseArgs(argv);
  } catch (err) {
    console.error(`${errorMessage(err)}\n${USAGE}`);
    return 2;
  }

  if (existsSync('.env.local')) process.loadEnvFile('.env.local');
  const databaseUrl = process.env.DATABASE_URL;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const missing = [
    !databaseUrl && 'DATABASE_URL',
    !options.dryRun && !supabaseUrl && 'NEXT_PUBLIC_SUPABASE_URL',
    !options.dryRun && !serviceRoleKey && 'SUPABASE_SERVICE_ROLE_KEY',
  ].filter(Boolean);
  if (missing.length) {
    console.error(`Set ${missing.join(', ')} (environment or .env.local).`);
    return 2;
  }

  let csvText: string;
  let filePaths: string[] = [];
  try {
    csvText = await readFile(options.csv, 'utf8');
    if (options.files) filePaths = await listFiles(options.files);
  } catch (err) {
    console.error(`Could not read the input: ${errorMessage(err)}`);
    return 2;
  }

  const db = createDb(databaseUrl!);
  try {
    const target = new URL(databaseUrl!);
    console.error(
      `${options.dryRun ? 'Dry run against' : 'Importing into'} ${target.hostname}` +
        `${target.port ? `:${target.port}` : ''} as ${options.actor}…`,
    );
    const report = await runImport(db, {
      csvPath: options.csv,
      csvText,
      filesDir: options.files,
      filePaths,
      files: diskFiles(options.files ?? '.'),
      storage: options.dryRun ? null : supabaseStorage(supabaseUrl!, serviceRoleKey!),
      actorEmail: options.actor,
      dryRun: options.dryRun,
      log: (m) => console.error(`  ${m}`),
    });
    const markdown = renderReport(report);
    if (options.report) {
      await writeFile(options.report, `${markdown}\n`);
      console.error(`Report written to ${options.report}`);
    } else {
      console.log(markdown);
    }
    return report.errors.length ? 1 : 0;
  } catch (err) {
    console.error(errorMessage(err));
    return 1;
  } finally {
    await db.$client.end();
  }
}

const invokedDirectly =
  typeof process !== 'undefined' &&
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (invokedDirectly) {
  main(process.argv.slice(2)).then((code) => process.exit(code));
}
