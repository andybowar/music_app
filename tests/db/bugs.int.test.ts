// @vitest-environment node
// Integration (ADM-08): 0008_bug_reports.sql RLS, and the bug report server actions against
// local Supabase (Postgres + Storage). Needs `pnpm db:start && pnpm db:migrate`; CI's
// integration job does both. CI sets the env vars; locally they come from .env.local.
//
// RLS checks run as a real API role (`set local role authenticated` plus
// `request.jwt.claims`, as PostgREST does) inside a transaction that is always rolled back.
// Fixtures are created as `postgres` (BYPASSRLS) and removed afterwards.
import { existsSync } from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';

import postgres from 'postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';

import type { AppUser, Role } from '@/types/domain';

vi.mock('server-only', () => ({}));

if (!process.env.DATABASE_URL && existsSync('.env.local')) process.loadEnvFile('.env.local');

const tag = randomUUID().slice(0, 8);
const sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });

const ROLE_KEYS = ['member', 'contributor', 'music_leader', 'admin'] as const;
/** Users who must get nothing: disabled, and not yet approved (both admins). */
const BLOCKED = ['disabled_admin', 'pending_admin'] as const;
type UserKey = (typeof ROLE_KEYS)[number] | (typeof BLOCKED)[number];
type Who = UserKey | 'anon';
const userIds = Object.fromEntries(
  [...ROLE_KEYS, ...BLOCKED].map((r) => [r, randomUUID()]),
) as Record<UserKey, string>;
let branchId = '';

const appUser = (role: Role): AppUser => ({
  id: userIds[role],
  email: `bugs-${role}-${tag}@example.test`.replace(/_/g, '-'),
  name: `Bugs ${role}`,
  branchId,
  role,
  authProvider: 'password',
  disabledAt: null,
  accessStatus: 'approved',
});

let actor: AppUser;
vi.mock('@/lib/auth', () => ({ requireUser: async () => actor }));
const notify = vi.hoisted(() => ({ notifyBugReported: vi.fn(async () => false) }));
vi.mock('@/features/bugs/notify', () => notify);

const server = await import('@/features/bugs/server');
const storage = await import('@/features/admin/backlog/storage');

// 1×1 transparent PNG.
const PNG = Uint8Array.from(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
    'base64',
  ),
);

/** One report per active role (filed by that role), plus an image on the member's. */
const reportOf = {} as Record<(typeof ROLE_KEYS)[number], string>;
const reportIds: string[] = [];

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

