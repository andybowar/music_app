'use server';

/**
 * Composer actions (contracts/api.md; REQ-LIB-02, REQ-LIB-03).
 *
 * - `searchComposers(prefix)`   — case-insensitive prefix lookup for the composer picker.
 *   Matches the start of the name or the start of any later word ("smi" finds "Jan Smith");
 *   names that start with the prefix rank first, then alphabetical. At most 20 results.
 * - `createComposer(name)`      — idempotent on `lower(name)` (the `composers_name_uq` index):
 *   creating "jan smith" when "Jan Smith" exists returns the existing composer.
 * - `setSongComposers(songId, composerIds)` — replace-all; array order is `sort_order`.
 * - `setComposerPop(id, pop)`   — set the POP-membership flag.
 * - `mergeComposers(keepId, dropId)` — re-point the dropped composer's songs to the kept one,
 *   then delete the dropped composer. A song credited to both keeps a single row at the earlier
 *   position. If the kept composer's POP flag is `none`, it adopts the dropped one's flag.
 *
 * `songs.composer_names` (and with it the search vector) is maintained by the DB-02 triggers on
 * `song_composers`; this module never writes it.
 */

import 'server-only';

import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';

import { composers, songComposers, songs } from '@/db/schema';
import { ActionError, withAction } from '@/lib/action';
import { recordAudit } from '@/lib/audit';
import { requireUser } from '@/lib/auth';
import { getDb, withTx, type Tx } from '@/lib/db';
import { can, type Action } from '@/lib/permissions';
import { POP_MEMBER, type AppUser, type Composer, type PopMember, type UUID } from '@/types/domain';

const SEARCH_LIMIT = 20;

/** Any 8-4-4-4-12 hex id, as in `types/validation.ts`. */
const uuid = z.guid();

const prefixSchema = z.string().max(200);

const nameSchema = z
  .string()
  .transform((s) => s.trim().replace(/\s+/g, ' '))
  .pipe(z.string().min(1, 'Enter a composer name.').max(200, 'Use at most 200 characters.'));

const setSongComposersSchema = z.object({
  songId: uuid,
  composerIds: z
    .array(uuid)
    .min(1, 'Add at least one composer.')
    .max(10, 'Use at most 10 composers.')
    .refine((ids) => new Set(ids.map((id) => id.toLowerCase())).size === ids.length, {
      message: 'A composer is listed twice.',
    }),
});

const setPopSchema = z.object({ id: uuid, pop: z.enum(POP_MEMBER) });

const mergeSchema = z
  .object({ keepId: uuid, dropId: uuid })
  .refine((v) => v.keepId.toLowerCase() !== v.dropId.toLowerCase(), {
    message: 'Choose two different composers.',
    path: ['dropId'],
  });

type ComposerRow = typeof composers.$inferSelect;

function toComposer(row: Pick<ComposerRow, 'id' | 'name' | 'popMember'>): Composer {
  return { id: row.id, name: row.name, popMember: row.popMember };
}

