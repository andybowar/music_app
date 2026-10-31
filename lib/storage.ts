/**
 * Private file storage helpers (contracts/api.md "Core libs"; contracts/schema.md "Storage").
 *
 * Every call goes through the service-role client against the private `resources` bucket:
 * callers (LIB-06's actions) do the permission checks first. Browsers only ever see
 * short-lived signed URLs (REQ-LIB-11).
 *
 * `resourcePath`, `sniffFormat` and `canonicalMimeType` are pure; the rest talk to Storage
 * and are exercised by integration tests.
 */

import 'server-only';

import type { ResourceFormat } from '@/types/domain';

import { SIGNED_URL_TTL_SECONDS } from '@/types/domain';

import { createServiceSupabase } from '@/lib/supabase/admin';

export const RESOURCES_BUCKET = 'resources';

/** An uploaded file's format (everything except external links). */
export type FileFormat = Exclude<ResourceFormat, 'url'>;

function bucket() {
  return createServiceSupabase().storage.from(RESOURCES_BUCKET);
}

/** `songs/{song_id}/{song_key_id or 'common'}/{resource_id}.{ext}` */
export function resourcePath(
  songId: string,
  songKeyId: string | null,
  resourceId: string,
  ext: string,
): string {
  return `songs/${songId}/${songKeyId ?? 'common'}/${resourceId}.${ext}`;
}

/** A signed URL the browser can PUT the file body to (valid ~2h, single object). */
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

/** The object's size, or `null` when nothing has been uploaded at `path`. */
export async function objectExists(path: string): Promise<{ size: number } | null> {
  const { data, error } = await bucket().info(path);
  if (error) {
    if (isNotFound(error as { status?: number; statusCode?: string })) return null;
    throw error;
  }
  return { size: data.size ?? 0 };
}

/** A short-lived signed read URL (default TTL `SIGNED_URL_TTL_SECONDS`). */
export async function signedReadUrl(
  path: string,
  ttl: number = SIGNED_URL_TTL_SECONDS,
): Promise<string> {
  const { data, error } = await bucket().createSignedUrl(path, ttl);
  if (error) throw error;
  return data.signedUrl;
}

/** Delete the object. Removing a path that holds nothing is not an error. */
export async function removeObject(path: string): Promise<void> {
  const { error } = await bucket().remove([path]);
  if (error) throw error;
}

/** The first `bytes` bytes of the object (a ranged GET through a 60 s signed URL). */
export async function readObjectHead(path: string, bytes = 64): Promise<Uint8Array> {
  const url = await signedReadUrl(path, 60);
  const response = await fetch(url, { headers: { Range: `bytes=0-${bytes - 1}` } });
  if (!response.ok) throw new Error(`Storage read failed (${response.status}) for ${path}`);
  // A server that ignores Range sends the whole body; only the head is wanted.
  return new Uint8Array(await response.arrayBuffer()).slice(0, bytes);
}

/** The MIME type stored on a finalized resource, chosen by format rather than trusted from the client. */
export const FORMAT_MIME: Record<FileFormat, string> = {
  pdf: 'application/pdf',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  pro: 'application/octet-stream',
  mdb: 'application/x-msaccess',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

export function canonicalMimeType(format: FileFormat): string {
  return FORMAT_MIME[format];
}

function startsWith(head: Uint8Array, signature: readonly number[], offset = 0): boolean {
  return signature.every((byte, i) => head[offset + i] === byte);
}

const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

const PDF = ascii('%PDF-');
const ID3 = ascii('ID3');
const FTYP = ascii('ftyp');
const OLE_CFB = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const ZIP = [0x50, 0x4b, 0x03, 0x04];
const JET = ascii('Standard Jet DB');
const ACE = ascii('Standard ACE DB');

/**
 * Whether the file's leading bytes are consistent with `format` (magic-number sniff).
 * `.pro` (ProPresenter: XML in v6, protobuf in v7) has no reliable signature, so any
 * non-empty content is accepted.
 */
export function sniffFormat(head: Uint8Array, format: FileFormat): boolean {
  if (head.length === 0) return false;
  switch (format) {
    case 'pdf':
      return startsWith(head, PDF);
    case 'mp3':
      // ID3v2 tag, or a bare MPEG audio frame sync (11 set bits).
      return startsWith(head, ID3) || (head[0] === 0xff && ((head[1] ?? 0) & 0xe0) === 0xe0);
    case 'm4a':
      return startsWith(head, FTYP, 4);
    case 'ppt':
      return startsWith(head, OLE_CFB);
    case 'pptx':
      return startsWith(head, ZIP);
    case 'mdb':
      return startsWith(head, JET, 4) || startsWith(head, ACE, 4);
    case 'pro':
      return true;
  }
}
