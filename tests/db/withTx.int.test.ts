// @vitest-environment node
// Integration: `withTx` never reports success for a transaction Postgres rolled back.
// Bug 2026-11-05: on the transaction pooler, an unseen error aborted the transaction, COMMIT
// became a silent ROLLBACK, and setlist key saves said "Updated" without sticking.
import { existsSync } from 'node:fs';

import { sql } from 'drizzle-orm';
import { afterAll, describe, expect, test, vi } from 'vitest';

vi.mock('server-only', () => ({}));
if (!process.env.DATABASE_URL && existsSync('.env.local')) process.loadEnvFile('.env.local');

const { getDb, withTx } = await import('@/lib/db');

afterAll(async () => {
  await getDb().$client.end();
});

describe('withTx', () => {
  test('commits a normal transaction', async () => {
    const value = await withTx(async (tx) => {
      const [row] = await tx.execute<{ n: number }>(sql`select 41 + 1 as n`);
      return row!.n;
    });
    expect(Number(value)).toBe(42);
  });

  test('throws, instead of reporting success, when an error inside was swallowed', async () => {
    await expect(
      withTx(async (tx) => {
        // An error that the caller catches still aborts the Postgres transaction.
        await tx.execute(sql`select 1 / 0`).catch(() => undefined);
        return 'looks fine';
      }),
    ).rejects.toSatisfy((error: unknown) => {
      // Drizzle wraps the driver error; its cause is Postgres's "transaction is aborted" (25P02).
      const cause = (error as { cause?: { code?: string } }).cause;
      return cause?.code === '25P02';
    });
  });
});
