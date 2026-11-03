// @vitest-environment node
// Integration (ADM-06): 0006_admin_backlog.sql RLS + bucket, and the backlog server actions
// against local Supabase (Postgres + Storage). Needs `pnpm db:start && pnpm db:migrate`; CI's
// integration job does both. CI sets the env vars; locally they come from .env.local.
//
// RLS checks run as a real API role (`set local role authenticated` plus
// `request.jwt.claims`, as PostgREST does) inside a transaction that is always rolled back.
// Fixtures are created as `postgres` (BYPASSRLS) and removed afterwards.
import { existsSync } from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';

import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';

import type { AppUser, Role } from '@/types/domain';

vi.mock('server-only', () => ({}));

if (!process.env.DATABASE_URL && existsSync('.env.local')) process.loadEnvFile('.env.local');

const tag = randomUUID().slice(0, 8);
const sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });

const ROLE_KEYS = ['member', 'contributor', 'music_leader', 'admin'] as const;
/** Admins who must still get nothing: disabled, and not yet approved. */
const BLOCKED_ADMINS = ['disabled_admin', 'pending_admin'] as const;
type UserKey = (typeof ROLE_KEYS)[number] | (typeof BLOCKED_ADMINS)[number];
type Who = UserKey | 'anon';
const userIds = Object.fromEntries(
  [...ROLE_KEYS, ...BLOCKED_ADMINS].map((r) => [r, randomUUID()]),
) as Record<UserKey, string>;
let branchId = '';

const appUser = (role: Role): AppUser => ({
  id: userIds[role],
  email: `backlog-${role}-${tag}@example.test`,
  name: `Backlog ${role}`,
  branchId,
  role,
  authProvider: 'password',
  disabledAt: null,
  accessStatus: 'approved',
});

let actor: AppUser;
vi.mock('@/lib/auth', () => ({ requireUser: async () => actor }));

const server = await import('@/features/admin/backlog/server');
const storage = await import('@/features/admin/backlog/storage');

// 1×1 transparent PNG.
const PNG = Uint8Array.from(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
    'base64',
  ),
);

const fixture = { todo: '', request: '', object: '' };
const requestIds: string[] = [];

const ROLLBACK = Symbol('rollback');

async function as<T>(who: Who, fn: (tx: postgres.TransactionSql) => Promise<T>): Promise<T> {
  let out: T | undefined;
  try {
    await sql.begin(async (tx) => {
      const claims =
        who === 'anon'
          ? { role: 'anon' }
          : { sub: userIds[who], role: 'authenticated', aud: 'authenticated' };
      await tx`select set_config('request.jwt.claims', ${JSON.stringify(claims)}, true)`;
      await tx`select set_config('storage.allow_delete_query', 'true', true)`;
      await tx.unsafe(`set local role ${who === 'anon' ? 'anon' : 'authenticated'}`);
      out = await fn(tx);
      throw ROLLBACK;
    });
  } catch (error) {
    if (error !== ROLLBACK) throw error;
  }
  return out as T;
}

/** True when the statement affects/returns at least one row; RLS rejections count as false. */
async function allowed(
  who: Who,
  fn: (tx: postgres.TransactionSql) => Promise<postgres.RowList<postgres.Row[]>>,
): Promise<boolean> {
  try {
    return await as(who, async (tx) => (await fn(tx)).count > 0);
  } catch (error) {
    if ((error as { code?: string }).code === '42501') return false;
    throw error;
  }
}

async function put(uploadUrl: string, body: Uint8Array, contentType: string) {
  const response = await fetch(uploadUrl, {
    method: 'PUT',
    body: Buffer.from(body),
    headers: { 'content-type': contentType },
  });
  expect(response.ok, `PUT failed: ${response.status} ${await response.clone().text()}`).toBe(true);
}

function ok<T>(
  result: { ok: true; data: T } | { ok: false; error: { code: string; message: string } },
): T {
  if (!result.ok) throw new Error(`action failed: ${JSON.stringify(result.error)}`);
  return result.data;
}

