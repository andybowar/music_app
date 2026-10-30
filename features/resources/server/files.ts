'use server';

/**
 * Uploaded file resources (contracts/api.md; REQ-LIB-09, REQ-LIB-10, REQ-LIB-11).
 *
 * Upload flow (contracts/schema.md "Storage"):
 *   1. `requestUpload` validates the request, inserts a *pending* `resources` row
 *      (`storage_path` set, `mime_type` null) and returns a signed upload URL.
 *   2. The browser PUTs the file to that URL.
 *   3. `finalizeUpload` checks the object exists, its size matches the request and is within
 *      `MAX_UPLOAD_BYTES`, and its leading bytes match the format; then stamps `mime_type`
 *      and audits the create. A rejected upload's object and row are removed.
 *
 * A row with `storage_path` set and `mime_type` null is an unfinished upload: it has no
 * audit entry and `getSignedResourceUrl` refuses it.
 *
 * `deleteResource` removes any stored object, then the row (links included).
 */

import 'server-only';

import type { Resource } from '@/types/domain';

import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import { z } from 'zod';

import { resources, songKeys, songs } from '@/db/schema';
import { ActionError, withAction } from '@/lib/action';
import { recordAudit } from '@/lib/audit';
import { requireUser } from '@/lib/auth';
import { db, type Tx, withTx } from '@/lib/db';
import { assertCan } from '@/lib/permissions';
import {
  canonicalMimeType,
  createUploadUrl,
  type FileFormat,
  objectExists,
  readObjectHead,
  removeObject,
  resourcePath,
  signedReadUrl,
  sniffFormat,
} from '@/lib/storage';
import { MAX_UPLOAD_BYTES, SIGNED_URL_TTL_SECONDS } from '@/types/domain';
import { uploadRequestSchema, type UploadRequest } from '@/types/validation';

type ResourceRow = typeof resources.$inferSelect;

const SONG_NOT_FOUND = 'Song not found.';
const KEY_NOT_FOUND = 'That key does not belong to this song.';
const UPLOAD_NOT_FOUND = 'Upload not found.';
const FILE_NOT_FOUND = 'File not found.';
const RESOURCE_NOT_FOUND = 'Resource not found.';

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
async function assertTarget(tx: Tx, input: UploadRequest): Promise<void> {
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
  if (!key) throw new ActionError('VALIDATION', KEY_NOT_FOUND, { songKeyId: [KEY_NOT_FOUND] });
}

/** Start an upload: creates the pending row and returns where to PUT the file. */
export const requestUpload = withAction(
  async (req: UploadRequest): Promise<{ resourceId: string; uploadUrl: string; path: string }> => {
    const user = await requireUser();
    assertCan(user, 'resource:write');
    const data = uploadRequestSchema.parse(req);

    return withTx(async (tx) => {
      await assertTarget(tx, data);
      const resourceId = crypto.randomUUID();
      const path = resourcePath(data.songId, data.songKeyId, resourceId, data.format);
      await tx.insert(resources).values({
        id: resourceId,
        songId: data.songId,
        songKeyId: data.songKeyId,
        kind: data.kind,
        format: data.format,
        label: data.label,
        storagePath: path,
        sizeBytes: data.sizeBytes,
        uploadedBy: user.id,
      });
      // Inside the transaction: if Storage refuses, the pending row is rolled back.
      const uploadUrl = await createUploadUrl(path);
      return { resourceId, uploadUrl, path };
    });
  },
);

/** Why an uploaded object was rejected, or null when it is acceptable. */
async function rejectReason(row: ResourceRow, path: string, size: number): Promise<string | null> {
  if (size > MAX_UPLOAD_BYTES) return 'The file is larger than the 50 MB limit.';
  if (row.sizeBytes !== null && size !== row.sizeBytes) {
    return 'The uploaded file does not match the requested size. Please try again.';
  }
  const head = await readObjectHead(path);
  if (!sniffFormat(head, row.format as FileFormat)) {
    return `The file's contents are not a valid ${row.format.toUpperCase()} file.`;
  }
  return null;
}