/** Escape LIKE wildcards so user input matches literally (default escape char is `\`). */
function likeEscape(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

const notFound = (what: string) => new ActionError('NOT_FOUND', `${what} not found.`);

/**
 * `assertCan` from lib/permissions throws a plain `Error` (not an `ActionError` instance), which
 * `withAction` reports as INTERNAL instead of FORBIDDEN. Same check, correct error class.
 * TODO(CR): use `assertCan` once agent-spec/change-requests/LIB-03-assertcan-actionerror.md lands.
 */
function ensureCan(user: AppUser, action: Action): void {
  if (!can(user, action)) {
    throw new ActionError('FORBIDDEN', `You do not have permission to do this (${action}).`);
  }
}

// ----- Read helper ---------------------------------------------------------------------

/** Composers whose name (or a later word in it) starts with `prefix`, case-insensitively. */
export async function searchComposers(prefix: string): Promise<Composer[]> {
  const user = await requireUser();
  ensureCan(user, 'song:read');
  const p = prefixSchema.parse(prefix).trim().replace(/\s+/g, ' ').toLowerCase();

  const lowered = sql`lower(${composers.name})`;
  const starts = `${likeEscape(p)}%`;
  const wordStarts = `% ${likeEscape(p)}%`;

  const rows = await getDb()
    .select({ id: composers.id, name: composers.name, popMember: composers.popMember })
    .from(composers)
    .where(p ? sql`(${lowered} like ${starts} or ${lowered} like ${wordStarts})` : undefined)
    .orderBy(sql`(${lowered} like ${starts}) desc`, asc(lowered), asc(composers.id))
    .limit(SEARCH_LIMIT);
  return rows.map(toComposer);
}

// ----- Actions -------------------------------------------------------------------------

/** Create a composer, or return the existing one whose name matches case-insensitively. */
export const createComposer = withAction(async (name: string): Promise<Composer> => {
  const user = await requireUser();
  ensureCan(user, 'composer:create');
  const clean = nameSchema.parse(name);

  return withTx(async (tx) => {
    const [inserted] = await tx
      .insert(composers)
      .values({ name: clean })
      .onConflictDoNothing()
      .returning();
    if (inserted) {
      await recordAudit(tx, {
        actorId: user.id,
        entity: 'composer',
        entityId: inserted.id,
        action: 'create',
        after: { name: inserted.name, popMember: inserted.popMember },
      });
      return toComposer(inserted);
    }
    const [existing] = await tx
      .select()
      .from(composers)
      .where(sql`lower(${composers.name}) = lower(${clean})`)
      .limit(1);
    if (!existing) throw new Error('composer insert conflicted but no match was found');
    return toComposer(existing);
  });
});

async function songComposerIds(tx: Tx, songId: UUID): Promise<UUID[]> {
  const rows = await tx
    .select({ composerId: songComposers.composerId })
    .from(songComposers)
    .where(eq(songComposers.songId, songId))
    .orderBy(asc(songComposers.sortOrder), asc(songComposers.composerId));
  return rows.map((r) => r.composerId);
}

/** Replace a song's composers; the array order becomes the credited order. */
export const setSongComposers = withAction(
  async (songId: UUID, composerIds: UUID[]): Promise<void> => {
    const user = await requireUser();
    ensureCan(user, 'song:write');
    const input = setSongComposersSchema.parse({ songId, composerIds });
    const ids = input.composerIds.map((id) => id.toLowerCase());

    await withTx(async (tx) => {
      const [song] = await tx
        .select({ id: songs.id })
        .from(songs)
        .where(and(eq(songs.id, input.songId), isNull(songs.deletedAt)))
        .for('update');
      if (!song) throw notFound('Song');

      const found = await tx
        .select({ id: composers.id })
        .from(composers)
        .where(inArray(composers.id, ids));
      if (found.length !== ids.length) {
        throw new ActionError('VALIDATION', 'Invalid input.', {
          composerIds: ['One or more composers no longer exist.'],
        });
      }

      const before = await songComposerIds(tx, song.id);
      if (before.length === ids.length && before.every((id, i) => id === ids[i])) return;

      await tx.delete(songComposers).where(eq(songComposers.songId, song.id));
      await tx
        .insert(songComposers)
        .values(ids.map((composerId, i) => ({ songId: song.id, composerId, sortOrder: i })));
      await tx
        .update(songs)
        .set({ updatedAt: new Date(), updatedBy: user.id })
        .where(eq(songs.id, song.id));
      await recordAudit(tx, {
        actorId: user.id,
        entity: 'song_composers',
        entityId: song.id,
        action: 'update',
        before: { composerIds: before },
        after: { composerIds: ids },
      });
    });
  },
);

/** Set a composer's POP-membership flag (`none | past | current`). */
export const setComposerPop = withAction(async (id: UUID, pop: PopMember): Promise<void> => {
  const user = await requireUser();
  ensureCan(user, 'composer:merge');
  const input = setPopSchema.parse({ id, pop });

  await withTx(async (tx) => {
    const [before] = await tx
      .select()
      .from(composers)
      .where(eq(composers.id, input.id))
      .for('update');
    if (!before) throw notFound('Composer');
    if (before.popMember === input.pop) return;

    await tx.update(composers).set({ popMember: input.pop }).where(eq(composers.id, before.id));
    await recordAudit(tx, {
      actorId: user.id,
      entity: 'composer',
      entityId: before.id,
      action: 'update',
      before: { popMember: before.popMember },
      after: { popMember: input.pop },
    });
  });
});

/** Fold `dropId` into `keepId`: re-point its song credits, then delete it. */
export const mergeComposers = withAction(async (keepId: UUID, dropId: UUID): Promise<void> => {
  const user = await requireUser();
  ensureCan(user, 'composer:merge');
  const input = mergeSchema.parse({ keepId, dropId });

  await withTx(async (tx) => {
    const locked = await tx
      .select()
      .from(composers)
      .where(inArray(composers.id, [input.keepId, input.dropId]))
      .orderBy(asc(composers.id))
      .for('update');
    const keep = locked.find((c) => c.id === input.keepId.toLowerCase());
    const drop = locked.find((c) => c.id === input.dropId.toLowerCase());
    if (!keep || !drop) throw notFound('Composer');

    const dropLinks = await tx
      .select({ songId: songComposers.songId })
      .from(songComposers)
      .where(eq(songComposers.composerId, drop.id));
    const songIds = dropLinks.map((l) => l.songId);
    const before = new Map<UUID, UUID[]>();
    for (const songId of songIds) before.set(songId, await songComposerIds(tx, songId));

    if (songIds.length > 0) {
      // Songs crediting both: keep one row at the earlier of the two positions.
      await tx.execute(sql`
        update ${songComposers} k
           set sort_order = least(k.sort_order, d.sort_order)
          from ${songComposers} d
         where k.composer_id = ${keep.id}
           and d.composer_id = ${drop.id}
           and d.song_id = k.song_id`);
      await tx.execute(sql`
        delete from ${songComposers} d
         using ${songComposers} k
         where d.composer_id = ${drop.id}
           and k.composer_id = ${keep.id}
           and k.song_id = d.song_id`);
      await tx
        .update(songComposers)
        .set({ composerId: keep.id })
        .where(eq(songComposers.composerId, drop.id));
    }

    if (keep.popMember === 'none' && drop.popMember !== 'none') {
      await tx
        .update(composers)
        .set({ popMember: drop.popMember })
        .where(eq(composers.id, keep.id));
      await recordAudit(tx, {
        actorId: user.id,
        entity: 'composer',
        entityId: keep.id,
        action: 'update',
        before: { popMember: keep.popMember },
        after: { popMember: drop.popMember },
      });
    }

    await tx.delete(composers).where(eq(composers.id, drop.id));
    await recordAudit(tx, {
      actorId: user.id,
      entity: 'composer',
      entityId: drop.id,
      action: 'delete',
      before: { name: drop.name, popMember: drop.popMember, mergedInto: keep.id },
    });

    for (const songId of songIds) {
      await recordAudit(tx, {
        actorId: user.id,
        entity: 'song_composers',
        entityId: songId,
        action: 'update',
        before: { composerIds: before.get(songId) ?? [] },
        after: { composerIds: await songComposerIds(tx, songId) },
      });
    }
  });
});