beforeAll(async () => {
  const code = [...randomBytes(3)].map((b) => String.fromCharCode(65 + (b % 26))).join('');
  const [branch] = await sql<{ id: string }[]>`
    insert into branches (name, code) values (${`Backlog ${tag}`}, ${code}) returning id`;
  branchId = branch!.id;
  for (const role of ROLE_KEYS) {
    const u = appUser(role);
    await sql`insert into auth.users (id, email, aud, role) values (${u.id}, ${u.email}, 'authenticated', 'authenticated')`;
    await sql`insert into users (id, email, name, branch_id, role, auth_provider, access_status)
              values (${u.id}, ${u.email}, ${u.name}, ${branchId}, ${role}, 'password', 'approved')`;
  }
  for (const key of BLOCKED_ADMINS) {
    const id = userIds[key];
    const email = `backlog-${key}-${tag}@example.test`;
    await sql`insert into auth.users (id, email, aud, role) values (${id}, ${email}, 'authenticated', 'authenticated')`;
    await sql`insert into users (id, email, name, branch_id, role, auth_provider, access_status, disabled_at)
              values (${id}, ${email}, ${key}, ${branchId}, 'admin', 'password',
                      ${key === 'pending_admin' ? 'pending' : 'approved'},
                      ${key === 'disabled_admin' ? new Date() : null})`;
  }
  const [todo] = await sql<{ id: string }[]>`
    insert into admin_todos (title, created_by) values (${`RLS todo ${tag}`}, ${userIds.admin}) returning id`;
  fixture.todo = todo!.id;
  const [request] = await sql<{ id: string }[]>`
    insert into feature_requests (title, created_by) values (${`RLS request ${tag}`}, ${userIds.admin}) returning id`;
  fixture.request = request!.id;
  requestIds.push(fixture.request);
  fixture.object = `requests/${fixture.request}/${randomUUID()}.png`;
  await sql`insert into feature_request_images (request_id, storage_path, file_name, mime_type, size_bytes, created_by)
            values (${fixture.request}, ${fixture.object}, 'w.png', 'image/png', 10, ${userIds.admin})`;
  await sql`insert into storage.objects (bucket_id, name) values ('admin-attachments', ${fixture.object})`;
});

afterAll(async () => {
  await sql.begin(async (tx) => {
    await tx`select set_config('storage.allow_delete_query', 'true', true)`;
    await tx`delete from storage.objects where bucket_id = 'admin-attachments' and name = ${fixture.object}`;
  });
  for (const id of requestIds) {
    const paths = await storage.listRequestObjects(id).catch(() => []);
    await storage.removeObjects(paths).catch(() => {});
  }
  const ids = Object.values(userIds);
  await sql`delete from feature_requests where created_by = any(${ids})`;
  await sql`delete from admin_todos where created_by = any(${ids})`;
  await sql`delete from auth.users where id = any(${ids})`; // cascades users
  await sql`delete from branches where id = ${branchId}`;
  await sql.end();
});

describe('migration', () => {
  test('the admin-attachments bucket is private with the image limits', async () => {
    const [bucket] = await sql<
      { public: boolean; file_size_limit: string; allowed_mime_types: string[] }[]
    >`select public, file_size_limit::text, allowed_mime_types from storage.buckets where id = 'admin-attachments'`;
    expect(bucket).toEqual({
      public: false,
      file_size_limit: '10485760',
      allowed_mime_types: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
    });
  });

  test('updated_at is stamped on update', async () => {
    const [before] = await sql<{ updated_at: Date }[]>`
      select updated_at from feature_requests where id = ${fixture.request}`;
    await sql`select pg_sleep(0.01)`;
    const [after] = await sql<{ updated_at: Date }[]>`
      update feature_requests set status = status where id = ${fixture.request} returning updated_at`;
    expect(after!.updated_at.getTime()).toBeGreaterThan(before!.updated_at.getTime());
  });
});

/** A real user id for `created_by` (anon has none of its own). */
const owner = (who: Who) => userIds[who === 'anon' ? 'admin' : who];