/** Verify the uploaded object and turn the pending row into a real resource. Idempotent. */
export const finalizeUpload = withAction(async (resourceId: string): Promise<Resource> => {
  const user = await requireUser();
  assertCan(user, 'resource:write');
  const id = z.uuid().parse(resourceId);

  const outcome = await withTx(async (tx): Promise<Resource | { rejected: string }> => {
    const [row] = await tx
      .select()
      .from(resources)
      .where(and(eq(resources.id, id), isNotNull(resources.storagePath)))
      .for('update');
    if (!row?.storagePath) throw new ActionError('NOT_FOUND', UPLOAD_NOT_FOUND);
    if (row.mimeType !== null) return toResource(row); // already finalized

    const object = await objectExists(row.storagePath);
    if (!object) {
      throw new ActionError('VALIDATION', 'The file has not finished uploading.');
    }

    const reason = await rejectReason(row, row.storagePath, object.size);
    if (reason) {
      await removeObject(row.storagePath);
      await tx.delete(resources).where(eq(resources.id, id));
      return { rejected: reason };
    }

    const [updated] = await tx
      .update(resources)
      .set({ sizeBytes: object.size, mimeType: canonicalMimeType(row.format as FileFormat) })
      .where(eq(resources.id, id))
      .returning();
    if (!updated) throw new ActionError('NOT_FOUND', UPLOAD_NOT_FOUND);

    await recordAudit(tx, {
      actorId: user.id,
      entity: 'resource',
      entityId: updated.id,
      action: 'create',
      after: updated,
    });
    return toResource(updated);
  });

  // Thrown after the transaction so the cleanup above commits.
  if ('rejected' in outcome) {
    throw new ActionError('VALIDATION', outcome.rejected, { file: [outcome.rejected] });
  }
  return outcome;
});

/** Delete a resource (file or link): the stored object first, then the row. */
export const deleteResource = withAction(async (resourceId: string): Promise<void> => {
  const user = await requireUser();
  assertCan(user, 'resource:write');
  const id = z.uuid().parse(resourceId);

  await withTx(async (tx) => {
    const [row] = await tx.select().from(resources).where(eq(resources.id, id)).for('update');
    if (!row) throw new ActionError('NOT_FOUND', RESOURCE_NOT_FOUND);

    if (row.storagePath) await removeObject(row.storagePath);
    await tx.delete(resources).where(eq(resources.id, id));

    // Unfinished uploads were never audited as created, so their removal isn't either.
    if (row.storagePath && row.mimeType === null) return;
    await recordAudit(tx, {
      actorId: user.id,
      entity: 'resource',
      entityId: row.id,
      action: 'delete',
      before: row,
    });
  });
});

/** A short-lived signed URL for a finalized file on a live song. */
export const getSignedResourceUrl = withAction(
  async (resourceId: string): Promise<{ url: string; expiresAt: string }> => {
    const user = await requireUser();
    assertCan(user, 'resource:read');
    const id = z.uuid().parse(resourceId);

    const [row] = await db
      .select({ storagePath: resources.storagePath })
      .from(resources)
      .innerJoin(songs, eq(songs.id, resources.songId))
      .where(
        and(
          eq(resources.id, id),
          isNotNull(resources.storagePath),
          isNotNull(resources.mimeType),
          isNull(songs.deletedAt),
        ),
      );
    if (!row?.storagePath) throw new ActionError('NOT_FOUND', FILE_NOT_FOUND);

    const expiresAt = new Date(Date.now() + SIGNED_URL_TTL_SECONDS * 1000).toISOString();
    const url = await signedReadUrl(row.storagePath, SIGNED_URL_TTL_SECONDS);
    return { url, expiresAt };
  },
);
