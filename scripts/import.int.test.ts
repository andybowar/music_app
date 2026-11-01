// @vitest-environment node
// Integration: needs a migrated local Supabase (`pnpm db:start`). CI sets the env vars;
// locally they come from .env.local, which Vitest doesn't load on its own. Storage is a
// fake here; the database writes are real.
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';

import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';

import type { FileSource, RunImportOptions, StorageTarget } from './import';

vi.mock('server-only', () => ({}));

if (!process.env.DATABASE_URL && existsSync('.env.local')) process.loadEnvFile('.env.local');

const { and, eq, inArray, sql } = await import('drizzle-orm');
const schema = await import('@/db/schema');
const { auditLog, branches, branchUsage, composers, resources, songKeys, songs, songThemes } =
  schema;
const { themes, users } = schema;
const { createDb, runImport } = await import('./import');

const db = createDb(process.env.DATABASE_URL!);
const tag = randomUUID().slice(0, 8);
const actorId = randomUUID();
const actorEmail = `imp03-${tag}@example.test`;
const code = `Z${String.fromCharCode(65 + Math.floor(Math.random() * 26))}${String.fromCharCode(
  65 + Math.floor(Math.random() * 26),
)}`;
let branchId: string;

const alpha = `IMP03 Alpha ${tag}`;
const beta = `IMP03 Beta ${tag}`;
const composerA = `IMP03 Composer ${tag}`;
const composerB = `IMP03 Other ${tag}`;
const themeA = `imp03 hope ${tag}`;
const themeB = `imp03 joy ${tag}`;

function csv(alphaTempo = '120'): string {
  return [
    `title,composers,year,primary_key,alt_keys,tempo_bpm,intro_chord,themes_chorus,usage_${code},added_by,youtube_links`,
    `${alpha},${composerA} [current],2004,D,E,${alphaTempo},D,${themeA};${themeB},high,${code},https://youtu.be/abcdefghijk`,
    `${beta},${composerB},,G,,,,,,,`,
  ].join('\n');
}

const PDF = new TextEncoder().encode('%PDF-1.7\n% IMP-03 test\n%%EOF\n');
const fileBodies = new Map<string, Uint8Array>([
  [`${alpha} - D - Chord Chart.pdf`, PDF],
  [`${alpha} - E - Lead Sheet.pdf`, PDF],
  [`${beta} - G - Chord Chart.pdf`, PDF],
  [`${beta} - A - Full Score.pdf`, PDF], // key not in the CSV: added with a warning
  [`Nobody Knows This ${tag} - D - Chord Chart.pdf`, PDF],
  [`${beta} - G - Lead Sheet.pdf`, new TextEncoder().encode('not a pdf')],
]);
const files: FileSource = {
  size: async (p) => fileBodies.get(p)!.length,
  read: async (p) => fileBodies.get(p)!,
};

const stored = new Map<string, Uint8Array>();
const storage: StorageTarget = {
  upload: async (path, body) => {
    if (stored.has(path)) throw new Error('exists');
    stored.set(path, body);
  },
  remove: async (path) => {
    stored.delete(path);
  },
};

function options(overrides: Partial<RunImportOptions> = {}): RunImportOptions {
  return {
    csvPath: 'songs.csv',
    csvText: csv(),
    filesDir: 'files',
    filePaths: [...fileBodies.keys()],
    files,
    storage,
    actorEmail: actorEmail.toUpperCase(),
    dryRun: false,
    ...overrides,
  };
}

async function importedSongs() {
  return db
    .select()
    .from(songs)
    .where(inArray(songs.title, [alpha, beta]));
}

async function countsFor(songIds: string[]) {
  const count = async (table: typeof songKeys | typeof resources | typeof songThemes) =>
    (await db.select().from(table).where(inArray(table.songId, songIds))).length;
  return {
    keys: await count(songKeys),
    resources: await count(resources),
    themes: await count(songThemes),
    composers: (
      await db
        .select()
        .from(composers)
        .where(inArray(composers.name, [composerA, composerB]))
    ).length,
  };
}

beforeAll(async () => {
  await db.execute(sql`insert into auth.users (id, email) values (${actorId}, ${actorEmail})`);
  await db.insert(users).values({
    id: actorId,
    email: actorEmail,
    name: 'IMP-03 test',
    authProvider: 'password',
    role: 'admin',
    accessStatus: 'approved',
  });
  const [branch] = await db
    .insert(branches)
    .values({ name: `IMP03 branch ${tag}`, code })
    .returning();
  branchId = branch!.id;
});

