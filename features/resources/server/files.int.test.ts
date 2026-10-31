// @vitest-environment node
// Integration: needs local Supabase (`pnpm db:start`) with Storage. CI sets the env vars;
// locally they come from .env.local, which Vitest doesn't load on its own.
import type { AppUser } from '@/types/domain';
import type { UploadRequest } from '@/types/validation';

import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const actorId = randomUUID();
const actor: AppUser = {
  id: actorId,
  email: `${actorId}@example.test`,
  name: 'LIB-06 test',
  branchId: null,
  role: 'contributor',
  authProvider: 'password',
  disabledAt: null,
  accessStatus: 'approved',
};
vi.mock('@/lib/auth', () => ({ requireUser: async () => actor }));

if (!process.env.DATABASE_URL && existsSync('.env.local')) process.loadEnvFile('.env.local');

const { and, eq, inArray, sql } = await import('drizzle-orm');
const { auditLog, resources, songKeys, songs, users } = await import('@/db/schema');
const { getDb } = await import('@/lib/db');
const { objectExists, removeObject } = await import('@/lib/storage');
const { deleteResource, finalizeUpload, getSignedResourceUrl, requestUpload } =
  await import('./files');

const songIds: string[] = [];
const paths: string[] = [];
let songId: string;
let keyD: string;
let otherSongKey: string;

// Synthetic file bodies: just enough of each format's signature to pass the sniff.
const PDF_BYTES = new TextEncoder().encode('%PDF-1.7\n% LIB-06 integration test\n%%EOF\n');
const MP3_BYTES = new Uint8Array([0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0, 0, 0, 0, 0xff, 0xfb]);

async function makeSong(title: string) {
  const [song] = await getDb().insert(songs).values({ title }).returning({ id: songs.id });
  songIds.push(song!.id);
  return song!.id;
}

async function makeKey(sid: string, key: string, isPrimary = false) {
  const [row] = await getDb()
    .insert(songKeys)
    .values({ songId: sid, key, isPrimary })
    .returning({ id: songKeys.id });
  return row!.id;
}

function pdfRequest(overrides: Partial<UploadRequest> = {}): UploadRequest {
  return {
    songId,
    songKeyId: keyD,
    kind: 'chord_chart',
    format: 'pdf',
    label: 'Chord chart',
    sizeBytes: PDF_BYTES.byteLength,
    mimeType: 'application/pdf',
    ...overrides,
  };
}

/** requestUpload, asserting success, and remember the path for cleanup. */
async function request(req: UploadRequest) {
  const result = await requestUpload(req);
  if (!result.ok) throw new Error(`requestUpload failed: ${JSON.stringify(result.error)}`);
  paths.push(result.data.path);
  return result.data;
}

async function put(uploadUrl: string, body: Uint8Array<ArrayBuffer>, contentType: string) {
  const response = await fetch(uploadUrl, {
    method: 'PUT',
    body,
    headers: { 'content-type': contentType },
  });
  expect(response.ok, `PUT failed: ${response.status} ${await response.clone().text()}`).toBe(true);
}

async function auditFor(entityId: string) {
  return getDb()
    .select()
    .from(auditLog)
    .where(and(eq(auditLog.entity, 'resource'), eq(auditLog.entityId, entityId)));
}

async function rowFor(id: string) {
  const [row] = await getDb().select().from(resources).where(eq(resources.id, id));
  return row;
}

beforeAll(async () => {
  await getDb().execute(
    sql`insert into auth.users (id, email) values (${actorId}, ${actor.email})`,
  );
  await getDb()
    .insert(users)
    .values({ id: actorId, email: actor.email, name: actor.name, authProvider: 'password' });

  songId = await makeSong(`LIB-06 song ${actorId}`);
  keyD = await makeKey(songId, 'D', true);
  const other = await makeSong(`LIB-06 other ${actorId}`);
  otherSongKey = await makeKey(other, 'G', true);
});

afterAll(async () => {
  for (const path of paths) await removeObject(path);
  await getDb().delete(auditLog).where(eq(auditLog.actorId, actorId));
  await getDb().delete(songs).where(inArray(songs.id, songIds)); // cascades keys + resources
  await getDb().execute(sql`delete from auth.users where id = ${actorId}`);
  await getDb().$client.end();
});