describe('RLS', () => {
  const probes: [
    string,
    (tx: postgres.TransactionSql, who: Who) => Promise<postgres.RowList<postgres.Row[]>>,
  ][] = [
    ['select to-dos', (tx) => tx`select 1 from admin_todos where id = ${fixture.todo}`],
    [
      'insert to-do',
      (tx, who) => tx`insert into admin_todos (title, created_by) values ('x', ${owner(who)})`,
    ],
    ['update to-do', (tx) => tx`update admin_todos set done_at = now() where id = ${fixture.todo}`],
    ['delete to-do', (tx) => tx`delete from admin_todos where id = ${fixture.todo}`],
    ['select requests', (tx) => tx`select 1 from feature_requests where id = ${fixture.request}`],
    [
      'insert request',
      (tx, who) => tx`insert into feature_requests (title, created_by) values ('x', ${owner(who)})`,
    ],
    [
      'update request',
      (tx) => tx`update feature_requests set status = 'planned' where id = ${fixture.request}`,
    ],
    ['delete request', (tx) => tx`delete from feature_requests where id = ${fixture.request}`],
    [
      'select images',
      (tx) => tx`select 1 from feature_request_images where request_id = ${fixture.request}`,
    ],
    [
      'insert image',
      (tx, who) => tx`insert into feature_request_images
          (request_id, storage_path, file_name, mime_type, size_bytes, created_by)
          values (${fixture.request}, ${`requests/${fixture.request}/${randomUUID()}.png`},
                  'x.png', 'image/png', 1, ${owner(who)})`,
    ],
    [
      'delete image',
      (tx) => tx`delete from feature_request_images where request_id = ${fixture.request}`,
    ],
    [
      'read bucket object',
      (tx) =>
        tx`select 1 from storage.objects where bucket_id = 'admin-attachments' and name = ${fixture.object}`,
    ],
    [
      'upload bucket object',
      (tx) =>
        tx`insert into storage.objects (bucket_id, name)
           values ('admin-attachments', ${`requests/${tag}/${randomUUID()}.png`})`,
    ],
    [
      'delete bucket object',
      (tx) =>
        tx`delete from storage.objects where bucket_id = 'admin-attachments' and name = ${fixture.object}`,
    ],
  ];

  test.each([...ROLE_KEYS, ...BLOCKED_ADMINS, 'anon'] as const)('%s', async (who) => {
    const results: Record<string, boolean> = {};
    for (const [name, run] of probes) results[name] = await allowed(who, (tx) => run(tx, who));
    const expected = who === 'admin';
    expect(results).toEqual(Object.fromEntries(probes.map(([name]) => [name, expected])));
  });

  test('a deleted request takes its image rows with it', async () => {
    const remaining = await as('admin', async (tx) => {
      await tx`delete from feature_requests where id = ${fixture.request}`;
      const [row] = await tx<{ n: number }[]>`
        select count(*)::int as n from feature_request_images where request_id = ${fixture.request}`;
      return row!.n;
    });
    expect(remaining).toBe(0);
  });
});

