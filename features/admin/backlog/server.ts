'use server';

/**
 * Admin backlog (ADM-06; contracts/api.md; REQ-ADM-01, REQ-ADM-02).
 *
 * To-dos: `listTodos`, `addTodo`, `updateTodo` (ticking sets `done_at` / `done_by`,
 * unticking clears them), `deleteTodo`.
 *
 * Requests: `listRequests` and `getRequest` are read helpers (they throw rather than return an
 * `ActionResult`, like the other read helpers); `createRequest`, `updateRequest` and
 * `deleteRequest` (which also removes every stored object of the request) are actions.
 *
 * Wireframe images use the signed-upload flow of features/resources:
 *   1. `createRequestImageUpload` checks type, size and the 5-per-request limit and returns a
 *      signed upload URL plus a *pending* image id (an HMAC-signed ticket, see ./storage).
 *      Nothing is written to the database yet.
 *   2. The browser PUTs the file to the URL.
 *   3. `finalizeRequestImage` checks the object exists, its size matches, its leading bytes
 *      are the declared image type and the limit still holds, then saves the row. A rejected
 *      object is removed.
 *   `deleteRequestImage` removes the object and the row.
 *
 * Everything needs `admin:backlog` (admins only), matching RLS in 0006_admin_backlog.sql.
 */

import 'server-only';

