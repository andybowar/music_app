// @vitest-environment node
import { expect, test } from 'vitest';

import { computeAuditDiff, recordAudit, type Tx } from './audit';

// ---- computeAuditDiff (pure) --------------------------------------------------

test('create diffs every field as added (from undefined)', () => {
  const diff = computeAuditDiff(null, { title: 'Amazing Grace', year: 1779 });
  expect(diff).toEqual({
    title: { from: undefined, to: 'Amazing Grace' },
    year: { from: undefined, to: 1779 },
  });
});

test('delete diffs every field as removed (to undefined)', () => {
  const diff = computeAuditDiff({ title: 'Amazing Grace', year: 1779 }, null);
  expect(diff).toEqual({
    title: { from: 'Amazing Grace', to: undefined },
    year: { from: 1779, to: undefined },
  });
});

test('update records only the fields that changed', () => {
  const before = { title: 'Amazing Grace', year: 1779, tempo: 66 };
  const after = { title: 'Amazing Grace', year: 1779, tempo: 80 };
  expect(computeAuditDiff(before, after)).toEqual({ tempo: { from: 66, to: 80 } });
});

test('identical rows produce an empty diff', () => {
  const row = { title: 'x', tags: ['a', 'b'], nested: { k: 1 } };
  expect(computeAuditDiff(row, { ...row, tags: [...row.tags] })).toEqual({});
});

test('added and removed fields on an update are both recorded', () => {
  const before = { a: 1, b: 2 };
  const after = { a: 1, c: 3 };
  expect(computeAuditDiff(before, after)).toEqual({
    b: { from: 2, to: undefined },
    c: { from: undefined, to: 3 },
  });
});

test('field absent on one side is treated as undefined', () => {
  expect(computeAuditDiff({ a: 1 }, undefined)).toEqual({ a: { from: 1, to: undefined } });
  expect(computeAuditDiff(undefined, { a: 1 })).toEqual({ a: { from: undefined, to: 1 } });
});

// ---- recordAudit (needs a transaction) ---------------------------------------

test('recordAudit inserts one audit_log row with the computed diff', async () => {
  const insertCalls: unknown[] = [];
  const tx = {
    insert: () => ({
      values: (values: unknown) => {
        insertCalls.push(values);
        return Promise.resolve();
      },
    }),
  } as unknown as Tx;

  await recordAudit(tx, {
    actorId: 'actor-1',
    entity: 'song',
    entityId: 'entity-1',
    action: 'update',
    before: { title: 'old', year: 1 },
    after: { title: 'new', year: 1 },
  });

  expect(insertCalls).toHaveLength(1);
  expect(insertCalls[0]).toMatchObject({
    actorId: 'actor-1',
    entity: 'song',
    entityId: 'entity-1',
    action: 'update',
    diff: { title: { from: 'old', to: 'new' } },
  });
});