async function visibleReports(who: Who): Promise<string[]> {
  return as(who, async (tx) =>
    (await tx<{ id: string }[]>`select id from bug_reports where id = any(${reportIds})`).map(
      (r) => r.id,
    ),
  );
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

const insertImage = (tx: postgres.TransactionSql, reportId: string, createdBy: string) =>
  tx`insert into bug_report_images (report_id, storage_path, file_name, mime_type, size_bytes, created_by)
     values (${reportId}, ${`bugs/${reportId}/${randomUUID()}.png`}, 'x.png', 'image/png', 1, ${createdBy})`;

beforeAll(async () => {
  const code = [...randomBytes(3)].map((b) => String.fromCharCode(65 + (b % 26))).join('');
  const [branch] = await sql<{ id: string }[]>`
    insert into branches (name, code) values (${`Bugs ${tag}`}, ${code}) returning id`;
  branchId = branch!.id;
  for (const role of ROLE_KEYS) {
    const u = appUser(role);
    await sql`insert into auth.users (id, email, aud, role) values (${u.id}, ${u.email}, 'authenticated', 'authenticated')`;
    await sql`insert into users (id, email, name, branch_id, role, auth_provider, access_status)
              values (${u.id}, ${u.email}, ${u.name}, ${branchId}, ${role}, 'password', 'approved')`;
    const [report] = await sql<{ id: string }[]>`
      insert into bug_reports (title, description, created_by)
      values (${`Bug by ${role} ${tag}`}, 'What happened', ${u.id}) returning id`;
    reportOf[role] = report!.id;
    reportIds.push(report!.id);
  }
  for (const key of BLOCKED) {
    const id = userIds[key];
    const email = `bugs-${key}-${tag}@example.test`.replace(/_/g, '-');
    await sql`insert into auth.users (id, email, aud, role) values (${id}, ${email}, 'authenticated', 'authenticated')`;
    await sql`insert into users (id, email, name, branch_id, role, auth_provider, access_status, disabled_at)
              values (${id}, ${email}, ${key}, ${branchId}, 'admin', 'password',
                      ${key === 'pending_admin' ? 'pending' : 'approved'},
                      ${key === 'disabled_admin' ? new Date() : null})`;
    // Filed while they still had access: they must not see it now.
    const [report] = await sql<{ id: string }[]>`
      insert into bug_reports (title, description, created_by)
      values (${`Bug by ${key} ${tag}`}, 'What happened', ${id}) returning id`;
    reportIds.push(report!.id);
  }
  await sql`insert into bug_report_images (report_id, storage_path, file_name, mime_type, size_bytes, created_by)
            values (${reportOf.member}, ${`bugs/${reportOf.member}/${randomUUID()}.png`}, 'm.png', 'image/png', 10, ${userIds.member})`;
});

afterAll(async () => {
  const ids = Object.values(userIds);
  const all = await sql<
    { id: string }[]
  >`select id from bug_reports where created_by = any(${ids})`;
  for (const { id } of all) {
    const paths = await storage.listFolderObjects(storage.bugFolder(id)).catch(() => []);
    await storage.removeObjects(paths).catch(() => {});
  }
  await sql`delete from bug_reports where created_by = any(${ids})`; // cascades images
  await sql`delete from auth.users where id = any(${ids})`; // cascades users
  await sql`delete from branches where id = ${branchId}`;
  await sql.end();
});

beforeEach(() => notify.notifyBugReported.mockClear());

describe('migration', () => {
  test('updated_at is stamped on update', async () => {
    const [before] = await sql<{ updated_at: Date }[]>`
      select updated_at from bug_reports where id = ${reportOf.member}`;
    await sql`select pg_sleep(0.01)`;
    const [after] = await sql<{ updated_at: Date }[]>`
      update bug_reports set status = status where id = ${reportOf.member} returning updated_at`;
    expect(after!.updated_at.getTime()).toBeGreaterThan(before!.updated_at.getTime());
  });

  test('page_path must be a path', async () => {
    await expect(
      sql`insert into bug_reports (title, description, page_path, created_by)
          values ('x', 'y', 'https://x.example', ${userIds.member})`,
    ).rejects.toMatchObject({ code: '23514' });
  });
});

describe('RLS', () => {
  test.each(['member', 'contributor', 'music_leader'] as const)(
    'a %s files a report and reads only their own',
    async (role) => {
      expect(await visibleReports(role)).toEqual([reportOf[role]]);
      expect(
        await allowed(
          role,
          (tx) =>
            tx`insert into bug_reports (title, description, created_by) values ('x', 'y', ${userIds[role]})`,
        ),
      ).toBe(true);
      // Not as someone else.
      expect(
        await allowed(
          role,
          (tx) =>
            tx`insert into bug_reports (title, description, created_by) values ('x', 'y', ${userIds.admin})`,
        ),
      ).toBe(false);
      // No triage.
      expect(
        await allowed(
          role,
          (tx) => tx`update bug_reports set status = 'fixed' where id = ${reportOf[role]}`,
        ),
      ).toBe(false);
      expect(
        await allowed(role, (tx) => tx`delete from bug_reports where id = ${reportOf[role]}`),
      ).toBe(false);
      // Images follow the report.
      const images = await as(role, (tx) => tx`select 1 from bug_report_images`);
      expect(images.count > 0).toBe(role === 'member');
      expect(
        await allowed(
          role,
          (tx) => tx`delete from bug_report_images where report_id = ${reportOf.member}`,
        ),
      ).toBe(false);
    },
  );

  test('an admin reads, updates and deletes every report', async () => {
    expect((await visibleReports('admin')).sort()).toEqual([...reportIds].sort());
    expect(
      await allowed(
        'admin',
        (tx) =>
          tx`update bug_reports set status = 'confirmed', admin_note = 'n' where id = ${reportOf.member}`,
      ),
    ).toBe(true);
    expect(
      await allowed(
        'admin',
        (tx) => tx`delete from bug_report_images where report_id = ${reportOf.member}`,
      ),
    ).toBe(true);
    expect(
      await allowed('admin', (tx) => tx`delete from bug_reports where id = ${reportOf.member}`),
    ).toBe(true);
    expect(
      await allowed(
        'admin',
        (tx) => tx`select 1 from bug_report_images where report_id = ${reportOf.member}`,
      ),
    ).toBe(true);
  });

  test.each([...BLOCKED, 'anon'] as const)('%s gets nothing', async (who) => {
    expect(await visibleReports(who)).toEqual([]);
    expect(await allowed(who, (tx) => tx`select 1 from bug_report_images`)).toBe(false);
    if (who !== 'anon') {
      expect(
        await allowed(
          who,
          (tx) =>
            tx`insert into bug_reports (title, description, created_by) values ('x', 'y', ${userIds[who]})`,
        ),
      ).toBe(false);
    }
    expect(
      await allowed(
        who,
        (tx) => tx`update bug_reports set status = 'fixed' where id = any(${reportIds})`,
      ),
    ).toBe(false);
    expect(
      await allowed(who, (tx) => tx`delete from bug_reports where id = any(${reportIds})`),
    ).toBe(false);
  });

  test('image insert: only the report creator, only within 24 hours', async () => {
    expect(await allowed('member', (tx) => insertImage(tx, reportOf.member, userIds.member))).toBe(
      true,
    );
    // Someone else's report, even an admin.
    expect(
      await allowed('contributor', (tx) => insertImage(tx, reportOf.member, userIds.contributor)),
    ).toBe(false);
    expect(await allowed('admin', (tx) => insertImage(tx, reportOf.member, userIds.admin))).toBe(
      false,
    );
    // As someone else on your own report.
    expect(
      await allowed('member', (tx) => insertImage(tx, reportOf.member, userIds.contributor)),
    ).toBe(false);
    // After 24 hours.
    const [old] = await sql<{ id: string }[]>`
      insert into bug_reports (title, description, created_by, created_at)
      values (${`Old ${tag}`}, 'y', ${userIds.member}, now() - interval '25 hours') returning id`;
    expect(await allowed('member', (tx) => insertImage(tx, old!.id, userIds.member))).toBe(false);
    await sql`delete from bug_reports where id = ${old!.id}`;
  });

  test('deleting a report takes its images with it', async () => {
    const remaining = await as('admin', async (tx) => {
      await tx`delete from bug_reports where id = ${reportOf.member}`;
      const [row] = await tx<{ n: number }[]>`
        select count(*)::int as n from bug_report_images where report_id = ${reportOf.member}`;
      return row!.n;
    });
    expect(remaining).toBe(0);
  });
});

describe('server actions', () => {
  test('pending and disabled users are refused', async () => {
    actor = { ...appUser('admin'), id: userIds.pending_admin, accessStatus: 'pending' };
    expect(await server.createBugReport({ title: 'x', description: 'y' })).toMatchObject({
      ok: false,
      error: { code: 'FORBIDDEN' },
    });
    actor = {
      ...appUser('admin'),
      id: userIds.disabled_admin,
      disabledAt: new Date().toISOString(),
    };
    await expect(server.listMyBugReports()).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  test('a member files, uploads, reads; others cannot see it; an admin triages and deletes', async () => {
    const prevSha = process.env.VERCEL_GIT_COMMIT_SHA;
    process.env.VERCEL_GIT_COMMIT_SHA = 'abc123';
    actor = appUser('member');
    const created = ok(
      await server.createBugReport({
        title: `  Search ${tag} `,
        description: 'Nothing came back',
        expected: '',
        pagePath: '/library?q=joy',
        userAgent: 'UA',
        viewport: '390x844',
      }),
    );
    process.env.VERCEL_GIT_COMMIT_SHA = prevSha;
    reportIds.push(created.id);
    expect(created).toMatchObject({
      title: `Search ${tag}`,
      expected: null,
      pagePath: '/library?q=joy',
      viewport: '390x844',
      appVersion: 'abc123',
      status: 'new',
      createdByName: 'Bugs member',
      imageCount: 0,
    });
    expect(notify.notifyBugReported).toHaveBeenCalledWith({
      id: created.id,
      title: created.title,
      pagePath: '/library?q=joy',
      reporter: { id: actor.id, name: actor.name, email: actor.email },
    });

    // Screenshot upload, ADM-06's flow under bugs/.
    const ticket = ok(
      await server.createBugImageUpload(created.id, {
        fileName: 'screen.png',
        mimeType: 'image/png',
        sizeBytes: PNG.byteLength,
      }),
    );
    expect(ticket.uploadUrl).toContain(`bugs/${created.id}/`);
    expect(await server.finalizeBugImage(ticket.pendingId)).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION' },
    });
    await put(ticket.uploadUrl, PNG, 'image/png');
    const image = ok(await server.finalizeBugImage(ticket.pendingId));
    expect(image).toMatchObject({ reportId: created.id, fileName: 'screen.png' });
    expect(image.url).toMatch(/^http/);
    expect(ok(await server.finalizeBugImage(ticket.pendingId)).id).toBe(image.id);

    // Bytes that aren't the declared type are refused and removed.
    const fake = ok(
      await server.createBugImageUpload(created.id, {
        fileName: 'fake.png',
        mimeType: 'image/png',
        sizeBytes: 16,
      }),
    );
    await put(fake.uploadUrl, new Uint8Array(16), 'image/png');
    expect(await server.finalizeBugImage(fake.pendingId)).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION', message: expect.stringContaining('not a valid') },
    });

    const mine = await server.listMyBugReports();
    expect(mine.map((r) => r.id)).toContain(created.id);
    expect(mine.every((r) => r.createdBy === actor.id)).toBe(true);
    const detail = await server.getBugReport(created.id);
    expect(detail?.images.map((i) => i.id)).toEqual([image.id]);

    // Another user can't see it or add to it.
    actor = appUser('contributor');
    expect(await server.getBugReport(created.id)).toBeNull();
    expect(
      await server.createBugImageUpload(created.id, {
        fileName: 'x.png',
        mimeType: 'image/png',
        sizeBytes: 1,
      }),
    ).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
    expect(await server.updateBugReport(created.id, { status: 'fixed' })).toMatchObject({
      ok: false,
      error: { code: 'FORBIDDEN' },
    });

    // The admin triages.
    actor = appUser('admin');
    expect((await server.getBugReport(created.id))?.images).toHaveLength(1);
    expect((await server.listBugReports({ status: 'new' })).map((r) => r.id)).toContain(created.id);
    const open = await server.listOpenBugReports(50);
    expect(open.reports.map((r) => r.id)).toContain(created.id);
    expect(open.total).toBeGreaterThanOrEqual(1);
    const updated = ok(
      await server.updateBugReport(created.id, { status: 'fixed', adminNote: ' Fixed. ' }),
    );
    expect(updated).toMatchObject({ status: 'fixed', adminNote: 'Fixed.' });
    actor = appUser('member');
    expect((await server.getBugReport(created.id))?.adminNote).toBe('Fixed.');

    actor = appUser('admin');
    ok(await server.deleteBugReport(created.id));
    expect(await storage.listFolderObjects(storage.bugFolder(created.id))).toEqual([]);
    expect(await server.getBugReport(created.id)).toBeNull();
  });

  test('screenshots close 24 hours after the report', async () => {
    actor = appUser('music_leader');
    const [old] = await sql<{ id: string }[]>`
      insert into bug_reports (title, description, created_by, created_at)
      values (${`Old ${tag}`}, 'y', ${actor.id}, now() - interval '25 hours') returning id`;
    reportIds.push(old!.id);
    expect(
      await server.createBugImageUpload(old!.id, {
        fileName: 'x.png',
        mimeType: 'image/png',
        sizeBytes: 1,
      }),
    ).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
  });

  test('the 11th report in an hour is RATE_LIMITED', async () => {
    actor = appUser('contributor');
    const [row] = await sql<{ n: number }[]>`
      select count(*)::int as n from bug_reports
      where created_by = ${actor.id} and created_at > now() - interval '1 hour'`;
    for (let i = row!.n; i < 10; i++) {
      ok(await server.createBugReport({ title: `Burst ${i} ${tag}`, description: 'y' }));
    }
    expect(
      await server.createBugReport({ title: `Burst 11 ${tag}`, description: 'y' }),
    ).toMatchObject({ ok: false, error: { code: 'RATE_LIMITED' } });
  });
});
