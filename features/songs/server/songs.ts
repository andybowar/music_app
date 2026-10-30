'use server';

/**
 * Song persistence (contracts/api.md, LIB-01; REQ-LIB-01/02/04/06/12).
 *
 * Actions follow requireUser → assertCan → Zod → work → ActionResult (via `withAction`) and
 * write an `audit_log` row in the same transaction. Keys (LIB-02), themes (LIB-04), usage
 * (LIB-05) and resources (LIB-06/07) have their own actions; `createSong`/`updateSong` write
 * the song row and its ordered composers (`composerIds` is part of `songInputSchema`).
 *
 * `addedByBranchId` (REQ-LIB-04) is the creator's branch unless an admin sets it. A non-admin
 * may send it only with the value it would get anyway (the creator's branch on create, the
 * current value on update), so an edit form can round-trip the field.
 */

import 'server-only';

import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { z } from 'zod';

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
} from '@/db/schema';
import { ActionError, withAction } from '@/lib/action';
import { recordAudit } from '@/lib/audit';
import { requireUser } from '@/lib/auth';
import { getDb, withTx, type Tx } from '@/lib/db';
import { assertCan } from '@/lib/permissions';
import type { AppUser, SongDetail, UUID } from '@/types/domain';
import { SECTIONS } from '@/types/domain';
import { songInputSchema, type SongInput } from '@/types/validation';

import { assembleSongDetail, LYRIC_COLUMNS, type SongRow } from './assemble';

const ENTITY = 'song';
const NOT_FOUND = 'Song not found.';

const idSchema = z.guid();

function parseId(id: unknown): UUID {
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) throw new ActionError('NOT_FOUND', NOT_FOUND);
  return parsed.data;
}

/** Rejects duplicate or unknown composer ids with a VALIDATION field error. */
async function checkComposers(tx: Tx, ids: string[]): Promise<void> {
  if (new Set(ids).size !== ids.length) {
    throw new ActionError('VALIDATION', 'Invalid input.', {
      composerIds: ['Each composer can only be listed once'],
    });
  }
  const found = await tx
    .select({ id: composers.id })
    .from(composers)
    .where(inArray(composers.id, ids));
  if (found.length !== ids.length) {
    throw new ActionError('VALIDATION', 'Invalid input.', {
      composerIds: ['Unknown composer'],
    });
  }
}

async function checkBranch(tx: Tx, id: string | null): Promise<void> {
  if (id === null) return;
  const [row] = await tx.select({ id: branches.id }).from(branches).where(eq(branches.id, id));
  if (!row) {
    throw new ActionError('VALIDATION', 'Invalid input.', {
      addedByBranchId: ['Unknown branch'],
    });
  }
}

/**
 * The `added_by_branch_id` to store. `fallback` is what a non-admin gets: the creator's
 * branch on create, the current value on update.
 */
function resolveAddedBy(
  user: AppUser,
  requested: string | null | undefined,
  fallback: string | null,
) {
  if (requested === undefined) return fallback;
  if (requested === fallback) return fallback;
  assertCan(user, 'song:set_added_by');
  return requested;
}

/** Song columns written from a validated input (derived columns are left to DB-02). */
function songValues(input: SongInput) {
  const lyrics = Object.fromEntries(
    SECTIONS.map((s) => [LYRIC_COLUMNS[s], input.lyrics[s]?.trim() ? input.lyrics[s] : null]),
  ) as Record<(typeof LYRIC_COLUMNS)[keyof typeof LYRIC_COLUMNS], string | null>;
  return {
    title: input.title,
    altTitles: input.altTitles,
    year: input.year,
    sourceGroup: input.sourceGroup || null,
    tempoBpm: input.tempoBpm,
    timeSignature: input.timeSignature,
    energyLevel: input.energyLevel,
    energyNotes: input.energyNotes || null,
    ...lyrics,
    arrangement: input.arrangement,
  };
}

async function writeComposers(tx: Tx, songId: string, ids: string[]): Promise<void> {
  await tx.delete(songComposers).where(eq(songComposers.songId, songId));
  await tx
    .insert(songComposers)
    .values(ids.map((composerId, sortOrder) => ({ songId, composerId, sortOrder })));
}

async function loadComposerIds(tx: Tx, songId: string): Promise<string[]> {
  const rows = await tx
    .select({ id: songComposers.composerId })
    .from(songComposers)
    .where(eq(songComposers.songId, songId))
    .orderBy(asc(songComposers.sortOrder));
  return rows.map((r) => r.id);
}

/** What the audit log records about a song: the fields `songInputSchema` edits. */
function auditSnapshot(song: SongRow, composerIds: string[]): Record<string, unknown> {
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
    lyrics: Object.fromEntries(SECTIONS.map((s) => [s, song[LYRIC_COLUMNS[s]]])),
    arrangement: song.arrangement,
    addedByBranchId: song.addedByBranchId,
  };
}

async function lockLiveSong(tx: Tx, id: string): Promise<SongRow> {
  const [row] = await tx
    .select()
    .from(songs)
    .where(and(eq(songs.id, id), isNull(songs.deletedAt)))
    .for('update');
  if (!row) throw new ActionError('NOT_FOUND', NOT_FOUND);
  return row;
}

// ----- Actions ----------------------------------------------------------------------------

