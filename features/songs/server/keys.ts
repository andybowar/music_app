'use server';

/**
 * Song keys (contracts/api.md, REQ-LIB-08): replace-all save of a song's keys and
 * their first chords.
 *
 * The input carries no row ids, so existing rows are matched to input entries:
 *   1. by key name (an unchanged key keeps its row, id and resources);
 *   2. leftover existing rows are then paired, in order, with leftover input
 *      entries: a "rename" (the row keeps its id, so its resources stay attached).
 *      Existing rows are ordered primary first, then alphabetically (the order
 *      `SongDetail.keys` hands to the editor); input entries keep their order.
 *   3. existing rows still unpaired are deleted, which is refused with CONFLICT
 *      while they have resources (the FK would otherwise cascade-delete them);
 *      input entries still unpaired are inserted.
 */

import 'server-only';

import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';
import { z } from 'zod';

import { resources, songKeys, songs } from '@/db/schema';
import { ActionError, withAction } from '@/lib/action';
import { recordAudit } from '@/lib/audit';
import { requireUser } from '@/lib/auth';
import { type Tx, withTx } from '@/lib/db';
import { assertCan } from '@/lib/permissions';
import type { AppUser, SongKey } from '@/types/domain';
import { type SongKeyInput, songKeysInputSchema } from '@/types/validation';

type SongKeyRow = typeof songKeys.$inferSelect;
type ChordColumns = Pick<SongKeyRow, 'introChord' | 'verseChord' | 'chorusChord' | 'bridgeChord'>;

const songIdSchema = z.guid();

/**
 * `assertCan` throws a plain `Error` named `ActionError` (lib/permissions.ts predates
 * lib/action.ts), which `withAction` would report as INTERNAL. Re-throw it as a real
 * `ActionError` so the caller gets FORBIDDEN.
 */
function assertCanWrite(user: AppUser): void {
  try {
    assertCan(user, 'song:write');
  } catch (error) {
    if (error instanceof ActionError) throw error;
    const message = error instanceof Error ? error.message : 'Forbidden.';
    throw new ActionError('FORBIDDEN', message);
  }
}

function chordColumns(input: SongKeyInput): ChordColumns {
  const c = input.firstChords;
  return {
    introChord: c.intro ?? null,
    verseChord: c.verse ?? null,
    chorusChord: c.chorus ?? null,
    bridgeChord: c.bridge ?? null,
  };
}

/** The audited, user-visible fields of a row (no ids). */
function auditFields(row: Pick<SongKeyRow, 'key' | 'isPrimary'> & ChordColumns) {
  return {
    key: row.key,
    isPrimary: row.isPrimary,
    introChord: row.introChord,
    verseChord: row.verseChord,
    chorusChord: row.chorusChord,
    bridgeChord: row.bridgeChord,
  };
}

function toSongKey(row: SongKeyRow): SongKey {
  return {
    id: row.id,
    songId: row.songId,
    key: row.key,
    isPrimary: row.isPrimary,
    firstChords: {
      intro: row.introChord,
      verse: row.verseChord,
      chorus: row.chorusChord,
      bridge: row.bridgeChord,
    },
  };
}

/** Primary first, then alphabetical (the `SongDetail.keys` order). */
function byPrimaryThenKey(a: Pick<SongKeyRow, 'isPrimary' | 'key'>, b: typeof a): number {
  if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
  return a.key.localeCompare(b.key);
}

interface KeyPlan {
  updates: Array<{ row: SongKeyRow; input: SongKeyInput }>;
  inserts: SongKeyInput[];
  deletes: SongKeyRow[];
}

function planKeyChanges(existing: SongKeyRow[], keys: SongKeyInput[]): KeyPlan {
  const byKey = new Map(existing.map((row) => [row.key, row]));
  const updates: KeyPlan['updates'] = [];
  const unmatchedInputs: SongKeyInput[] = [];

  for (const input of keys) {
    const row = byKey.get(input.key);
    if (row) {
      updates.push({ row, input });
      byKey.delete(input.key);
    } else {
      unmatchedInputs.push(input);
    }
  }

  const unmatchedRows = [...byKey.values()].sort(byPrimaryThenKey);
  const pairs = Math.min(unmatchedRows.length, unmatchedInputs.length);
  for (let i = 0; i < pairs; i++) {
    updates.push({ row: unmatchedRows[i]!, input: unmatchedInputs[i]! });
  }

  return {
    updates,
    inserts: unmatchedInputs.slice(pairs),
    deletes: unmatchedRows.slice(pairs),
  };
}