describe('upload flow', () => {
  test('request → PUT → finalize → signed URL fetch returns the bytes', async () => {
    const ticket = await request(pdfRequest());
    expect(ticket.path).toBe(`songs/${songId}/${keyD}/${ticket.resourceId}.pdf`);

    const pending = await rowFor(ticket.resourceId);
    expect(pending).toMatchObject({
      storagePath: ticket.path,
      mimeType: null,
      uploadedBy: actorId,
    });
    expect(await auditFor(ticket.resourceId)).toHaveLength(0);

    // Unfinished uploads can't be read.
    const early = await getSignedResourceUrl(ticket.resourceId);
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.error.code).toBe('NOT_FOUND');

    await put(ticket.uploadUrl, PDF_BYTES, 'application/pdf');

    const done = await finalizeUpload(ticket.resourceId);
    expect(done.ok).toBe(true);
    if (!done.ok) return;
    expect(done.data).toMatchObject({
      id: ticket.resourceId,
      songId,
      songKeyId: keyD,
      kind: 'chord_chart',
      format: 'pdf',
      label: 'Chord chart',
      url: null,
      storagePath: ticket.path,
      sizeBytes: PDF_BYTES.byteLength,
      mimeType: 'application/pdf',
    });

    const audit = await auditFor(ticket.resourceId);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ action: 'create', actorId });

    // Finalizing again is a no-op that returns the same resource.
    const again = await finalizeUpload(ticket.resourceId);
    expect(again).toEqual(done);
    expect(await auditFor(ticket.resourceId)).toHaveLength(1);

    const signed = await getSignedResourceUrl(ticket.resourceId);
    expect(signed.ok).toBe(true);
    if (!signed.ok) return;
    const ttl = Date.parse(signed.data.expiresAt) - Date.now();
    expect(ttl).toBeGreaterThan(3500_000);
    expect(ttl).toBeLessThanOrEqual(3600_000);

    const response = await fetch(signed.data.url);
    expect(response.ok).toBe(true);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(PDF_BYTES);
  });

  test('stores a key-independent projection file under common/', async () => {
    const pptx = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);
    const ticket = await request(
      pdfRequest({
        songKeyId: null,
        kind: 'projection',
        format: 'pptx',
        label: 'Slides',
        sizeBytes: pptx.byteLength,
      }),
    );
    expect(ticket.path).toBe(`songs/${songId}/common/${ticket.resourceId}.pptx`);
    await put(ticket.uploadUrl, pptx, 'application/octet-stream');
    const done = await finalizeUpload(ticket.resourceId);
    expect(done.ok).toBe(true);
    if (done.ok) expect(done.data).toMatchObject({ songKeyId: null, kind: 'projection' });
  });

  test('accepts an MP3 on a key', async () => {
    const ticket = await request(
      pdfRequest({ kind: 'audio', format: 'mp3', label: 'Demo', sizeBytes: MP3_BYTES.byteLength }),
    );
    await put(ticket.uploadUrl, MP3_BYTES, 'audio/mpeg');
    const done = await finalizeUpload(ticket.resourceId);
    expect(done.ok).toBe(true);
    if (done.ok) expect(done.data.mimeType).toBe('audio/mpeg');
  });
});

describe('validation', () => {
  test('a projection with songKeyId → VALIDATION', async () => {
    const result = await requestUpload(pdfRequest({ kind: 'projection', format: 'pptx' }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('VALIDATION');
  });

  test('a PDF as audio → VALIDATION', async () => {
    const result = await requestUpload(pdfRequest({ kind: 'audio' }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('VALIDATION');
      expect(result.error.fieldErrors).toHaveProperty('format');
    }
  });

  test('PDF bytes uploaded as an MP3 fail the sniff; object and row are removed', async () => {
    const ticket = await request(pdfRequest({ kind: 'audio', format: 'mp3', label: 'Not audio' }));
    await put(ticket.uploadUrl, PDF_BYTES, 'audio/mpeg');
    const result = await finalizeUpload(ticket.resourceId);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('VALIDATION');
    expect(await rowFor(ticket.resourceId)).toBeUndefined();
    expect(await objectExists(ticket.path)).toBeNull();
  });

  test('a size that differs from the request is rejected', async () => {
    const ticket = await request(pdfRequest({ sizeBytes: PDF_BYTES.byteLength + 10 }));
    await put(ticket.uploadUrl, PDF_BYTES, 'application/pdf');
    const result = await finalizeUpload(ticket.resourceId);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('VALIDATION');
    expect(await rowFor(ticket.resourceId)).toBeUndefined();
  });

  test('finalizing before the PUT is VALIDATION and keeps the pending row', async () => {
    const ticket = await request(pdfRequest());
    const result = await finalizeUpload(ticket.resourceId);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('VALIDATION');
    expect(await rowFor(ticket.resourceId)).toBeDefined();
  });

  test("another song's key → VALIDATION; unknown song → NOT_FOUND", async () => {
    const wrongKey = await requestUpload(pdfRequest({ songKeyId: otherSongKey }));
    expect(wrongKey.ok).toBe(false);
    if (!wrongKey.ok) expect(wrongKey.error.code).toBe('VALIDATION');

    const noSong = await requestUpload(pdfRequest({ songId: randomUUID() }));
    expect(noSong.ok).toBe(false);
    if (!noSong.ok) expect(noSong.error.code).toBe('NOT_FOUND');
  });

  test('unknown ids → NOT_FOUND', async () => {
    for (const action of [finalizeUpload, deleteResource, getSignedResourceUrl]) {
      const result = await action(randomUUID());
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('NOT_FOUND');
    }
  });
});

describe('deleteResource', () => {
  test('removes the object, then the row, and audits the delete', async () => {
    const ticket = await request(pdfRequest({ label: 'To delete' }));
    await put(ticket.uploadUrl, PDF_BYTES, 'application/pdf');
    expect((await finalizeUpload(ticket.resourceId)).ok).toBe(true);
    expect(await objectExists(ticket.path)).toEqual({ size: PDF_BYTES.byteLength });

    const result = await deleteResource(ticket.resourceId);
    expect(result).toEqual({ ok: true, data: undefined });
    expect(await objectExists(ticket.path)).toBeNull();
    expect(await rowFor(ticket.resourceId)).toBeUndefined();

    const audit = await auditFor(ticket.resourceId);
    expect(audit.map((a) => a.action).sort()).toEqual(['create', 'delete']);
  });

  test('deletes a link row too', async () => {
    const [link] = await getDb()
      .insert(resources)
      .values({
        songId,
        songKeyId: keyD,
        kind: 'video_link',
        format: 'url',
        label: 'Video',
        url: 'https://example.com/v',
      })
      .returning();
    const result = await deleteResource(link!.id);
    expect(result.ok).toBe(true);
    expect(await rowFor(link!.id)).toBeUndefined();
  });
});