describe('server actions', () => {
  test('non-admins are refused', async () => {
    for (const role of ['member', 'contributor', 'music_leader'] as const) {
      actor = appUser(role);
      expect(await server.listTodos()).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
      expect(await server.createRequest({ kind: 'change', title: 'x' })).toMatchObject({
        ok: false,
        error: { code: 'FORBIDDEN' },
      });
      await expect(server.listRequests()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    }
  });

  test('to-dos: add, tick, untick, delete', async () => {
    actor = appUser('admin');
    const todo = ok(await server.addTodo({ title: `  Write docs ${tag} `, notes: '' }));
    expect(todo).toMatchObject({ title: `Write docs ${tag}`, notes: null, doneAt: null });

    const done = ok(await server.updateTodo(todo.id, { done: true }));
    expect(done.doneAt).not.toBeNull();
    expect(done.doneBy).toBe(actor.id);

    const reopened = ok(await server.updateTodo(todo.id, { done: false, notes: 'Later' }));
    expect(reopened).toMatchObject({ doneAt: null, doneBy: null, notes: 'Later' });

    expect(ok(await server.listTodos()).some((t) => t.id === todo.id)).toBe(true);
    ok(await server.deleteTodo(todo.id));
    expect(await server.deleteTodo(todo.id)).toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND' },
    });
  });

  test('requests: create, upload, finalize, read, delete', async () => {
    actor = appUser('admin');
    const created = ok(
      await server.createRequest({
        kind: 'enhancement',
        title: `Wireframes ${tag}`,
        description: 'Line one\nLine two',
      }),
    );
    requestIds.push(created.id);
    expect(created).toMatchObject({
      status: 'new',
      imageCount: 0,
      createdByName: 'Backlog admin',
    });

    const ticket = ok(
      await server.createRequestImageUpload(created.id, {
        fileName: 'home.png',
        mimeType: 'image/png',
        sizeBytes: PNG.byteLength,
      }),
    );
    // Not finalizable before the bytes arrive.
    expect(await server.finalizeRequestImage(ticket.imageId)).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION' },
    });
    await put(ticket.uploadUrl, PNG, 'image/png');
    const image = ok(await server.finalizeRequestImage(ticket.imageId));
    expect(image).toMatchObject({ fileName: 'home.png', sizeBytes: PNG.byteLength });
    expect(image.url).toMatch(/^http/);
    // Idempotent.
    expect(ok(await server.finalizeRequestImage(ticket.imageId)).id).toBe(image.id);

    // A tampered ticket is refused.
    expect(await server.finalizeRequestImage(`${ticket.imageId}x`)).toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND' },
    });

    // Wrong bytes for the declared type: rejected and the object removed.
    const bad = ok(
      await server.createRequestImageUpload(created.id, {
        fileName: 'fake.png',
        mimeType: 'image/png',
        sizeBytes: 4,
      }),
    );
    await put(bad.uploadUrl, new Uint8Array([1, 2, 3, 4]), 'image/png');
    expect(await server.finalizeRequestImage(bad.imageId)).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION' },
    });

    const detail = await server.getRequest(created.id);
    expect(detail?.images.map((i) => i.id)).toEqual([image.id]);
    expect(detail?.imageCount).toBe(1);
    const fetched = await fetch(detail!.images[0]!.url);
    expect(fetched.ok).toBe(true);
    expect(new Uint8Array(await fetched.arrayBuffer())).toEqual(PNG);

    const updated = ok(await server.updateRequest(created.id, { status: 'planned' }));
    expect(updated.status).toBe('planned');
    expect((await server.listRequests({ status: 'planned' })).map((r) => r.id)).toContain(
      created.id,
    );
    expect((await server.listRequests({ status: 'new' })).map((r) => r.id)).not.toContain(
      created.id,
    );

    ok(await server.deleteRequest(created.id));
    expect(await server.getRequest(created.id)).toBeNull();
    expect(await storage.listRequestObjects(created.id)).toEqual([]);
    const [rows] = await sql<{ n: number }[]>`
      select count(*)::int as n from feature_request_images where request_id = ${created.id}`;
    expect(rows!.n).toBe(0);
  });

  test('the 5-image limit and image delete', async () => {
    actor = appUser('admin');
    const created = ok(await server.createRequest({ kind: 'change', title: `Limit ${tag}` }));
    requestIds.push(created.id);
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      const t = ok(
        await server.createRequestImageUpload(created.id, {
          fileName: `w${i}.png`,
          mimeType: 'image/png',
          sizeBytes: PNG.byteLength,
        }),
      );
      await put(t.uploadUrl, PNG, 'image/png');
      ids.push(ok(await server.finalizeRequestImage(t.imageId)).id);
    }
    expect(
      await server.createRequestImageUpload(created.id, {
        fileName: 'w6.png',
        mimeType: 'image/png',
        sizeBytes: PNG.byteLength,
      }),
    ).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });

    ok(await server.deleteRequestImage(ids[0]!));
    expect((await server.getRequest(created.id))?.imageCount).toBe(4);
    expect(await storage.listRequestObjects(created.id)).toHaveLength(4);
  });

  test('getRequest returns null for unknown and malformed ids', async () => {
    actor = appUser('admin');
    expect(await server.getRequest(randomUUID())).toBeNull();
    expect(await server.getRequest('not-a-uuid')).toBeNull();
  });
});
