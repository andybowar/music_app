/**
 * Private `admin-attachments` bucket helpers (ADM-06; contracts/schema.md "Storage").
 *
 * Mirrors lib/storage.ts (which is bound to the `resources` bucket): every call goes through
 * the service-role client, so callers check `admin:backlog` first. Browsers only see
 * short-lived signed URLs.
 *
 * Also holds the pending-upload ticket: `createRequestImageUpload` stores nothing in the
 * database (the image row is saved by `finalizeRequestImage`), so the details the finalize
 * step needs travel in an HMAC-signed pending id instead.
 */
import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';

import { z } from 'zod';

import { env } from '@/lib/env';
import { createServiceSupabase } from '@/lib/supabase/admin';
import { SIGNED_URL_TTL_SECONDS } from '@/types/domain';

import { IMAGE_EXT, IMAGE_MIME_TYPES, type ImageMimeType } from './types';

export const ADMIN_ATTACHMENTS_BUCKET = 'admin-attachments';

function bucket() {
  return createServiceSupabase().storage.from(ADMIN_ATTACHMENTS_BUCKET);
}

/** `requests/{request_id}/{image_id}.{ext}` */
export function requestImagePath(requestId: string, imageId: string, mime: ImageMimeType): string {
  return `requests/${requestId}/${imageId}.${IMAGE_EXT[mime]}`;
}

/** The folder holding every object of one request. */
export function requestFolder(requestId: string): string {
  return `requests/${requestId}`;
}

export async function createUploadUrl(path: string): Promise<string> {
  const { data, error } = await bucket().createSignedUploadUrl(path);
  if (error) throw error;
  return data.signedUrl;
}

function isNotFound(error: { status?: number; statusCode?: string }): boolean {
  return (
    error.status === 404 ||
    error.statusCode === '404' ||
    (error.status === 400 && (error.statusCode === '404' || error.statusCode === 'not_found'))
  );
}

export async function objectInfo(path: string): Promise<{ size: number } | null> {
  const { data, error } = await bucket().info(path);
  if (error) {
    if (isNotFound(error as { status?: number; statusCode?: string })) return null;
    throw error;
  }
  return { size: data.size ?? 0 };
}

export async function signedReadUrls(
  paths: string[],
  ttl: number = SIGNED_URL_TTL_SECONDS,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (paths.length === 0) return out;
  const { data, error } = await bucket().createSignedUrls(paths, ttl);
  if (error) throw error;
  for (const item of data) if (item.path && item.signedUrl) out.set(item.path, item.signedUrl);
  return out;
}

export async function removeObjects(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const { error } = await bucket().remove(paths);
  if (error) throw error;
}

/** Every object under `requests/{request_id}/`, finalized or not. */
export async function listRequestObjects(requestId: string): Promise<string[]> {
  const folder = requestFolder(requestId);
  const { data, error } = await bucket().list(folder, { limit: 1000 });
  if (error) throw error;
  return data.filter((o) => o.id !== null).map((o) => `${folder}/${o.name}`);
}

/** The first bytes of the object, for the magic-number check. */
export async function readObjectHead(path: string, bytes = 16): Promise<Uint8Array> {
  const { data, error } = await bucket().createSignedUrl(path, 60);
  if (error) throw error;
  const response = await fetch(data.signedUrl, { headers: { Range: `bytes=0-${bytes - 1}` } });
  if (!response.ok) throw new Error(`Storage read failed (${response.status}) for ${path}`);
  return new Uint8Array(await response.arrayBuffer()).slice(0, bytes);
}

// ---------- Magic numbers ----------

const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));
const startsWith = (head: Uint8Array, sig: readonly number[], offset = 0) =>
  sig.every((byte, i) => head[offset + i] === byte);

/** Whether the leading bytes are a `mime` image (PNG, JPEG, WebP or GIF signature). */
export function sniffImage(head: Uint8Array, mime: ImageMimeType): boolean {
  switch (mime) {
    case 'image/png':
      return startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case 'image/jpeg':
      return startsWith(head, [0xff, 0xd8, 0xff]);
    case 'image/gif':
      return startsWith(head, ascii('GIF87a')) || startsWith(head, ascii('GIF89a'));
    case 'image/webp':
      return startsWith(head, ascii('RIFF')) && startsWith(head, ascii('WEBP'), 8);
  }
}

// ---------- Pending upload ticket ----------

/** How long a pending id stays valid: the signed upload URL's own lifetime (2 h). */
export const PENDING_TTL_MS = 2 * 60 * 60 * 1000;

const pendingSchema = z.object({
  i: z.uuid(), // image id
  r: z.uuid(), // request id
  n: z.string().min(1).max(255), // file name
  m: z.enum(IMAGE_MIME_TYPES),
  s: z.number().int().positive(),
  u: z.uuid(), // who asked
  e: z.number().int(), // expiry (ms since epoch)
});

export interface PendingImage {
  imageId: string;
  requestId: string;
  fileName: string;
  mimeType: ImageMimeType;
  sizeBytes: number;
  userId: string;
  expiresAt: number;
}

function sign(payload: string, key: string): string {
  return createHmac('sha256', `admin-backlog-upload:${key}`).update(payload).digest('base64url');
}

/** `{payload}.{signature}`, both base64url. `key` defaults to the service-role key. */
export function encodePendingId(p: PendingImage, key = env.SUPABASE_SERVICE_ROLE_KEY): string {
  const payload = Buffer.from(
    JSON.stringify({
      i: p.imageId,
      r: p.requestId,
      n: p.fileName,
      m: p.mimeType,
      s: p.sizeBytes,
      u: p.userId,
      e: p.expiresAt,
    }),
  ).toString('base64url');
  return `${payload}.${sign(payload, key)}`;
}

/** The pending upload, or null when the id is malformed, tampered with or expired. */
export function decodePendingId(
  id: string,
  now = Date.now(),
  key = env.SUPABASE_SERVICE_ROLE_KEY,
): PendingImage | null {
  const [payload, signature, extra] = id.split('.');
  if (!payload || !signature || extra !== undefined) return null;
  const expected = Buffer.from(sign(payload, key));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  const parsed = pendingSchema.safeParse(raw);
  if (!parsed.success || parsed.data.e < now) return null;
  const d = parsed.data;
  return {
    imageId: d.i,
    requestId: d.r,
    fileName: d.n,
    mimeType: d.m,
    sizeBytes: d.s,
    userId: d.u,
    expiresAt: d.e,
  };
}
