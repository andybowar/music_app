/**
 * Drizzle client + transaction runner (contracts/api.md "Core libs").
 *
 * `db` is server-only and lazily initialised: the connection is opened on first
 * use, so importing this module (e.g. during `next build`) never requires a live
 * DATABASE_URL. The export is a lazy proxy over `getDb()`.
 *
 * This module touches the database, so it is exercised by integration tests
 * (`pnpm test:int`, needs `pnpm db:start`), not the unit project.
 */

import 'server-only';

import { type ExtractTablesWithRelations, sql } from 'drizzle-orm';
import {
  drizzle,
  type PostgresJsDatabase,
  type PostgresJsTransaction,
} from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from '@/db/schema';

import { env } from '@/lib/env';

/** The configured Drizzle database (over the full schema), with its postgres.js client. */
export type DB = PostgresJsDatabase<typeof schema> & { $client: postgres.Sql };

/** A transaction handle passed to `withTx` callbacks. */
export type Tx = PostgresJsTransaction<typeof schema, ExtractTablesWithRelations<typeof schema>>;

// Cached on globalThis so dev hot reloads reuse one pool instead of opening a
// new one (up to 10 connections) every time this module is re-evaluated.
const globalForDb = globalThis as typeof globalThis & { __musicAppDb?: DB };

/**
 * Lazily create (and cache) the shared Drizzle database. Server-only: reading
 * `env.DATABASE_URL` throws in the browser by design.
 */
export function getDb(): DB {
  // `prepare: false`: hosted DATABASE_URL is Supabase's transaction pooler (port 6543), which
  // can hand consecutive statements to different server connections. Prepared statements then
  // break, and inside a transaction that silently turned COMMIT into a rollback: saves said
  // "Updated" but never stuck (setlist key bug, 2026-11-05). Supabase and Drizzle both require
  // it for transaction mode; direct local connections don't need it but aren't hurt by it.
  globalForDb.__musicAppDb ??= drizzle(postgres(env.DATABASE_URL, { max: 10, prepare: false }), {
    schema,
  });
  return globalForDb.__musicAppDb;
}

/**
 * Lazy proxy so `import { db } from '@/lib/db'` can be used directly without
 * forcing connection setup at import time.
 */
export const db: DB = new Proxy({} as DB, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb(), prop, receiver);
  },
  has(_target, prop) {
    return prop in getDb();
  },
  ownKeys() {
    return Reflect.ownKeys(getDb());
  },
}) as DB;

/**
 * Run `fn` inside a single Postgres transaction. The callback receives a `Tx`
 * that shares the transaction; it returns or throws in/for the transaction. The
 * transaction commits on resolve and rolls back on throw.
 */
export async function withTx<T>(fn: (tx: Tx) => Promise<T> | T): Promise<T> {
  return getDb().transaction(async (tx) => {
    const result = await fn(tx);
    // Safety net: if the transaction was aborted by an error nobody saw, Postgres turns COMMIT
    // into a silent ROLLBACK and the caller would report success. Any statement in an aborted
    // transaction fails (25P02), so this makes that case throw instead.
    await tx.execute(sql`select 1`);
    return result;
  });
}
