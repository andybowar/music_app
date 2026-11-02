// @vitest-environment node
// Integration: needs local Supabase (`pnpm db:start`). CI sets the env vars; locally
// they come from .env.local, which Vitest doesn't load on its own.
import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';

import type { AppUser, Role } from '@/types/domain';

vi.mock('server-only', () => ({}));

const actorId = randomUUID();
const otherId = randomUUID();
const actor: AppUser = {
  id: actorId,
  email: `${actorId}@example.test`,
  name: 'LIB-19 actor',
  branchId: null,
  role: 'contributor',
  authProvider: 'password',
  disabledAt: null,
  accessStatus: 'approved',
};
const otherEmail = `${otherId}@example.test`;
vi.mock('@/lib/auth', () => ({ requireUser: async () => actor }));

if (!process.env.DATABASE_URL && existsSync('.env.local')) process.loadEnvFile('.env.local');

const { inArray, sql } = await import('drizzle-orm');
const { auditLog, branches, composers, resources, songKeys, songs, users } =
  await import('@/db/schema');
const { getDb } = await import('@/lib/db');
const { getAuditTrail } = await import('./server');
const { loadAuditTrail } = await import('./actions');
const { setSongKeys } = await import('@/features/songs/server/keys');

const songIds: string[] = [];
let songId: string;
let otherSongId: string;
let composerId: string;
let branchId: string;
let liveFileId: string;
const goneFileId = randomUUID();
const goneKeyId = randomUUID();

const at = (minutes: number) => new Date(Date.UTC(2026, 0, 1, 12, minutes));

beforeAll(async () => {
  const db = getDb();
  for (const [id, email] of [
    [actorId, actor.email],
    [otherId, otherEmail],
  ] as const) {
    await db.execute(sql`insert into auth.users (id, email) values (${id}, ${email})`);
  }
  await db.insert(users).values([
    {
      id: actorId,
      email: actor.email,
      name: actor.name,
      role: 'contributor',
      authProvider: 'password',
      accessStatus: 'approved',
    },
    {
      id: otherId,
      email: otherEmail,
      name: 'LIB-19 other',
      role: 'contributor',
      authProvider: 'password',
      accessStatus: 'approved',
    },
  ]);

  const tag = randomUUID().slice(0, 8);
  const inserted = await db
    .insert(songs)
    .values([{ title: `LIB-19 song ${tag}` }, { title: `LIB-19 other song ${tag}` }])
    .returning({ id: songs.id });
  [songId, otherSongId] = inserted.map((s) => s.id) as [string, string];
  songIds.push(songId, otherSongId);

  const [composer] = await db
    .insert(composers)
    .values({ name: `LIB-19 composer ${tag}` })
    .returning({ id: composers.id });
  composerId = composer!.id;

  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const pick = () => letters[Math.floor(Math.random() * letters.length)];
  const [branch] = await db
    .insert(branches)
    .values({ name: `LIB-19 branch ${tag}`, code: `Z${pick()}${pick()}` })
    .returning({ id: branches.id, code: branches.code });
  branchId = branch!.id;

  liveFileId = randomUUID();
  await db.insert(resources).values({
    id: liveFileId,
    songId,
    songKeyId: null,
    kind: 'projection',
    format: 'pptx',
    label: 'Slides',
    storagePath: `songs/${songId}/common/${liveFileId}.pptx`,
  });

  await db.insert(auditLog).values([
    {
      actorId: otherId,
      entity: 'song',
      entityId: songId,
      action: 'create',
      diff: {
        title: { from: null, to: 'LIB-19 song' },
        composerIds: { from: null, to: [composerId] },
        addedByBranchId: { from: null, to: branchId },
        lyrics: { from: null, to: { chorus: 'line one', verse_1: null } },
      },
      createdAt: at(0),
    },
    {
      actorId,
      entity: 'resource',
      entityId: liveFileId,
      action: 'create',
      diff: {
        songId: { from: null, to: songId },
        label: { from: null, to: 'Slides' },
        storagePath: { from: null, to: `songs/${songId}/common/${liveFileId}.pptx` },
        uploadedBy: { from: null, to: actorId },
      },
      createdAt: at(1),
    },
    {
      // A file that was later deleted: matched on the songId its snapshot carried.
      actorId,
      entity: 'resource',
      entityId: goneFileId,
      action: 'delete',
      diff: { songId: { from: songId, to: null }, label: { from: 'Old chart', to: null } },
      createdAt: at(2),
    },
    {
      actorId: null,
      entity: 'song_themes',
      entityId: songId,
      action: 'update',
      diff: { chorus: { from: null, to: ['Joy'] } },
      createdAt: at(3),
    },
    // Not part of this song's history:
    {
      actorId,
      entity: 'song',
      entityId: otherSongId,
      action: 'update',
      diff: { title: { from: 'a', to: 'b' } },
      createdAt: at(4),
    },
    {
      actorId,
      entity: 'resource',
      entityId: randomUUID(),
      action: 'delete',
      diff: { songId: { from: otherSongId, to: null }, label: { from: 'Theirs', to: null } },
      createdAt: at(4),
    },
    {
      actorId,
      entity: 'song_key',
      entityId: goneKeyId,
      action: 'delete',
      diff: { key: { from: 'E', to: null } },
      createdAt: at(4),
    },
    {
      actorId,
      entity: 'user',
      entityId: otherId,
      action: 'update',
      diff: { email: { from: otherEmail, to: otherEmail }, role: { from: 'member', to: 'admin' } },
      createdAt: at(4),
    },
  ]);
});