import { asc, count, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';

import { adminTodos, featureRequestImages, featureRequests, users } from '@/db/schema';
import { ActionError, withAction } from '@/lib/action';
import { requireUser } from '@/lib/auth';
import { db, withTx, type DB, type Tx } from '@/lib/db';
import { assertCan } from '@/lib/permissions';
import type { UUID } from '@/types/domain';

import {
  createUploadUrl,
  decodePendingId,
  encodePendingId,
  listRequestObjects,
  objectInfo,
  PENDING_TTL_MS,
  readObjectHead,
  removeObjects,
  requestImagePath,
  signedReadUrls,
  sniffImage,
} from './storage';
import {
  imageUploadSchema,
  listRequestsSchema,
  MAX_IMAGES_PER_REQUEST,
  requestInputSchema,
  requestPatchSchema,
  todoInputSchema,
  todoPatchSchema,
  type AdminTodo,
  type FeatureRequest,
  type FeatureRequestDetail,
  type FeatureRequestImage,
  type FeatureRequestStatus,
  type ImageMimeType,
  type ImageUploadInput,
  type ImageUploadTicket,
  type RequestInput,
  type RequestPatch,
  type TodoInput,
  type TodoPatch,
} from './types';

const uuid = z.uuid();

const TODO_NOT_FOUND = 'That to-do no longer exists.';
const REQUEST_NOT_FOUND = 'That request no longer exists.';
const IMAGE_NOT_FOUND = 'That image no longer exists.';
const UPLOAD_NOT_FOUND = 'That upload has expired. Please try again.';
const LIMIT_REACHED = `A request can have at most ${MAX_IMAGES_PER_REQUEST} images.`;

async function requireBacklogUser() {
  const user = await requireUser();
  assertCan(user, 'admin:backlog');
  return user;
}

// ---------- To-dos ----------

type TodoRow = typeof adminTodos.$inferSelect;

function toTodo(row: TodoRow): AdminTodo {
  return {
    id: row.id,
    title: row.title,
    notes: row.notes,
    doneAt: row.doneAt?.toISOString() ?? null,
    doneBy: row.doneBy,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Every to-do, oldest first (the UI splits open and done). */
export const listTodos = withAction(async (): Promise<AdminTodo[]> => {
  await requireBacklogUser();
  const rows = await db
    .select()
    .from(adminTodos)
    .orderBy(asc(adminTodos.createdAt), asc(adminTodos.id));
  return rows.map(toTodo);
});

export const addTodo = withAction(async (input: TodoInput): Promise<AdminTodo> => {
  const user = await requireBacklogUser();
  const data = todoInputSchema.parse(input);
  const [row] = await db
    .insert(adminTodos)
    .values({ title: data.title, notes: data.notes ?? null, createdBy: user.id })
    .returning();
  return toTodo(row!);
});

export const updateTodo = withAction(async (id: UUID, patch: TodoPatch): Promise<AdminTodo> => {
  const user = await requireBacklogUser();
  const todoId = uuid.parse(id);
  const data = todoPatchSchema.parse(patch);

  return withTx(async (tx) => {
    const [current] = await tx
      .select()
      .from(adminTodos)
      .where(eq(adminTodos.id, todoId))
      .for('update');
    if (!current) throw new ActionError('NOT_FOUND', TODO_NOT_FOUND);

    const set: Partial<typeof adminTodos.$inferInsert> = {};
    if (data.title !== undefined) set.title = data.title;
    if (data.notes !== undefined) set.notes = data.notes;
    if (data.done === true && current.doneAt === null) {
      set.doneAt = new Date();
      set.doneBy = user.id;
    } else if (data.done === false) {
      set.doneAt = null;
      set.doneBy = null;
    }
    if (Object.keys(set).length === 0) return toTodo(current);

    const [row] = await tx.update(adminTodos).set(set).where(eq(adminTodos.id, todoId)).returning();
    return toTodo(row!);
  });
});

export const deleteTodo = withAction(async (id: UUID): Promise<void> => {
  await requireBacklogUser();
  const todoId = uuid.parse(id);
  const deleted = await db
    .delete(adminTodos)
    .where(eq(adminTodos.id, todoId))
    .returning({ id: adminTodos.id });
  if (deleted.length === 0) throw new ActionError('NOT_FOUND', TODO_NOT_FOUND);
});

// ---------- Requests ----------

const imageCount = sql<number>`(
  select count(*)::int from ${featureRequestImages}
  where ${featureRequestImages.requestId} = ${featureRequests.id}
)`;

const requestColumns = {
  id: featureRequests.id,
  kind: featureRequests.kind,
  title: featureRequests.title,
  description: featureRequests.description,
  status: featureRequests.status,
  createdBy: featureRequests.createdBy,
  createdByName: users.name,
  createdAt: featureRequests.createdAt,
  updatedAt: featureRequests.updatedAt,
  imageCount: imageCount.mapWith(Number),
};

type RequestRow = {
  [K in keyof typeof requestColumns]: K extends 'createdByName'
    ? string | null
    : K extends 'imageCount'
      ? number
      : (typeof featureRequests.$inferSelect)[Exclude<K, 'createdByName' | 'imageCount'>];
};

function toRequest(row: RequestRow): FeatureRequest {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function selectRequests(
  conn: DB | Tx,
  where?: ReturnType<typeof eq>,
): Promise<FeatureRequest[]> {
  const rows = await conn
    .select(requestColumns)
    .from(featureRequests)
    .leftJoin(users, eq(users.id, featureRequests.createdBy))
    .where(where)
    .orderBy(desc(featureRequests.createdAt), desc(featureRequests.id));
  return rows.map(toRequest);
}

async function requestById(conn: DB | Tx, id: string): Promise<FeatureRequest> {
  const [request] = await selectRequests(conn, eq(featureRequests.id, id));
  if (!request) throw new ActionError('NOT_FOUND', REQUEST_NOT_FOUND);
  return request;
}

/** Read helper: requests newest first, optionally one status only. Throws on failure. */
export async function listRequests(filter?: {
  status?: FeatureRequestStatus;
}): Promise<FeatureRequest[]> {
  await requireBacklogUser();
  const data = listRequestsSchema.parse(filter);
  return selectRequests(db, data?.status ? eq(featureRequests.status, data.status) : undefined);
}

/** Read helper: one request with its images and short-lived signed URLs, or null. */
export async function getRequest(id: UUID): Promise<FeatureRequestDetail | null> {
  await requireBacklogUser();
  const parsed = uuid.safeParse(id);
  if (!parsed.success) return null;

  const [request] = await selectRequests(db, eq(featureRequests.id, parsed.data));
  if (!request) return null;

  const rows = await db
    .select()
    .from(featureRequestImages)
    .where(eq(featureRequestImages.requestId, request.id))
    .orderBy(asc(featureRequestImages.createdAt), asc(featureRequestImages.id));
  const urls = await signedReadUrls(rows.map((r) => r.storagePath));

  const images: FeatureRequestImage[] = rows.map((r) => ({
    id: r.id,
    requestId: r.requestId,
    fileName: r.fileName,
    mimeType: r.mimeType as ImageMimeType,
    sizeBytes: r.sizeBytes,
    createdAt: r.createdAt.toISOString(),
    url: urls.get(r.storagePath) ?? '',
  }));
  return { ...request, imageCount: images.length, images };
}

export const createRequest = withAction(async (input: RequestInput): Promise<FeatureRequest> => {
  const user = await requireBacklogUser();
  const data = requestInputSchema.parse(input);
  const [row] = await db
    .insert(featureRequests)
    .values({ ...data, createdBy: user.id })
    .returning({ id: featureRequests.id });
  return requestById(db, row!.id);
});

export const updateRequest = withAction(
  async (id: UUID, patch: RequestPatch): Promise<FeatureRequest> => {
    await requireBacklogUser();
    const requestId = uuid.parse(id);
    const data = requestPatchSchema.parse(patch);

    return withTx(async (tx) => {
      if (Object.keys(data).length > 0) {
        const updated = await tx
          .update(featureRequests)
          .set(data)
          .where(eq(featureRequests.id, requestId))
          .returning({ id: featureRequests.id });
        if (updated.length === 0) throw new ActionError('NOT_FOUND', REQUEST_NOT_FOUND);
      }
      return requestById(tx, requestId);
    });
  },
);

/** Delete a request: its stored objects (finalized or not) first, then the row (images cascade). */
export const deleteRequest = withAction(async (id: UUID): Promise<void> => {
  await requireBacklogUser();
  const requestId = uuid.parse(id);

  await withTx(async (tx) => {
    const [row] = await tx
      .select({ id: featureRequests.id })
      .from(featureRequests)
      .where(eq(featureRequests.id, requestId))
      .for('update');
    if (!row) throw new ActionError('NOT_FOUND', REQUEST_NOT_FOUND);

    const images = await tx
      .select({ path: featureRequestImages.storagePath })
      .from(featureRequestImages)
      .where(eq(featureRequestImages.requestId, requestId));
    const stray = await listRequestObjects(requestId);
    await removeObjects([...new Set([...images.map((i) => i.path), ...stray])]);
    await tx.delete(featureRequests).where(eq(featureRequests.id, requestId));
  });
});

// ---------- Images ----------

async function imagesOf(conn: DB | Tx, requestId: string): Promise<number> {
  const [row] = await conn
    .select({ n: count() })
    .from(featureRequestImages)
    .where(eq(featureRequestImages.requestId, requestId));
  return row?.n ?? 0;
}

/** Start a wireframe upload: returns where to PUT the file and the pending id to finalize. */
export const createRequestImageUpload = withAction(
  async (requestId: UUID, input: ImageUploadInput): Promise<ImageUploadTicket> => {
    const user = await requireBacklogUser();
    const id = uuid.parse(requestId);
    const data = imageUploadSchema.parse(input);

    const [request] = await db
      .select({ id: featureRequests.id })
      .from(featureRequests)
      .where(eq(featureRequests.id, id));
    if (!request) throw new ActionError('NOT_FOUND', REQUEST_NOT_FOUND);
    if ((await imagesOf(db, id)) >= MAX_IMAGES_PER_REQUEST) {
      throw new ActionError('VALIDATION', LIMIT_REACHED, { images: [LIMIT_REACHED] });
    }

    const imageId = crypto.randomUUID();
    const uploadUrl = await createUploadUrl(requestImagePath(id, imageId, data.mimeType));
    const pendingId = encodePendingId({
      imageId,
      requestId: id,
      fileName: data.fileName,
      mimeType: data.mimeType,
      sizeBytes: data.sizeBytes,
      userId: user.id,
      expiresAt: Date.now() + PENDING_TTL_MS,
    });
    return { imageId: pendingId, uploadUrl };
  },
);

/** Verify the uploaded object and save its row. Idempotent for an already-saved image. */
export const finalizeRequestImage = withAction(
  async (pendingId: string): Promise<FeatureRequestImage> => {
    const user = await requireBacklogUser();
    const pending = decodePendingId(z.string().max(2048).parse(pendingId));
    if (!pending || pending.userId !== user.id)
      throw new ActionError('NOT_FOUND', UPLOAD_NOT_FOUND);
    const path = requestImagePath(pending.requestId, pending.imageId, pending.mimeType);

    const outcome = await withTx(
      async (tx): Promise<FeatureRequestImage | { rejected: string }> => {
        const [request] = await tx
          .select({ id: featureRequests.id })
          .from(featureRequests)
          .where(eq(featureRequests.id, pending.requestId))
          .for('update'); // serializes finalizes of one request, so the limit holds
        if (!request) throw new ActionError('NOT_FOUND', REQUEST_NOT_FOUND);

        const [existing] = await tx
          .select()
          .from(featureRequestImages)
          .where(eq(featureRequestImages.id, pending.imageId));
        if (existing) return toImage(existing, '');

        const object = await objectInfo(path);
        if (!object) throw new ActionError('VALIDATION', 'The image has not finished uploading.');

        let reason: string | null = null;
        if (object.size !== pending.sizeBytes) {
          reason = 'The uploaded image does not match the selected file. Please try again.';
        } else if (!sniffImage(await readObjectHead(path), pending.mimeType)) {
          reason = 'That file is not a valid PNG, JPEG, WebP or GIF image.';
        } else if ((await imagesOf(tx, pending.requestId)) >= MAX_IMAGES_PER_REQUEST) {
          reason = LIMIT_REACHED;
        }
        if (reason) {
          await removeObjects([path]);
          return { rejected: reason };
        }

        const [row] = await tx
          .insert(featureRequestImages)
          .values({
            id: pending.imageId,
            requestId: pending.requestId,
            storagePath: path,
            fileName: pending.fileName,
            mimeType: pending.mimeType,
            sizeBytes: object.size,
            createdBy: user.id,
          })
          .returning();
        return toImage(row!, '');
      },
    );

    if ('rejected' in outcome) {
      throw new ActionError('VALIDATION', outcome.rejected, { file: [outcome.rejected] });
    }
    const urls = await signedReadUrls([path]);
    return { ...outcome, url: urls.get(path) ?? '' };
  },
);

function toImage(row: typeof featureRequestImages.$inferSelect, url: string): FeatureRequestImage {
  return {
    id: row.id,
    requestId: row.requestId,
    fileName: row.fileName,
    mimeType: row.mimeType as ImageMimeType,
    sizeBytes: row.sizeBytes,
    createdAt: row.createdAt.toISOString(),
    url,
  };
}

/** Remove a saved wireframe: the stored object, then the row. */
export const deleteRequestImage = withAction(async (imageId: UUID): Promise<void> => {
  await requireBacklogUser();
  const id = uuid.parse(imageId);
  await withTx(async (tx) => {
    const [row] = await tx
      .select()
      .from(featureRequestImages)
      .where(eq(featureRequestImages.id, id))
      .for('update');
    if (!row) throw new ActionError('NOT_FOUND', IMAGE_NOT_FOUND);
    await removeObjects([row.storagePath]);
    await tx.delete(featureRequestImages).where(eq(featureRequestImages.id, id));
  });
});
