/**
 * Audit logging (contracts/api.md "Core libs"; REQ-LIB-12).
 *
 * `recordAudit` writes one row to `audit_log` capturing a shallow diff of what an
 * action changed on a song-related entity, so the change history is viewable on
 * the song. The diff computation is pure and unit-tested; the insert needs a
 * transaction, so it is exercised by integration tests.
 *
 * Convention:
 *   - create: before is `null`,   after is the new row  → every field is "added"
 *   - delete: before is old row,   after is `null`       → every field is "removed"
 *   - update: before/after are rows; only fields that differ are recorded
 *
 * A missing side is recorded as `null`, never `undefined`: jsonb drops undefined
 * keys, which would break the `{ from, to }` shape readers rely on.
 */

import { auditLog } from '@/db/schema';
import type { Tx } from '@/lib/db';
import type { AuditEntry } from '@/types/domain';

export type { Tx };

/** What changed, keyed by field: `{ from, to }` snapshots (absent ⇒ `null`). */
export type AuditDiff = AuditEntry['diff'];

export type AuditAction = AuditEntry['action'];

/** Bookkeeping columns that change on every write and say nothing about the edit. */
const IGNORED_FIELDS: ReadonlySet<string> = new Set(['id', 'createdAt', 'updatedAt']);

export interface RecordAuditArgs {
  actorId: string;
  entity: string;
  entityId: string;
  action: AuditAction;
  /** Row before the change (omit / `null` for a create). */
  before?: Record<string, unknown> | null;
  /** Row after the change (omit / `null` for a delete). */
  after?: Record<string, unknown> | null;
}

/**
 * Shallow diff of `before` and `after`: the top-level fields whose values
 * changed, with `{ from, to }` snapshots. Two rows that look identical produce an
 * empty diff. Absent sides are treated as empty objects. `id`, `createdAt` and
 * `updatedAt` are never recorded.
 */
export function computeAuditDiff(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
): AuditDiff {
  const b = before ?? {};
  const a = after ?? {};
  const diff: AuditDiff = {};

  for (const key of new Set([...Object.keys(b), ...Object.keys(a)])) {
    if (IGNORED_FIELDS.has(key)) continue;
    const from = b[key] ?? null;
    const to = a[key] ?? null;
    if (!deepEqual(from, to)) {
      diff[key] = { from, to };
    }
  }
  return diff;
}

/** Structurally compare two JSON-like values (objects, arrays, primitives). */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((item, i) => deepEqual(item, b[i]));
  }

  if (Array.isArray(a) || Array.isArray(b)) return false;
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (a instanceof Date || b instanceof Date) return false;

  const ak = Object.keys(a as object);
  const bk = Object.keys(b as object);
  if (ak.length !== bk.length) return false;
  return ak.every((key) =>
    deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]),
  );
}

/**
 * Compute the diff and append one `audit_log` row inside `tx`. The caller's
 * transaction commits the row with the rest of its work.
 */
export async function recordAudit(tx: Tx, args: RecordAuditArgs): Promise<void> {
  const diff = computeAuditDiff(args.before, args.after);

  await tx.insert(auditLog).values({
    actorId: args.actorId,
    entity: args.entity,
    entityId: args.entityId,
    action: args.action,
    diff,
  });
}
