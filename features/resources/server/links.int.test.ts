// @vitest-environment node
// Integration: needs local Supabase (`pnpm db:start`). CI sets the env vars; locally
// they come from .env.local, which Vitest doesn't load on its own.
import type { AppUser } from '@/types/domain';

import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const actorId = randomUUID();
const actor: AppUser = {
  id: actorId,
  email: `${actorId}@example.test`,
  name: 'LIB-07 test',
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
const { addLink, updateLink } = await import('./links');

const songIds: string[] = [];
let songId: string;
let keyD: string;
let keyE: string;
let otherSongKey: string;

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

beforeAll(async () => {
  await getDb().execute(
    sql`insert into auth.users (id, email) values (${actorId}, ${actor.email})`,
  );
  await getDb()
    .insert(users)
    .values({ id: actorId, email: actor.email, name: actor.name, authProvider: 'password' });

  songId = await makeSong(`LIB-07 song ${actorId}`);
  keyD = await makeKey(songId, 'D', true);
  keyE = await makeKey(songId, 'E');
  const other = await makeSong(`LIB-07 other ${actorId}`);
  otherSongKey = await makeKey(other, 'G', true);
});

afterAll(async () => {
  await getDb().delete(auditLog).where(eq(auditLog.actorId, actorId));
  await getDb().delete(songs).where(inArray(songs.id, songIds)); // cascades keys + resources
  await getDb().execute(sql`delete from auth.users where id = ${actorId}`);
  await getDb().$client.end();
});

const yt = 'https://www.youtube.com/watch?v=fakeVid0_-1';

async function auditFor(entityId: string) {
  return getDb()
    .select()
    .from(auditLog)
    .where(and(eq(auditLog.entity, 'resource'), eq(auditLog.entityId, entityId)));
}

describe('addLink', () => {
  test('inserts a url resource on the key and audits the create', async () => {
    const result = await addLink({
      songId,
      songKeyId: keyD,
      kind: 'video_link',
      label: 'YouTube',
      url: yt,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toMatchObject({
      songId,
      songKeyId: keyD,
      kind: 'video_link',
      format: 'url',
      label: 'YouTube',
      url: yt,
      storagePath: null,
    });

    const [row] = await getDb().select().from(resources).where(eq(resources.id, result.data.id));
    expect(row?.uploadedBy).toBe(actorId);

    const audit = await auditFor(result.data.id);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ action: 'create', actorId });
    expect(audit[0]?.diff).toMatchObject({ url: { from: null, to: yt } });
  });

  test('adds a key-independent projection link', async () => {
    const result = await addLink({
      songId,
      kind: 'projection',
      label: 'Slides',
      url: 'https://example.com/deck',
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.songKeyId).toBeNull();
  });

  test('rejects a key from another song', async () => {
    const result = await addLink({
      songId,
      songKeyId: otherSongKey,
      kind: 'instruction_link',
      label: 'Guide',
      url: 'https://example.com/guide',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('VALIDATION');
  });

  test('returns NOT_FOUND for a missing song', async () => {
    const result = await addLink({
      songId: randomUUID(),
      kind: 'projection',
      label: 'Slides',
      url: 'https://example.com/deck',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('NOT_FOUND');
  });
});

describe('updateLink', () => {
  test('moves the link to another key, changes the url, audits only what changed', async () => {
    const created = await addLink({
      songId,
      songKeyId: keyD,
      kind: 'video_link',
      label: 'Video',
      url: yt,
    });
    if (!created.ok) throw new Error(created.error.message);

    const url = 'https://youtu.be/fakeVid0_-2';
    const result = await updateLink(created.data.id, {
      songId,
      songKeyId: keyE,
      kind: 'video_link',
      label: 'Video',
      url,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toMatchObject({ id: created.data.id, songKeyId: keyE, url });

    const audit = await auditFor(created.data.id);
    const update = audit.find((a) => a.action === 'update');
    expect(update?.diff).toEqual({
      songKeyId: { from: keyD, to: keyE },
      url: { from: yt, to: url },
    });
  });

  test('refuses to move a link to another song', async () => {
    const created = await addLink({
      songId,
      songKeyId: keyD,
      kind: 'video_link',
      label: 'Video',
      url: yt,
    });
    if (!created.ok) throw new Error(created.error.message);
    const other = songIds[1]!;
    const result = await updateLink(created.data.id, {
      songId: other,
      songKeyId: otherSongKey,
      kind: 'video_link',
      label: 'Video',
      url: yt,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('VALIDATION');
  });

  test('returns NOT_FOUND for an uploaded-file resource or a missing id', async () => {
    const [file] = await getDb()
      .insert(resources)
      .values({
        songId,
        songKeyId: keyD,
        kind: 'chord_chart',
        format: 'pdf',
        label: 'Chord Chart',
        storagePath: `songs/${songId}/${keyD}/x.pdf`,
      })
      .returning({ id: resources.id });
    const input = { songId, songKeyId: keyD, kind: 'video_link' as const, label: 'x', url: yt };

    for (const id of [file!.id, randomUUID()]) {
      const result = await updateLink(id, input);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('NOT_FOUND');
    }
  });
});
