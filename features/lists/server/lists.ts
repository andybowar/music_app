'use server';

/**
 * List persistence (contracts/api.md, LIST-01; REQ-LIST-01/03/06/07/08): create, read,
 * browse, rename and soft-delete setlists and playlists.
 *
 * Actions follow requireUser → assertCan → Zod → work → `ActionResult` via `withAction`.
 * `renameList` / `deleteList` lock the list row (`FOR UPDATE`) and check `list:write` in the
 * same transaction, like the item actions in `items.ts`.
 *
 * Read helpers (`getList`, `listLists`) return plain data and enforce `list:read`: anyone may
 * read any setlist; a playlist only its owner (and admins). A list the caller cannot read, or
 * that is soft-deleted, is reported as missing (`null` / NOT_FOUND) so its existence is not
 * revealed.
 *
 * Lists are not song data, so no audit rows are written (contracts/api.md audits song-related
 * entities only). Setting the session's current list after `createList` (REQ-LIST-01) is the
 * caller's job (`CurrentListProvider`, LIST-04).
 */

import 'server-only';

import type {
  AppUser,
  ISODate,
  List,
  ListDetail,
  ListItem,
  ListType,
  SongDetail,
  UUID,
} from '@/types/domain';

import { and, asc, desc, eq, inArray, isNull, or, type SQL, sql } from 'drizzle-orm';
import { z } from 'zod';

import {
  branches,
  composers,
  listItems,
  lists,
  resources,
  songComposers,
  songKeys,
  songs,
  users,
} from '@/db/schema';
import { assembleSongDetail } from '@/features/songs/server/assemble';
import { ActionError, withAction } from '@/lib/action';
import { requireUser } from '@/lib/auth';
import { getDb, type Tx, withTx } from '@/lib/db';
import { resolveItemDisplay } from '@/lib/lists/resolve';
import { assertCan, can } from '@/lib/permissions';
import { LIST_TYPES } from '@/types/domain';
import { listInputSchema } from '@/types/validation';

type ListInputArg = z.input<typeof listInputSchema>;

/** `listLists` scopes: the caller's lists; theirs plus their branch's (REQ-LIST-07); all readable. */
export type ListScope = 'mine' | 'branch' | 'all';

export interface ListListsParams {
  /** Omit for both types. */
  type?: ListType;
  scope: ListScope;
  /** Default true: upcoming events (event date ≥ today) soonest first, then past ones latest first. */
  upcomingFirst?: boolean;
}

const LIST_NOT_FOUND = 'List not found.';
const NEEDS_DATE = 'A setlist needs a date';

const idSchema = z.guid();
const nameSchema = z.string().trim().min(1).max(120);
const renameSchema = z.object({
  id: idSchema,
  name: nameSchema,
  /** `undefined` keeps the current date; `null` clears it (playlists only). */
  eventDate: z.iso.date().nullable().optional(),
});
const listListsSchema = z.object({
  type: z.enum(LIST_TYPES).optional(),
  scope: z.enum(['mine', 'branch', 'all']),
  upcomingFirst: z.boolean().default(true),
});

// ----- Row → List --------------------------------------------------------------------------

/** Columns selected for a `List`; use with `listQuery`. */
const listColumns = {
  id: lists.id,
  type: lists.type,
  name: lists.name,
  eventDate: lists.eventDate,
  ownerId: lists.ownerId,
  ownerName: users.name,
  branchId: lists.branchId,
  branchCode: branches.code,
  itemCount: sql<number>`(select count(*)::int from ${listItems} where ${listItems.listId} = ${lists.id})`,
  createdAt: lists.createdAt,
  updatedAt: lists.updatedAt,
};

interface ListRow {
  id: string;
  type: ListType;
  name: string;
  eventDate: string | null;
  ownerId: string;
  ownerName: string;
  branchId: string | null;
  branchCode: string | null;
  itemCount: number;
  createdAt: Date;
  updatedAt: Date;
}

/** Live lists joined to their owner's name, branch code and item count. */
function listQuery(where: SQL | undefined) {
  return getDb()
    .select(listColumns)
    .from(lists)
    .innerJoin(users, eq(users.id, lists.ownerId))
    .leftJoin(branches, eq(branches.id, lists.branchId))
    .where(and(isNull(lists.deletedAt), where));
}

