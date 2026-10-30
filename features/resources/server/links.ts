'use server';

/**
 * External link resources (contracts/api.md; REQ-LIB-09, REQ-LIB-10).
 *
 * A link is a `resources` row with `format = 'url'`: a YouTube or other audio/video link,
 * an instruction link (keyed), or a projection link (key-independent). Uploaded files go
 * through LIB-06's upload flow instead; `updateLink` refuses to touch them.
 *
 * Both actions: requireUser → assertCan('resource:write') → Zod (`resourceLinkInputSchema`)
 * → write + audit in one transaction → `ActionResult<Resource>` via `withAction`.
 */

import 'server-only';

import type { Resource } from '@/types/domain';

import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';

import { resources, songKeys, songs } from '@/db/schema';
import { ActionError, withAction } from '@/lib/action';
import { recordAudit } from '@/lib/audit';
import { requireUser } from '@/lib/auth';
import { type Tx, withTx } from '@/lib/db';
import { assertCan } from '@/lib/permissions';
import { resourceLinkInputSchema, type ResourceLinkInput } from '@/types/validation';

type ResourceRow = typeof resources.$inferSelect;
/** What callers pass; `songKeyId` may be omitted for projection links. */
type LinkInput = z.input<typeof resourceLinkInputSchema>;

const SONG_NOT_FOUND = 'Song not found.';
const KEY_NOT_FOUND = 'That key does not belong to this song.';
const LINK_NOT_FOUND = 'Link not found.';

function toResource(row: ResourceRow): Resource {
  return {
    id: row.id,
    songId: row.songId,
    songKeyId: row.songKeyId,
    kind: row.kind,
    format: row.format,
    label: row.label,
    url: row.url,
    storagePath: row.storagePath,
    sizeBytes: row.sizeBytes,
    mimeType: row.mimeType,
    createdAt: row.createdAt.toISOString(),
  };
}

/** The song must exist (and not be soft-deleted); the key, if any, must be one of its keys. */
async function assertTarget(tx: Tx, input: ResourceLinkInput): Promise<void> {
  const [song] = await tx
    .select({ id: songs.id })
    .from(songs)
    .where(and(eq(songs.id, input.songId), isNull(songs.deletedAt)));
  if (!song) throw new ActionError('NOT_FOUND', SONG_NOT_FOUND);

  if (input.songKeyId === null) return;
  const [key] = await tx
    .select({ id: songKeys.id })
    .from(songKeys)
    .where(and(eq(songKeys.id, input.songKeyId), eq(songKeys.songId, input.songId)));
  if (!key) {
    throw new ActionError('VALIDATION', KEY_NOT_FOUND, { songKeyId: [KEY_NOT_FOUND] });
  }
}

/** Attach an external link to a song key (or to the song, for a projection link). */
export const addLink = withAction(async (input: LinkInput): Promise<Resource> => {
  const user = await requireUser();
  assertCan(user, 'resource:write');
  const data = resourceLinkInputSchema.parse(input);

  return withTx(async (tx) => {
    await assertTarget(tx, data);
    const [row] = await tx
      .insert(resources)
      .values({
        songId: data.songId,
        songKeyId: data.songKeyId,
        kind: data.kind,
        format: 'url',
        label: data.label,
        url: data.url,
        uploadedBy: user.id,
      })
      .returning();
    if (!row) throw new Error('Insert returned no row');

    await recordAudit(tx, {
      actorId: user.id,
      entity: 'resource',
      entityId: row.id,
      action: 'create',
      after: row,
    });
    return toResource(row);
  });
});

/**
 * Replace a link's key, kind, label and URL. `input.songId` must be the link's current song:
 * links don't move between songs. Only `format = 'url'` resources can be edited here.
 */
export const updateLink = withAction(async (id: string, input: LinkInput): Promise<Resource> => {
  const user = await requireUser();
  assertCan(user, 'resource:write');
  const resourceId = z.uuid().parse(id);
  const data = resourceLinkInputSchema.parse(input);

  return withTx(async (tx) => {
    const [before] = await tx
      .select()
      .from(resources)
      .where(and(eq(resources.id, resourceId), eq(resources.format, 'url')))
      .for('update');
    if (!before) throw new ActionError('NOT_FOUND', LINK_NOT_FOUND);
    if (before.songId !== data.songId) {
      const message = 'A link cannot be moved to another song.';
      throw new ActionError('VALIDATION', message, { songId: [message] });
    }
    await assertTarget(tx, data);

    const [row] = await tx
      .update(resources)
      .set({ songKeyId: data.songKeyId, kind: data.kind, label: data.label, url: data.url })
      .where(eq(resources.id, resourceId))
      .returning();
    if (!row) throw new ActionError('NOT_FOUND', LINK_NOT_FOUND);

    await recordAudit(tx, {
      actorId: user.id,
      entity: 'resource',
      entityId: row.id,
      action: 'update',
      before,
      after: row,
    });
    return toResource(row);
  });
});
