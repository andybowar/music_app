// ADM-07 (REQ-ADM-01): every open item in agent-spec/TODO.md must also be a row in
// `admin_todos`, so it shows on /admin. An item is open while its "Task" column is empty.
// Item #n is imported by a migration with the fixed id `todoId(n)`; this test fails if a
// TODO is added without that migration.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import postgres from 'postgres';
import { afterAll, describe, expect, test } from 'vitest';

if (!process.env.DATABASE_URL && existsSync('.env.local')) process.loadEnvFile('.env.local');

const sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });

afterAll(async () => {
  await sql.end();
});

/** Fixed id of an imported TODO.md item (see db/migrations/0007_import_todos.sql). */
function todoId(n: number): string {
  return `7d0d0000-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

/** Numbers of the TODO.md table rows whose last ("Task") column is empty. */
function openTodoNumbers(markdown: string): number[] {
  return markdown
    .split('\n')
    .map((line) => /^\|\s*(\d+)\s*\|.*\|\s*([^|]*?)\s*\|\s*$/.exec(line))
    .filter((m): m is RegExpExecArray => m !== null && m[2] === '')
    .map((m) => Number(m[1]));
}

const todoMd = readFileSync(join(process.cwd(), 'agent-spec/TODO.md'), 'utf8');

describe('TODO.md import', () => {
  test('parses open items from the TODO table', () => {
    const sample = [
      '| # | Added | Item | Notes | Task |',
      '|---|---|---|---|---|',
      '| 1 | 2026-10-29 | Open item | notes | |',
      '| 2 | 2026-10-29 | Scheduled | notes | ADM-05 |',
      '| 3 | 2026-10-30 | Also open | a | b | |',
    ].join('\n');
    expect(openTodoNumbers(sample)).toEqual([1, 3]);
  });

  test('every open TODO.md item has an admin_todos row', async () => {
    const open = openTodoNumbers(todoMd);
    expect(open.length).toBeGreaterThan(0);
    const ids = open.map(todoId);
    const rows = await sql<{ id: string }[]>`select id from admin_todos where id = any(${ids})`;
    const found = new Set(rows.map((r) => r.id));
    expect(open.filter((n) => !found.has(todoId(n)))).toEqual([]);
  });
});
