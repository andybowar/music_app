'use server';

/**
 * Song keys (contracts/api.md, REQ-LIB-08): replace-all save of a song's keys and
 * their first chords.
 *
 * Existing rows are matched to input entries (CR LIB-02-song-key-input-id):
 *   1. by `id` when the entry has one: rename or edit in place, the row keeps its id and
 *      its resources. An id that isn't one of this song's keys is a VALIDATION error;
 *   2. entries without `id`, by key name (an unchanged key keeps its row);
 *   3. fallback only when the request carries no ids at all: if exactly one row and
 *      exactly one entry are left over, that is an unambiguous rename;
 *   4. otherwise leftovers are delete-plus-insert. Deleting a row that still has
 *      resources is refused with CONFLICT (the FK would otherwise cascade-delete them).
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

/** Every key `song_keys.key` accepts (`^[A-G](#|b)?m?$`): 42 values. */
const ALL_KEYS = [...'ABCDEFG'].flatMap((n) =>
  ['', '#', 'b'].flatMap((acc) => ['', 'm'].map((minor) => `${n}${acc}${minor}`)),
);

/** Hands out valid keys not in `used`, for parking rows mid-rename. */
function unusedKeys(used: string[]): { next: () => string } {
  const taken = new Set(used);
  const free = ALL_KEYS.filter((k) => !taken.has(k));
  return {
    next: () => {
      const key = free.shift();
      // Unreachable: at most 12 inputs plus the song's rows leave most of the 42 free.
      if (key === undefined) throw new Error('No temporary key available for rename.');
      return key;
    },
  };
}

interface KeyPlan {
  updates: Array<{ row: SongKeyRow; input: SongKeyInput }>;
  inserts: SongKeyInput[];
  deletes: SongKeyRow[];
}

function planKeyChanges(existing: SongKeyRow[], keys: SongKeyInput[]): KeyPlan {
  const byId = new Map(existing.map((row) => [row.id, row]));
  const updates: KeyPlan['updates'] = [];
  const unknownIds: Record<string, string[]> = {};

  // 1. Entries that name their row by id (ids are unique per songKeysInputSchema).
  keys.forEach((input, i) => {
    if (input.id === undefined) return;
    const row = byId.get(input.id);
    if (row) {
      updates.push({ row, input });
      byId.delete(input.id);
    } else {
      unknownIds[`${i}.id`] = ['This key does not belong to the song.'];
    }
  });
  if (Object.keys(unknownIds).length > 0) {
    throw new ActionError('VALIDATION', 'Invalid input.', unknownIds);
  }

  // 2. Id-less entries, by key name among the rows not already claimed.
  const byKey = new Map([...byId.values()].map((row) => [row.key, row]));
  const unmatchedInputs: SongKeyInput[] = [];
  for (const input of keys) {
    if (input.id !== undefined) continue;
    const row = byKey.get(input.key);
    if (row) {
      updates.push({ row, input });
      byKey.delete(input.key);
    } else {
      unmatchedInputs.push(input);
    }
  }

  // 3. Callers that send no ids at all: a single leftover on each side is an
  //    unambiguous rename. Id-aware callers get no guessing.
  const unmatchedRows = [...byKey.values()].sort(byPrimaryThenKey);
  const usesIds = keys.some((k) => k.id !== undefined);
  if (!usesIds && unmatchedRows.length === 1 && unmatchedInputs.length === 1) {
    updates.push({ row: unmatchedRows[0]!, input: unmatchedInputs[0]! });
    return { updates, inserts: [], deletes: [] };
  }
  return { updates, inserts: unmatchedInputs, deletes: unmatchedRows };
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

    // Unique (song_id, key) and song_keys_one_primary are checked row by row, so a
    // swap (G <-> A by id) or a primary handover would collide mid-way. Phase 1 parks
    // renamed rows on unused temporary keys and clears the outgoing primary; phase 2
    // below writes the final values.
    const tempKeys = unusedKeys([...existing.map((r) => r.key), ...keys.map((k) => k.key)]);
    for (const { row, input } of plan.updates) {
      const renamed = row.key !== input.key;
      const losesPrimary = row.isPrimary && !input.isPrimary;
      if (!renamed && !losesPrimary) continue;
      await tx
        .update(songKeys)
        .set({
          ...(renamed ? { key: tempKeys.next() } : {}),
          ...(losesPrimary ? { isPrimary: false } : {}),
        })
        .where(eq(songKeys.id, row.id));
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
    assertCan(user, 'song:write');
    const id = songIdSchema.parse(songId);
    const parsed = songKeysInputSchema.parse(keys);
    return replaceSongKeys(user, id, parsed);
  },
);