afterAll(async () => {
  const ids = (await importedSongs()).map((s) => s.id);
  await db.delete(auditLog).where(eq(auditLog.actorId, actorId));
  if (ids.length) await db.delete(songs).where(inArray(songs.id, ids)); // cascades children
  await db.delete(composers).where(inArray(composers.name, [composerA, composerB]));
  await db.delete(themes).where(inArray(themes.name, [themeA, themeB]));
  await db.delete(branches).where(eq(branches.id, branchId));
  await db.execute(sql`delete from auth.users where id = ${actorId}`);
  await db.$client.end();
});

describe('runImport', () => {
  test('refuses an unknown actor', async () => {
    await expect(
      runImport(db, options({ actorEmail: `nobody-${tag}@example.test` })),
    ).rejects.toThrow(/No user with email/);
  });

  test('dry run reports what would happen and saves nothing', async () => {
    const report = await runImport(db, options({ dryRun: true, storage: null }));
    expect(report.songs.map((s) => [s.title, s.status])).toEqual([
      [alpha, 'created'],
      [beta, 'created'],
    ]);
    expect(report.songs[0]!.uploads.sort()).toEqual(['Chord Chart (D)', 'Lead Sheet (E)']);
    expect(report.songs[1]!.uploads.sort()).toEqual(['Chord Chart (G)', 'Full Score (A)']);
    expect(report.unmatchedFiles).toEqual([`Nobody Knows This ${tag} - D - Chord Chart.pdf`]);
    expect(report.errors).toEqual([
      expect.objectContaining({ line: 3, message: expect.stringContaining('Lead Sheet.pdf') }),
    ]);
    expect(await importedSongs()).toEqual([]);
    expect(stored.size).toBe(0);
  });

  test('first run creates songs with their keys, themes, usage, links and files', async () => {
    const report = await runImport(db, options());
    expect(report.songs.map((s) => s.status)).toEqual(['created', 'created']);
    expect(report.errors).toHaveLength(1); // the fake PDF
    expect(report.songs[1]!.warnings).toContain(
      'key A is not in the CSV but has files, so it was added',
    );

    const rows = await importedSongs();
    expect(rows).toHaveLength(2);
    const a = rows.find((s) => s.title === alpha)!;
    expect(a).toMatchObject({
      year: 2004,
      tempoBpm: 120,
      addedByBranchId: branchId,
      createdBy: actorId,
    });

    const keys = await db.select().from(songKeys).where(eq(songKeys.songId, a.id));
    expect(keys.map((k) => [k.key, k.isPrimary, k.introChord]).sort()).toEqual([
      ['D', true, 'D'],
      ['E', false, null],
    ]);
    const [usage] = await db.select().from(branchUsage).where(eq(branchUsage.songId, a.id));
    expect(usage).toMatchObject({ branchId, level: 'high', source: 'manual' });
    const [composer] = await db.select().from(composers).where(eq(composers.name, composerA));
    expect(composer!.popMember).toBe('current');

    const res = await db.select().from(resources).where(eq(resources.songId, a.id));
    expect(res.map((r) => [r.kind, r.label]).sort()).toEqual([
      ['chord_chart', 'Chord Chart'],
      ['lead_sheet', 'Lead Sheet'],
      ['video_link', 'YouTube'],
    ]);
    const uploaded = res.filter((r) => r.storagePath);
    for (const r of uploaded) {
      expect(stored.get(r.storagePath!)).toEqual(PDF);
      expect(r).toMatchObject({ mimeType: 'application/pdf', uploadedBy: actorId });
    }
    expect(stored.size).toBe(4);

    const audits = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.actorId, actorId), eq(auditLog.entity, 'song')));
    expect(audits).toHaveLength(2);
  });

  test('running again creates no duplicates and reports everything unchanged', async () => {
    const ids = (await importedSongs()).map((s) => s.id);
    const before = await countsFor(ids);
    const auditsBefore = (await db.select().from(auditLog).where(eq(auditLog.actorId, actorId)))
      .length;

    const report = await runImport(db, options());
    expect(report.songs.map((s) => s.status)).toEqual(['skipped', 'skipped']);
    expect(await importedSongs()).toHaveLength(2);
    expect(await countsFor(ids)).toEqual(before);
    expect(stored.size).toBe(4);
    const auditsAfter = (await db.select().from(auditLog).where(eq(auditLog.actorId, actorId)))
      .length;
    expect(auditsAfter).toBe(auditsBefore);
  });

  test('a changed cell updates the existing song in place', async () => {
    const report = await runImport(db, options({ csvText: csv('132') }));
    expect(report.songs.map((s) => [s.status, s.changes])).toEqual([
      ['updated', ['tempo']],
      ['skipped', []],
    ]);
    const rows = await importedSongs();
    expect(rows).toHaveLength(2);
    expect(rows.find((s) => s.title === alpha)!.tempoBpm).toBe(132);
  });
});
