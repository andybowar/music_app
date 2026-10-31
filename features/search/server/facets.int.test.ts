// @vitest-environment node
// Integration (SRCH-10): getFacetOptions against the DB-04 seed. Needs local Supabase with
// migrations applied (`pnpm db:start && pnpm db:migrate`); the suite (re)runs the idempotent
// seed itself. CI exports the stack's env; locally it comes from .env.local, which Vitest
// doesn't load on its own. Next's data cache isn't available outside a request, so
// `unstable_cache` is mocked as a pass-through (the unit test covers the cache options).
import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';

import { branches as fixtureBranches, songs as fixtureSongs, users } from '@/fixtures';
import type { AppUser } from '@/types/domain';

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ unstable_cache: <F>(fn: F) => fn }));

const h = vi.hoisted(() => ({ user: null as AppUser | null }));
vi.mock('@/lib/auth', () => ({ requireUser: async () => h.user }));

if (!process.env.DATABASE_URL && existsSync('.env.local')) process.loadEnvFile('.env.local');

const { sql } = await import('drizzle-orm');
const { getDb } = await import('@/lib/db');
const { compareChords, compareKeys, getFacetOptions } = await import('./facets');
const { seed } = await import('@/db/seed/seed');

const tag = randomUUID().slice(0, 8);
const deletedSongId = randomUUID();
// Values no seeded song uses, carried only by a soft-deleted song.
const DELETED_YEAR = 1305;
const DELETED_KEY = 'G#m';
const DELETED_CHORD = 'G#m7b5';

const visible = fixtureSongs;

beforeAll(async () => {
  h.user = users.find((u) => u.role === 'member' && !u.disabledAt) ?? null;
  await seed({
    databaseUrl: process.env.DATABASE_URL,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  });
  await getDb().execute(
    sql`insert into songs (id, title, year, deleted_at)
        values (${deletedSongId}, ${`Facets deleted ${tag}`}, ${DELETED_YEAR}, now())`,
  );
  await getDb().execute(
    sql`insert into song_keys (song_id, key, is_primary, chorus_chord, verse_chord, bridge_chord)
        values (${deletedSongId}, ${DELETED_KEY}, true, ${DELETED_CHORD}, ${DELETED_CHORD},
                ${DELETED_CHORD})`,
  );
});

afterAll(async () => {
  await getDb().execute(sql`delete from songs where id = ${deletedSongId}`);
  await getDb().$client.end();
});

describe('getFacetOptions against the seed (REQ-SRCH-03)', () => {
  test('keys: every seeded key, in key order', async () => {
    const { keys } = await getFacetOptions();
    const expected = [...new Set(visible.flatMap((s) => s.keys.map((k) => k.key)))];
    for (const k of expected) expect(keys).toContain(k);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toEqual([...keys].sort(compareKeys));
  });

  test('decades: every seeded decade, ascending', async () => {
    const { decades } = await getFacetOptions();
    const expected = [
      ...new Set(visible.flatMap((s) => (s.year == null ? [] : [Math.floor(s.year / 10) * 10]))),
    ];
    for (const d of expected) expect(decades).toContain(d);
    expect(decades.every((d) => d % 10 === 0)).toBe(true);
    expect(decades).toEqual([...new Set(decades)].sort((a, b) => a - b));
  });

  test('chords: primary-key first chords per slot, no nulls', async () => {
    const { chords } = await getFacetOptions();
    for (const slot of ['chorus', 'verse', 'bridge'] as const) {
      const expected = [
        ...new Set(
          visible.flatMap((s) => {
            const c = s.keys.find((k) => k.isPrimary)?.firstChords[slot];
            return c ? [c] : [];
          }),
        ),
      ];
      for (const c of expected) expect(chords[slot]).toContain(c);
      expect(chords[slot]).not.toContain(null);
      expect(new Set(chords[slot]).size).toBe(chords[slot].length);
      expect(chords[slot]).toEqual([...chords[slot]].sort(compareChords));
    }
  });

  test('branches: every seeded branch with its fields', async () => {
    const { branches } = await getFacetOptions();
    for (const b of fixtureBranches) expect(branches).toContainEqual(b);
    const names = branches.map((b) => b.name);
    expect(names).toEqual([...names].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
  });

  test('soft-deleted songs contribute nothing', async () => {
    const facets = await getFacetOptions();
    expect(facets.decades).not.toContain(1300);
    expect(facets.keys).not.toContain(DELETED_KEY);
    expect(facets.chords.chorus).not.toContain(DELETED_CHORD);
    expect(facets.chords.verse).not.toContain(DELETED_CHORD);
    expect(facets.chords.bridge).not.toContain(DELETED_CHORD);
  });

  test('signed-in check: a disabled user is denied', async () => {
    const prev = h.user;
    h.user = prev ? { ...prev, disabledAt: new Date().toISOString() } : null;
    try {
      await expect(getFacetOptions()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    } finally {
      h.user = prev;
    }
  });
});