export const createSong = withAction(async (input: unknown): Promise<{ id: UUID }> => {
  const user = await requireUser();
  assertCan(user, 'song:write');
  const data = songInputSchema.parse(input);
  const addedByBranchId = resolveAddedBy(user, data.addedByBranchId, user.branchId);

  return withTx(async (tx) => {
    await checkComposers(tx, data.composerIds);
    await checkBranch(tx, addedByBranchId);

    const [song] = await tx
      .insert(songs)
      .values({
        ...songValues(data),
        addedByBranchId,
        createdBy: user.id,
        updatedBy: user.id,
      })
      .returning();
    await writeComposers(tx, song!.id, data.composerIds);

    await recordAudit(tx, {
      actorId: user.id,
      entity: ENTITY,
      entityId: song!.id,
      action: 'create',
      after: auditSnapshot(song!, data.composerIds),
    });
    return { id: song!.id };
  });
});

export const updateSong = withAction(async (id: UUID, input: unknown): Promise<void> => {
  const user = await requireUser();
  assertCan(user, 'song:write');
  const songId = parseId(id);
  const data = songInputSchema.parse(input);

  await withTx(async (tx) => {
    const before = await lockLiveSong(tx, songId);
    const beforeComposerIds = await loadComposerIds(tx, songId);
    const addedByBranchId = resolveAddedBy(user, data.addedByBranchId, before.addedByBranchId);
    await checkComposers(tx, data.composerIds);
    await checkBranch(tx, addedByBranchId);

    const [after] = await tx
      .update(songs)
      .set({ ...songValues(data), addedByBranchId, updatedBy: user.id })
      .where(eq(songs.id, songId))
      .returning();
    const composersChanged =
      beforeComposerIds.length !== data.composerIds.length ||
      beforeComposerIds.some((c, i) => c !== data.composerIds[i]);
    if (composersChanged) await writeComposers(tx, songId, data.composerIds);

    await recordAudit(tx, {
      actorId: user.id,
      entity: ENTITY,
      entityId: songId,
      action: 'update',
      before: auditSnapshot(before, beforeComposerIds),
      after: auditSnapshot(after!, data.composerIds),
    });
  });
});

/** Soft delete (sets `deleted_at`); the song disappears from reads but lists keep their rows. */
export const deleteSong = withAction(async (id: UUID): Promise<void> => {
  const user = await requireUser();
  assertCan(user, 'song:delete');
  const songId = parseId(id);

  await withTx(async (tx) => {
    const before = await lockLiveSong(tx, songId);
    const composerIds = await loadComposerIds(tx, songId);
    await tx
      .update(songs)
      .set({ deletedAt: new Date(), updatedBy: user.id })
      .where(eq(songs.id, songId));
    await recordAudit(tx, {
      actorId: user.id,
      entity: ENTITY,
      entityId: songId,
      action: 'delete',
      before: auditSnapshot(before, composerIds),
    });
  });
});

// ----- Read helpers -----------------------------------------------------------------------

/** Loads and assembles live (not soft-deleted) songs, in the order of `ids`. */
async function loadSongDetails(ids: readonly string[]): Promise<SongDetail[]> {
  const wanted = [...new Set(ids.filter((id) => idSchema.safeParse(id).success))];
  if (!wanted.length) return [];
  const db = getDb();

  const songRows = await db
    .select()
    .from(songs)
    .where(and(inArray(songs.id, wanted), isNull(songs.deletedAt)));
  if (!songRows.length) return [];
  const found = songRows.map((s) => s.id);

  const [composerRows, keyRows, resourceRows, themeRows, usageRows, branchRows] = await Promise.all(
    [
      db
        .select({
          songId: songComposers.songId,
          sortOrder: songComposers.sortOrder,
          composer: { id: composers.id, name: composers.name, popMember: composers.popMember },
        })
        .from(songComposers)
        .innerJoin(composers, eq(composers.id, songComposers.composerId))
        .where(inArray(songComposers.songId, found)),
      db.select().from(songKeys).where(inArray(songKeys.songId, found)),
      db.select().from(resources).where(inArray(resources.songId, found)),
      db
        .select({
          songId: songThemes.songId,
          section: songThemes.section,
          theme: { id: themes.id, name: themes.name },
        })
        .from(songThemes)
        .innerJoin(themes, eq(themes.id, songThemes.themeId))
        .where(inArray(songThemes.songId, found)),
      db
        .select({
          songId: branchUsage.songId,
          branchId: branchUsage.branchId,
          level: branchUsage.level,
          source: branchUsage.source,
        })
        .from(branchUsage)
        .where(inArray(branchUsage.songId, found)),
      db
        .select({ id: branches.id, code: branches.code })
        .from(branches)
        .orderBy(asc(branches.createdAt), asc(branches.id)),
    ],
  );

  const bySong = <T extends { songId: string }>(rows: T[], songId: string) =>
    rows.filter((r) => r.songId === songId);
  const details = new Map(
    songRows.map((song) => [
      song.id,
      assembleSongDetail({
        song,
        composers: bySong(composerRows, song.id),
        keys: bySong(keyRows, song.id),
        resources: bySong(resourceRows, song.id),
        themes: bySong(themeRows, song.id),
        usage: bySong(usageRows, song.id),
        branches: branchRows,
      }),
    ]),
  );
  return wanted.flatMap((id) => details.get(id) ?? []);
}

/** A live song's full detail, or `null` when it doesn't exist or was deleted. */
export async function getSong(id: UUID): Promise<SongDetail | null> {
  const user = await requireUser();
  assertCan(user, 'song:read');
  const [song] = await loadSongDetails([id]);
  return song ?? null;
}

/** Live songs among `ids`, in the order given (unknown/deleted ids are skipped). */
export async function getSongs(ids: UUID[]): Promise<SongDetail[]> {
  const user = await requireUser();
  assertCan(user, 'song:read');
  return loadSongDetails(ids);
}