async function refuseDeletingKeysWithResources(tx: Tx, deletes: SongKeyRow[]): Promise<void> {
  if (deletes.length === 0) return;
  const attached = await tx
    .select({ songKeyId: resources.songKeyId, label: resources.label })
    .from(resources)
    .where(
      inArray(
        resources.songKeyId,
        deletes.map((row) => row.id),
      ),
    )
    .orderBy(asc(resources.label));
  if (attached.length === 0) return;

  const fieldErrors: Record<string, string[]> = {};
  for (const row of deletes) {
    const labels = attached.filter((r) => r.songKeyId === row.id).map((r) => r.label);
    if (labels.length > 0) fieldErrors[row.key] = labels;
  }
  const summary = Object.entries(fieldErrors)
    .map(([key, labels]) => `${key} (${labels.join(', ')})`)
    .join('; ');
  throw new ActionError(
    'CONFLICT',
    `Remove the resources attached to these keys before deleting them: ${summary}.`,
    fieldErrors,
  );
}

async function replaceSongKeys(
  user: AppUser,
  songId: string,
  keys: SongKeyInput[],
): Promise<SongKey[]> {
  return withTx(async (tx) => {
    // Lock the song so concurrent saves of its keys serialise.
    const [song] = await tx
      .select({ id: songs.id })
      .from(songs)
      .where(and(eq(songs.id, songId), isNull(songs.deletedAt)))
      .for('update');
    if (!song) throw new ActionError('NOT_FOUND', 'Song not found.');

    // FOR UPDATE also blocks resources being attached to these rows (the FK check
    // takes FOR KEY SHARE) until we commit, so the resource check below holds.
    const existing = await tx
      .select()
      .from(songKeys)
      .where(eq(songKeys.songId, songId))
      .for('update');

    const plan = planKeyChanges(existing, keys);
    await refuseDeletingKeysWithResources(tx, plan.deletes);

    for (const row of plan.deletes) {
      await tx.delete(songKeys).where(eq(songKeys.id, row.id));
      await recordAudit(tx, {
        actorId: user.id,
        entity: 'song_key',
        entityId: row.id,
        action: 'delete',
        before: auditFields(row),
      });
    }

    // Only one row may be primary at a time (song_keys_one_primary), so clear the
    // outgoing primary before any row becomes primary.
    for (const { row, input } of plan.updates) {
      if (row.isPrimary && !input.isPrimary) {
        await tx.update(songKeys).set({ isPrimary: false }).where(eq(songKeys.id, row.id));
      }
    }

    for (const { row, input } of plan.updates) {
      const next = { key: input.key, isPrimary: input.isPrimary, ...chordColumns(input) };
      const before = auditFields(row);
      const after = auditFields(next);
      if (JSON.stringify(before) === JSON.stringify(after)) continue;
      await tx.update(songKeys).set(next).where(eq(songKeys.id, row.id));
      await recordAudit(tx, {
        actorId: user.id,
        entity: 'song_key',
        entityId: row.id,
        action: 'update',
        before,
        after,
      });
    }

    for (const input of plan.inserts) {
      const [row] = await tx
        .insert(songKeys)
        .values({ songId, key: input.key, isPrimary: input.isPrimary, ...chordColumns(input) })
        .returning();
      await recordAudit(tx, {
        actorId: user.id,
        entity: 'song_key',
        entityId: row!.id,
        action: 'create',
        after: auditFields(row!),
      });
    }

    await tx
      .update(songs)
      .set({ updatedAt: new Date(), updatedBy: user.id })
      .where(eq(songs.id, songId));

    const saved = await tx
      .select()
      .from(songKeys)
      .where(eq(songKeys.songId, songId))
      .orderBy(desc(songKeys.isPrimary), asc(songKeys.key));
    return saved.map(toSongKey);
  });
}

/**
 * Replace all of a song's keys (REQ-LIB-08). Exactly one key must be primary. Keys
 * that stay (or are renamed) keep their ids, so their resources stay attached;
 * deleting a key that still has resources fails with CONFLICT naming them.
 */
export const setSongKeys = withAction(
  async (songId: string, keys: SongKeyInput[]): Promise<SongKey[]> => {
    const user = await requireUser();
    assertCanWrite(user);
    const id = songIdSchema.parse(songId);
    const parsed = songKeysInputSchema.parse(keys);
    return replaceSongKeys(user, id, parsed);
  },
);
