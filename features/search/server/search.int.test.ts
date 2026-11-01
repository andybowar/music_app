// @vitest-environment node
// Integration (SRCH-02): searchSongs against the DB-04 seed. Needs local Supabase with
// migrations applied (`pnpm db:start && pnpm db:migrate`); the suite (re)runs the idempotent
// seed itself. CI exports the stack's env; locally it comes from .env.local, which Vitest
// doesn't load on its own. Query semantics are covered by query.int.test.ts; this suite checks
// the entry point: auth, the default view, the SongSummary mapping and paging.
import { existsSync } from 'node:fs';

import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';

import { songs as fixtureSongs, toSummary, users } from '@/fixtures';
import type { AppUser, SongDetail } from '@/types/domain';

vi.mock('server-only', () => ({}));

const h = vi.hoisted(() => ({ user: null as AppUser | null }));
vi.mock('@/lib/auth', () => ({ requireUser: async () => h.user }));

if (!process.env.DATABASE_URL && existsSync('.env.local')) process.loadEnvFile('.env.local');

const { getDb } = await import('@/lib/db');
const { searchSongs } = await import('./search');
const { seed } = await import('@/db/seed/seed');

const fixtureIds = new Set(fixtureSongs.map((s) => s.id));

const alphaKey = (s: SongDetail) =>
  s.title
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
const byAlpha = (a: SongDetail, b: SongDetail) =>
  alphaKey(a) < alphaKey(b) ? -1 : alphaKey(a) > alphaKey(b) ? 1 : 0;

beforeAll(async () => {
  h.user = users.find((u) => u.role === 'member' && !u.disabledAt) ?? null;
  await seed({
    databaseUrl: process.env.DATABASE_URL,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  });
});

afterAll(async () => {
  await getDb().$client.end();
});

describe('searchSongs (REQ-SRCH-01)', () => {
  test('no params: newest first, then title; page 1 of 50', async () => {
    const result = await searchSongs();
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(50);
    expect(result.total).toBeGreaterThanOrEqual(fixtureSongs.length);

    const all = await searchSongs({ pageSize: 100 });
    const expected = [...fixtureSongs]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || byAlpha(a, b))
      .map((s) => s.id);
    expect(all.items.map((i) => i.id).filter((id) => fixtureIds.has(id))).toEqual(expected);
  });

  test('items are SongSummary objects matching the fixtures', async () => {
    const { items } = await searchSongs({ pageSize: 100 });
    const seeded = items.filter((i) => fixtureIds.has(i.id));
    expect(seeded).toHaveLength(fixtureSongs.length);
    for (const item of seeded) {
      const summary = toSummary(fixtureSongs.find((s) => s.id === item.id)!);
      expect(item).toEqual({ ...summary, createdAt: new Date(summary.createdAt).toISOString() });
    }
  });

  test('paging: pages partition the result; past the end keeps the total', async () => {
    const all = await searchSongs({ pageSize: 100 });
    const p1 = await searchSongs({ pageSize: 2 });
    const p2 = await searchSongs({ pageSize: 2, page: 2 });
    expect([...p1.items, ...p2.items].map((i) => i.id)).toEqual(
      all.items.slice(0, 4).map((i) => i.id),
    );
    expect(p2).toMatchObject({ page: 2, pageSize: 2, total: all.total });

    const past = await searchSongs({ pageSize: 100, page: 999 });
    expect(past).toEqual({ items: [], total: all.total, page: 999, pageSize: 100 });
  });

  test('a disabled user is denied', async () => {
    const prev = h.user;
    h.user = prev ? { ...prev, disabledAt: new Date().toISOString() } : null;
    try {
      await expect(searchSongs()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    } finally {
      h.user = prev;
    }
  });
});
