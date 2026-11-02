// @vitest-environment node
// Integration (SRCH-03; REQ-SRCH-06): the fuzzy title fallback through searchSongs, against the
// DB-04 seed. Needs local Supabase with migrations applied (`pnpm db:start && pnpm db:migrate`);
// the suite (re)runs the idempotent seed itself. CI exports the stack's env; locally it comes
// from .env.local, which Vitest doesn't load on its own. Assertions are scoped to seeded songs
// and songs this suite inserts, since other suites share the database.
import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';

import { SONG_IDS, songs as fixtureSongs, users } from '@/fixtures';
import { ENERGY_LEVELS } from '@/types/domain';
import type { AppUser } from '@/types/domain';

vi.mock('server-only', () => ({}));

const h = vi.hoisted(() => ({ user: null as AppUser | null }));
vi.mock('@/lib/auth', () => ({ requireUser: async () => h.user }));

if (!process.env.DATABASE_URL && existsSync('.env.local')) process.loadEnvFile('.env.local');

const { sql } = await import('drizzle-orm');
const { getDb } = await import('@/lib/db');
const { searchSongs } = await import('./search');
const { seed } = await import('@/db/seed/seed');

const hallelujahs = fixtureSongs.find((s) => s.id === SONG_IDS.thousandHallelujahs)!;
const liveId = randomUUID();
const deletedId = randomUUID();
const LIVE_TITLE = 'Quillwort vespers zephyr';

beforeAll(async () => {
  h.user = users.find((u) => u.role === 'member' && !u.disabledAt) ?? null;
  await seed({
    databaseUrl: process.env.DATABASE_URL,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  });
  await getDb().execute(
    sql`insert into songs (id, title, created_at, deleted_at)
        values (${liveId}, ${LIVE_TITLE}, now(), null),
               (${deletedId}, ${`${LIVE_TITLE}s`}, now(), now())`,
  );
});

afterAll(async () => {
  await getDb().execute(sql`delete from songs where id in (${liveId}, ${deletedId})`);
  await getDb().$client.end();
});

describe('fuzzy title fallback (REQ-SRCH-06)', () => {
  test('"halelujahs" finds "1000 Hallelujahs" and suggests it', async () => {
    const result = await searchSongs({ q: 'halelujahs' });
    expect(result.items.map((i) => i.id)).toContain(SONG_IDS.thousandHallelujahs);
    expect(result.total).toBeGreaterThanOrEqual(1);
    expect(result.didYouMean).toBe('1000 Hallelujahs');
  });

  test('filters still apply to fuzzy matches', async () => {
    const other = ENERGY_LEVELS.find((e) => e !== hallelujahs.energyLevel)!;
    const result = await searchSongs({ q: 'halelujahs', energy: [other] });
    expect(result.items.map((i) => i.id)).not.toContain(SONG_IDS.thousandHallelujahs);
  });

  test('no fallback when title is not a searched field', async () => {
    const result = await searchSongs({ q: 'halelujahs', fields: ['lyrics'] });
    expect(result.items.map((i) => i.id)).not.toContain(SONG_IDS.thousandHallelujahs);
    expect(result).not.toHaveProperty('didYouMean');
  });

  test('full-text matches are not repeated; soft-deleted songs never appear', async () => {
    const result = await searchSongs({ q: LIVE_TITLE, fields: ['title'] });
    const ids = result.items.map((i) => i.id);
    expect(ids.filter((id) => id === liveId)).toHaveLength(1);
    expect(ids[0]).toBe(liveId);
    expect(ids).not.toContain(deletedId);
    expect(result.total).toBe(ids.length);
    // The best fuzzy match is the query itself, so there's nothing to suggest.
    expect(result).not.toHaveProperty('didYouMean');
  });

  test('typo of an inserted title: found, suggested, paged consistently', async () => {
    const result = await searchSongs({ q: 'quilwort vespres zephir' });
    expect(result.items.map((i) => i.id)).toContain(liveId);
    expect(result.items.map((i) => i.id)).not.toContain(deletedId);
    expect(result.didYouMean).toBe(LIVE_TITLE);

    const p1 = await searchSongs({ q: 'quilwort vespres zephir', pageSize: 1 });
    expect(p1.items).toHaveLength(Math.min(1, result.total));
    expect(p1.total).toBe(result.total);
  });
});
