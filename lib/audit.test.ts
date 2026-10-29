// @vitest-environment node
import { expect, test } from 'vitest';

import { computeAuditDiff, recordAudit, type Tx } from './audit';

// ---- computeAuditDiff (pure) --------------------------------------------------

test('create diffs every field as added (from null)', () => {
  const diff = computeAuditDiff(null, { title: 'Amazing Grace', year: 1779 });
  expect(diff).toEqual({
    title: { from: null, to: 'Amazing Grace' },
    year: { from: null, to: 1779 },
  });
});

test('delete diffs every field as removed (to null)', () => {
  const diff = computeAuditDiff({ title: 'Amazing Grace', year: 1779 }, null);
  expect(diff).toEqual({
    title: { from: 'Amazing Grace', to: null },
    year: { from: 1779, to: null },
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
    b: { from: 2, to: null },
    c: { from: null, to: 3 },
  });
});

test('field absent on one side is recorded as null', () => {
  expect(computeAuditDiff({ a: 1 }, undefined)).toEqual({ a: { from: 1, to: null } });
  expect(computeAuditDiff(undefined, { a: 1 })).toEqual({ a: { from: null, to: 1 } });
});

test('a field that is undefined on one side and null on the other is unchanged', () => {
  expect(computeAuditDiff({ a: undefined }, { a: null })).toEqual({});
});

test('id, createdAt and updatedAt are never recorded', () => {
  const before = { id: 's1', title: 'old', createdAt: new Date(0), updatedAt: new Date(0) };
  const after = { id: 's1', title: 'new', createdAt: new Date(0), updatedAt: new Date(1) };
  expect(computeAuditDiff(before, after)).toEqual({ title: { from: 'old', to: 'new' } });
  expect(computeAuditDiff(null, after)).toEqual({ title: { from: null, to: 'new' } });
});

test('diffs keep both from and to through a JSON round trip (as stored in jsonb)', () => {
  const diff = computeAuditDiff(null, { title: 'x' });
  expect(JSON.parse(JSON.stringify(diff))).toEqual({ title: { from: null, to: 'x' } });
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
