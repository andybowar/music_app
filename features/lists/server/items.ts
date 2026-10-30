'use server';

/**
 * List items (contracts/api.md; REQ-LIST-02..05): add, remove, reorder and per-item overrides.
 *
 * Every action: requireUser → validate ids → lock the list row (`FOR UPDATE`) → assertCan
 * ('list:write', { list }) → work, all in one transaction → `ActionResult` via `withAction`.
 *
 * Locking the parent list serializes all item mutations on that list, so positions stay
 * contiguous (0..n-1) under concurrency: concurrent reorders are last-write-wins, and
 * concurrent adds append one after the other.
 *
 * A list the caller cannot read (someone else's playlist) or that is soft-deleted is reported
 * as NOT_FOUND, so its existence is not revealed. List items are not song data, so no audit
 * rows are written (contracts/api.md audits song-related entities only).
 */

import 'server-only';

import type { AppUser, ListItem, ResourceKind, UUID } from '@/types/domain';

import { and, asc, count, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';

import { listItems, lists, resources, songs } from '@/db/schema';
import { ActionError, withAction } from '@/lib/action';
import { requireUser } from '@/lib/auth';
import { type Tx, withTx } from '@/lib/db';
import { assertCan, can } from '@/lib/permissions';
import { listItemPatchSchema } from '@/types/validation';

type ListItemRow = typeof listItems.$inferSelect;
type ListItemPatchInput = z.input<typeof listItemPatchSchema>;

const LIST_NOT_FOUND = 'List not found.';
const ITEM_NOT_FOUND = 'List item not found.';
const SONG_NOT_FOUND = 'Song not found.';

/** Resource kinds a playlist item may choose as its audio (REQ-LIST-05: MP3 or YouTube link). */
const PLAYABLE_KINDS: readonly ResourceKind[] = ['audio', 'video_link'];

const idSchema = z.guid();
const itemIdsSchema = z
  .array(idSchema)
  .refine((ids) => new Set(ids).size === ids.length, { message: 'Item ids must be unique.' });

function toListItem(row: ListItemRow): ListItem {
  return {
    id: row.id,
    listId: row.listId,
    songId: row.songId,
    position: row.position,
    overrideKey: row.overrideKey,
    overrideBpm: row.overrideBpm,
    overrideEnergy: row.overrideEnergy,
    resourceId: row.resourceId,
    notes: row.notes,
  };
}

/**
 * Lock the (live) list row for the rest of the transaction and check `list:write`.
 * Lists the caller can't even read are NOT_FOUND rather than FORBIDDEN.
 */
async function lockListForWrite(tx: Tx, user: AppUser, listId: UUID): Promise<void> {
  const [list] = await tx
    .select({ type: lists.type, ownerId: lists.ownerId, branchId: lists.branchId })
    .from(lists)
    .where(and(eq(lists.id, listId), isNull(lists.deletedAt)))
    .for('update');
  if (!list || !can(user, 'list:read', { list })) {
    throw new ActionError('NOT_FOUND', LIST_NOT_FOUND);
  }
  assertCan(user, 'list:write', { list });
}

/** Lock the item's list (see `lockListForWrite`) and return the item, read under that lock. */
async function lockItemForWrite(tx: Tx, user: AppUser, itemId: UUID): Promise<ListItemRow> {
  const [ref] = await tx
    .select({ listId: listItems.listId })
    .from(listItems)
    .where(eq(listItems.id, itemId));
  if (!ref) throw new ActionError('NOT_FOUND', ITEM_NOT_FOUND);
  await lockListForWrite(tx, user, ref.listId);

  // Re-read under the lock: a concurrent remove may have deleted it meanwhile.
  const [item] = await tx
    .select()
    .from(listItems)
    .where(and(eq(listItems.id, itemId), eq(listItems.listId, ref.listId)));
  if (!item) throw new ActionError('NOT_FOUND', ITEM_NOT_FOUND);
  return item;
}

async function touchList(tx: Tx, listId: UUID): Promise<void> {
  await tx
    .update(lists)
    .set({ updatedAt: sql`now()` })
    .where(eq(lists.id, listId));
}

/** Renumber a list's items to 0..n-1, keeping their current order. */
async function compactPositions(tx: Tx, listId: UUID): Promise<void> {
  await tx.execute(sql`
    update list_items li
       set position = r.pos
      from (select id, (row_number() over (order by position, created_at, id) - 1)::int as pos
              from list_items
             where list_id = ${listId}) r
     where li.id = r.id and li.position <> r.pos`);
}

/** Append a song to the end of a list. */
export const addListItem = withAction(async (listId: UUID, songId: UUID): Promise<ListItem> => {
  const user = await requireUser();
  const lid = idSchema.parse(listId);
  const sid = idSchema.parse(songId);

  return withTx(async (tx) => {
    await lockListForWrite(tx, user, lid);

    const [song] = await tx
      .select({ id: songs.id })
      .from(songs)
      .where(and(eq(songs.id, sid), isNull(songs.deletedAt)));
    if (!song) throw new ActionError('NOT_FOUND', SONG_NOT_FOUND);

    const [{ n } = { n: 0 }] = await tx
      .select({ n: count() })
      .from(listItems)
      .where(eq(listItems.listId, lid));
    const [row] = await tx
      .insert(listItems)
      .values({ listId: lid, songId: sid, position: n })
      .returning();
    if (!row) throw new Error('Insert returned no row');

    await touchList(tx, lid);
    return toListItem(row);
  });
});

/** Remove an item; the items after it move up so positions stay contiguous. */
export const removeListItem = withAction(async (itemId: UUID): Promise<void> => {
  const user = await requireUser();
  const id = idSchema.parse(itemId);

  await withTx(async (tx) => {
    const item = await lockItemForWrite(tx, user, id);
    await tx.delete(listItems).where(eq(listItems.id, item.id));
    await compactPositions(tx, item.listId);
    await touchList(tx, item.listId);
  });
});

/**
 * Set the list's order. `itemIds` must be exactly the list's current items (same set, no
 * duplicates); item `itemIds[i]` gets position `i`.
 */
export const reorderList = withAction(async (listId: UUID, itemIds: UUID[]): Promise<void> => {
  const user = await requireUser();
  const lid = idSchema.parse(listId);
  const ids = itemIdsSchema.parse(itemIds);

  await withTx(async (tx) => {
    await lockListForWrite(tx, user, lid);

    const current = await tx
      .select({ id: listItems.id })
      .from(listItems)
      .where(eq(listItems.listId, lid))
      .orderBy(asc(listItems.position));
    const currentIds = new Set(current.map((r) => r.id));
    if (current.length !== ids.length || ids.some((id) => !currentIds.has(id))) {
      const message = 'The list has changed. Reload it and try again.';
      throw new ActionError('CONFLICT', message, { itemIds: [message] });
    }
    if (ids.length === 0) return;

    const cases = sql.join(
      ids.map((id, i) => sql`when ${id}::uuid then ${i}::int`),
      sql` `,
    );
    await tx
      .update(listItems)
      .set({ position: sql`case ${listItems.id} ${cases} end` })
      .where(eq(listItems.listId, lid));
    await touchList(tx, lid);
  });
});

/**
 * Patch an item's overrides (key, BPM, energy), notes or chosen audio. Omitted fields are
 * left alone; `null` clears one. `resourceId` must be an audio or video resource of the
 * item's song.
 */
export const updateListItem = withAction(
  async (itemId: UUID, patch: ListItemPatchInput): Promise<ListItem> => {
    const user = await requireUser();
    const id = idSchema.parse(itemId);
    const data = listItemPatchSchema.parse(patch);

    return withTx(async (tx) => {
      const item = await lockItemForWrite(tx, user, id);

      if (data.resourceId) {
        const [resource] = await tx
          .select({ songId: resources.songId, kind: resources.kind })
          .from(resources)
          .where(eq(resources.id, data.resourceId));
        const message = !resource
          ? 'Resource not found.'
          : resource.songId !== item.songId
            ? 'That resource belongs to a different song.'
            : !PLAYABLE_KINDS.includes(resource.kind)
              ? 'Choose an audio file or a video link.'
              : null;
        if (message) throw new ActionError('VALIDATION', message, { resourceId: [message] });
      }

      const set: Partial<typeof listItems.$inferInsert> = {};
      if (data.overrideKey !== undefined) set.overrideKey = data.overrideKey;
      if (data.overrideBpm !== undefined) set.overrideBpm = data.overrideBpm;
      if (data.overrideEnergy !== undefined) set.overrideEnergy = data.overrideEnergy;
      if (data.resourceId !== undefined) set.resourceId = data.resourceId;
      if (data.notes !== undefined) set.notes = data.notes;
      if (Object.keys(set).length === 0) return toListItem(item);

      const [row] = await tx
        .update(listItems)
        .set(set)
        .where(eq(listItems.id, item.id))
        .returning();
      if (!row) throw new ActionError('NOT_FOUND', ITEM_NOT_FOUND);

      await touchList(tx, item.listId);
      return toListItem(row);
    });
  },
);