afterAll(async () => {
  const db = getDb();
  await db
    .delete(auditLog)
    .where(inArray(auditLog.entityId, [...songIds, liveFileId, goneFileId, goneKeyId, otherId]));
  await db.delete(auditLog).where(inArray(auditLog.actorId, [actorId, otherId]));
  await db.delete(songs).where(inArray(songs.id, songIds));
  await db.delete(composers).where(inArray(composers.id, [composerId]));
  await db.delete(branches).where(inArray(branches.id, [branchId]));
  await db.execute(sql`delete from auth.users where id in (${actorId}, ${otherId})`);
  await db.$client.end();
});

const setRole = (role: Role) => {
  actor.role = role;
};

describe('getAuditTrail', () => {
  test('a song trail covers the song, its files and themes, newest first', async () => {
    setRole('contributor');
    const trail = await getAuditTrail('song', songId);
    expect(trail.map((e) => [e.entity, e.action])).toEqual([
      ['song_themes', 'update'],
      ['resource', 'delete'],
      ['resource', 'create'],
      ['song', 'create'],
    ]);

    const [themesEntry, goneFile, liveFile, created] = trail;
    expect(themesEntry!.actorName).toBe('Unknown user');
    expect(goneFile!.entityId).toBe(goneFileId);
    expect(goneFile!.diff).toEqual({ label: { from: 'Old chart', to: null } });
    expect(liveFile!.actorName).toBe('LIB-19 actor');
    expect(liveFile!.diff).toEqual({ label: { from: null, to: 'Slides' } });

    expect(created!.actorName).toBe('LIB-19 other');
    expect(created!.createdAt).toBe(at(0).toISOString());
    const [branch] = await getDb()
      .select({ code: branches.code })
      .from(branches)
      .where(inArray(branches.id, [branchId]));
    expect(created!.diff).toMatchObject({
      composers: { from: null, to: [expect.stringMatching(/^LIB-19 composer/)] },
      addedByBranch: { from: null, to: branch!.code },
      lyrics: { from: null, to: { chorus: 'line one' } },
    });

    // Actors appear by name only.
    expect(JSON.stringify(trail)).not.toContain(otherEmail);
    expect(JSON.stringify(trail)).not.toContain('storagePath');
  });

  test('includes key changes made through setSongKeys', async () => {
    setRole('contributor');
    const res = await setSongKeys(songId, [
      {
        key: 'G',
        isPrimary: true,
        firstChords: { intro: 'G', verse: null, chorus: null, bridge: null },
      },
    ]);
    expect(res.ok).toBe(true);
    const [key] = await getDb()
      .select({ id: songKeys.id })
      .from(songKeys)
      .where(inArray(songKeys.songId, [songId]));

    const trail = await getAuditTrail('song', songId);
    expect(trail[0]).toMatchObject({ entity: 'song_key', entityId: key!.id, action: 'create' });
    expect(trail[0]!.diff).toMatchObject({ key: { from: null, to: 'G' } });

    const keyTrail = await getAuditTrail('song_key', key!.id);
    expect(keyTrail.map((e) => e.id)).toEqual([trail[0]!.id]);
  });

  test('other entities: exact match for song-related ones, nothing for users', async () => {
    setRole('contributor');
    const other = await getAuditTrail('song', otherSongId);
    expect(other.map((e) => e.diff)).toEqual([{ title: { from: 'a', to: 'b' } }]);
    await expect(getAuditTrail('user', otherId)).resolves.toEqual([]);
    await expect(getAuditTrail('song', randomUUID())).resolves.toEqual([]);
  });

  test('members are forbidden', async () => {
    setRole('member');
    await expect(getAuditTrail('song', songId)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(loadAuditTrail('song', songId)).resolves.toMatchObject({
      ok: false,
      error: { code: 'FORBIDDEN' },
    });
    setRole('contributor');
  });

  test('loadAuditTrail wraps the trail', async () => {
    setRole('music_leader');
    const res = await loadAuditTrail('song', songId);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.length).toBeGreaterThan(0);
  });
});