function toList(row: ListRow): List {
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    eventDate: row.eventDate,
    ownerId: row.ownerId,
    ownerName: row.ownerName,
    branchId: row.branchId,
    branchCode: row.branchCode,
    itemCount: Number(row.itemCount),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * SQL mirror of `can(user, 'list:read', { list })` (contracts/permissions.md): admins read
 * everything; everyone else reads every setlist and their own playlists.
 */
function readableBy(user: AppUser): SQL | undefined {
  if (user.role === 'admin') return undefined;
  return or(eq(lists.type, 'setlist'), eq(lists.ownerId, user.id));
}

function scopeFilter(user: AppUser, scope: ListScope): SQL | undefined {
  switch (scope) {
    case 'mine':
      return eq(lists.ownerId, user.id);
    case 'branch':
      return user.branchId === null
        ? eq(lists.ownerId, user.id)
        : or(eq(lists.ownerId, user.id), eq(lists.branchId, user.branchId));
    case 'all':
      return undefined;
  }
}

/** ORDER BY for `listLists`. Lists without a date (playlists) come last, most recently edited first. */
function listOrder(upcomingFirst: boolean): SQL[] {
  const tail = [desc(lists.updatedAt), asc(lists.id)];
  if (!upcomingFirst) return [sql`${lists.eventDate} desc nulls last`, ...tail];
  return [
    // true (upcoming), then false (past), then null (no date)
    sql`(${lists.eventDate} >= current_date) desc nulls last`,
    sql`case when ${lists.eventDate} >= current_date then ${lists.eventDate} end asc`,
    sql`${lists.eventDate} desc nulls last`,
    ...tail,
  ];
}

// ----- Read helpers ------------------------------------------------------------------------

/**
 * Lists the caller may read, newest event first by default (see `ListListsParams`).
 * Scopes: `mine` = lists they own; `branch` = theirs plus their branch's (what Open Setlist /
 * Open Playlist show, REQ-LIST-07); `all` = every list they may read.
 */
export async function listLists(params: ListListsParams): Promise<List[]> {
  const user = await requireUser();
  const { type, scope, upcomingFirst } = listListsSchema.parse(params);

  const rows = await listQuery(
    and(type ? eq(lists.type, type) : undefined, readableBy(user), scopeFilter(user, scope)),
  ).orderBy(...listOrder(upcomingFirst));

  // Belt and braces: the SQL filter mirrors can(); keep only what can() also allows.
  const visible = rows.filter((list) => can(user, 'list:read', { list }));
  return visible.map(toList);
}

/**
 * A list with its items resolved for display (REQ-LIST-04), or `null` when it doesn't exist,
 * is soft-deleted, or the caller may not read it. Items whose song was soft-deleted are kept
 * (lists keep their rows), so the items always match what `reorderList` expects.
 */
export async function getList(id: UUID): Promise<ListDetail | null> {
  const user = await requireUser();
  if (!idSchema.safeParse(id).success) return null;

  const [row] = await listQuery(eq(lists.id, id));
  if (!row || !can(user, 'list:read', { list: row })) return null;

  const itemRows = await getDb()
    .select()
    .from(listItems)
    .where(eq(listItems.listId, id))
    .orderBy(asc(listItems.position), asc(listItems.createdAt), asc(listItems.id));
  const items: ListItem[] = itemRows.map((r) => ({
    id: r.id,
    listId: r.listId,
    songId: r.songId,
    position: r.position,
    overrideKey: r.overrideKey,
    overrideBpm: r.overrideBpm,
    overrideEnergy: r.overrideEnergy,
    resourceId: r.resourceId,
    notes: r.notes,
  }));

  const details = await loadItemSongs(items.map((i) => i.songId));
  const resolved = items.flatMap((item) => {
    const song = details.get(item.songId);
    return song ? [resolveItemDisplay(song, item)] : [];
  });

  return { ...toList(row), items: resolved };
}

/**
 * Songs for list items, soft-deleted ones included, keyed by id. Loads only what
 * `resolveItemDisplay` reads (song row, composers, keys, resources, branch codes); themes and
 * usage are left empty.
 */
async function loadItemSongs(songIds: readonly string[]): Promise<Map<string, SongDetail>> {
  const ids = [...new Set(songIds)];
  if (!ids.length) return new Map();
  const db = getDb();

  const [songRows, composerRows, keyRows, resourceRows, branchRows] = await Promise.all([
    db.select().from(songs).where(inArray(songs.id, ids)),
    db
      .select({
        songId: songComposers.songId,
        sortOrder: songComposers.sortOrder,
        composer: { id: composers.id, name: composers.name, popMember: composers.popMember },
      })
      .from(songComposers)
      .innerJoin(composers, eq(composers.id, songComposers.composerId))
      .where(inArray(songComposers.songId, ids)),
    db.select().from(songKeys).where(inArray(songKeys.songId, ids)),
    db.select().from(resources).where(inArray(resources.songId, ids)),
    db.select({ id: branches.id, code: branches.code }).from(branches),
  ]);

  const bySong = <T extends { songId: string }>(rows: T[], songId: string) =>
    rows.filter((r) => r.songId === songId);
  return new Map(
    songRows.map((song) => [
      song.id,
      assembleSongDetail({
        song,
        composers: bySong(composerRows, song.id),
        keys: bySong(keyRows, song.id),
        resources: bySong(resourceRows, song.id),
        themes: [],
        usage: [],
        branches: branchRows,
      }),
    ]),
  );
}

// ----- Actions -----------------------------------------------------------------------------

/**
 * Create a setlist or playlist owned by the caller, tagged with their branch. The caller makes
 * it the current list (REQ-LIST-01).
 */
export const createList = withAction(async (input: ListInputArg): Promise<List> => {
  const user = await requireUser();
  assertCan(user, 'list:create');
  const data = listInputSchema.parse(input);

  const [row] = await getDb()
    .insert(lists)
    .values({
      type: data.type,
      name: data.name,
      eventDate: data.eventDate,
      ownerId: user.id,
      branchId: user.branchId,
    })
    .returning({ id: lists.id });
  if (!row) throw new Error('Insert returned no row');

  const [created] = await listQuery(eq(lists.id, row.id));
  if (!created) throw new Error('Created list not found');
  return toList(created);
});

/**
 * Lock the live list row for the rest of the transaction and check `list:write`. Lists the
 * caller can't even read are NOT_FOUND rather than FORBIDDEN.
 */
async function lockListForWrite(tx: Tx, user: AppUser, listId: UUID) {
  const [list] = await tx
    .select({ type: lists.type, ownerId: lists.ownerId, branchId: lists.branchId })
    .from(lists)
    .where(and(eq(lists.id, listId), isNull(lists.deletedAt)))
    .for('update');
  if (!list || !can(user, 'list:read', { list })) {
    throw new ActionError('NOT_FOUND', LIST_NOT_FOUND);
  }
  assertCan(user, 'list:write', { list });
  return list;
}

/**
 * Rename a list and optionally change its date. `eventDate` omitted keeps the current date;
 * `null` clears it, which only a playlist allows.
 */
export const renameList = withAction(
  async (id: UUID, name: string, eventDate?: ISODate | null): Promise<void> => {
    const user = await requireUser();
    const data = renameSchema.parse({ id, name, eventDate });

    await withTx(async (tx) => {
      const list = await lockListForWrite(tx, user, data.id);
      if (list.type === 'setlist' && data.eventDate === null) {
        throw new ActionError('VALIDATION', NEEDS_DATE, { eventDate: [NEEDS_DATE] });
      }
      await tx
        .update(lists)
        .set({
          name: data.name,
          ...(data.eventDate !== undefined ? { eventDate: data.eventDate } : {}),
          updatedAt: sql`now()`,
        })
        .where(eq(lists.id, data.id));
    });
  },
);

/** Soft delete (REQ-LIST-06): sets `deleted_at`; the list disappears from every read. */
export const deleteList = withAction(async (id: UUID): Promise<void> => {
  const user = await requireUser();
  const listId = idSchema.parse(id);

  await withTx(async (tx) => {
    await lockListForWrite(tx, user, listId);
    await tx
      .update(lists)
      .set({ deletedAt: sql`now()`, updatedAt: sql`now()` })
      .where(eq(lists.id, listId));
  });
});
