// @vitest-environment node
// Unit: sendShareEmail (SHR-03) with a fake query builder and a mocked lib/email. The real
// hourly count against audit_log is in shareEmail.int.test.ts.
import type { AppUser, Role } from '@/types/domain';

import { isValidElement, type ReactElement } from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ActionError } from '@/lib/action';

vi.mock('server-only', () => ({}));

const requireUser = vi.fn<() => Promise<AppUser>>();
vi.mock('@/lib/auth', () => ({ requireUser: () => requireUser() }));
vi.mock('@/lib/env', () => ({ env: { APP_URL: 'https://app.example.test/' } }));

const reportError = vi.fn();
vi.mock('@/lib/log', () => ({ reportError: (...a: unknown[]) => reportError(...a) }));

class EmailRateLimitError extends Error {}
const sendEmail = vi.fn<(input: Record<string, unknown>) => Promise<{ delivered: boolean }>>();
const isEmailConfigured = vi.fn(() => true);
vi.mock('@/lib/email', () => ({
  EmailRateLimitError,
  isEmailConfigured: () => isEmailConfigured(),
  sendEmail: (input: Record<string, unknown>) => sendEmail(input),
}));

/** Fake Drizzle db: each awaited chain resolves to the next queued result. */
const queue: unknown[] = [];
const chains: Array<Array<{ method: string; args: unknown[] }>> = [];
function chain(first: string, args: unknown[]) {
  const calls = [{ method: first, args }];
  chains.push(calls);
  const proxy: object = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === 'then') {
          const result = queue.shift() ?? [];
          return (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
            result instanceof Error ? reject(result) : resolve(result);
        }
        return (...a: unknown[]) => {
          calls.push({ method: String(prop), args: a });
          return proxy;
        };
      },
    },
  );
  return proxy;
}
const fakeDb = {
  select: (...a: unknown[]) => chain('select', a),
  insert: (...a: unknown[]) => chain('insert', a),
  update: (...a: unknown[]) => chain('update', a),
};
const getDb = vi.fn(() => fakeDb);
vi.mock('@/lib/db', () => ({ getDb: () => getDb() }));

const { sendShareEmail } = await import('./server');

const LIST = '11111111-1111-4111-8111-111111111111';
const BRANCH = '22222222-2222-4222-8222-222222222222';
const SHARE = '66666666-6666-4666-8666-666666666666';
const USER_ID = '44444444-4444-4444-8444-444444444444';
const OTHER_USER = '55555555-5555-4555-8555-555555555555';
const TOKEN = 'A'.repeat(43);

function makeUser(role: Role): AppUser {
  return {
    id: USER_ID,
    email: 'leader@example.test',
    name: 'Ana',
    branchId: BRANCH,
    role,
    authProvider: 'password',
    disabledAt: null,
    accessStatus: 'approved',
  };
}

const accessRow = (ownerId = USER_ID) => [{ type: 'setlist', ownerId, branchId: BRANCH }];
const countRow = (n: number) => [{ n }];
const shareRow = () => [
  {
    id: SHARE,
    listId: LIST,
    token: TOKEN,
    expiresAt: null,
    revokedAt: null,
    createdAt: new Date('2026-11-01T10:00:00Z'),
  },
];
const sharedListRow = () => [
  {
    id: LIST,
    type: 'setlist',
    name: 'Sunday worship',
    eventDate: '2026-11-08',
    ownerId: USER_ID,
    ownerName: 'Ana',
    branchId: BRANCH,
    branchCode: 'SER',
    createdAt: new Date('2026-11-01T10:00:00Z'),
    updatedAt: new Date('2026-11-01T10:00:00Z'),
  },
];

/** Queue a full happy path: access, count, createShare (access + insert), shared list, audit. */
function queueHappyPath({ sent = 0 } = {}) {
  queue.push(accessRow(), countRow(sent), accessRow(), shareRow(), sharedListRow(), [], []);
}

const RECIPIENTS = ['a@example.test', 'b@example.test'];
let user: AppUser;

beforeEach(() => {
  queue.length = 0;
  chains.length = 0;
  requireUser.mockReset();
  getDb.mockClear();
  sendEmail.mockReset().mockResolvedValue({ delivered: true });
  isEmailConfigured.mockReset().mockReturnValue(true);
  reportError.mockClear();
  user = makeUser('music_leader');
  requireUser.mockImplementation(async () => user);
});

afterEach(() => vi.unstubAllEnvs());

function inserts() {
  return chains.filter((c) => c[0]!.method === 'insert');
}

describe('sendShareEmail: input', () => {
  it('passes requireUser failures through', async () => {
    requireUser.mockRejectedValue(new ActionError('UNAUTHENTICATED', 'Sign in.'));
    expect(await sendShareEmail(LIST, RECIPIENTS)).toEqual({
      ok: false,
      error: { code: 'UNAUTHENTICATED', message: 'Sign in.' },
    });
    expect(getDb).not.toHaveBeenCalled();
  });

  it.each([
    ['a bad list id', 'nope', RECIPIENTS, 'listId'],
    ['no recipients', LIST, [], 'to'],
    ['a malformed address', LIST, ['a@example.test', 'not an email'], 'to.1'],
    ['not an array', LIST, 'a@example.test' as never, 'to'],
    [
      'more than 20 recipients',
      LIST,
      Array.from({ length: 21 }, (_, i) => `p${i}@example.test`),
      'to',
    ],
  ])('rejects %s', async (_label, listId, to, field) => {
    const result = await sendShareEmail(listId, to);
    expect(result).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
    expect((result as { error: { fieldErrors?: object } }).error.fieldErrors).toHaveProperty(field);
    expect(getDb).not.toHaveBeenCalled();
  });

  it('dedupes and normalizes addresses before counting the 20 limit', async () => {
    queueHappyPath();
    const to = [...Array.from({ length: 20 }, (_, i) => `p${i}@example.test`), ' P0@Example.test '];
    expect(await sendShareEmail(LIST, to)).toEqual({ ok: true, data: undefined });
    expect(sendEmail.mock.calls[0]![0].bcc).toHaveLength(20);
  });
});

describe('sendShareEmail: access', () => {
  it('hides lists the caller cannot read', async () => {
    queue.push([]);
    expect(await sendShareEmail(LIST, RECIPIENTS)).toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND' },
    });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('forbids members sharing a setlist they cannot write', async () => {
    user = makeUser('member');
    queue.push(accessRow(OTHER_USER));
    expect(await sendShareEmail(LIST, RECIPIENTS)).toMatchObject({
      ok: false,
      error: { code: 'FORBIDDEN' },
    });
    expect(sendEmail).not.toHaveBeenCalled();
  });
});

describe('sendShareEmail: sending', () => {
  it('emails the summary and link in BCC, replying to the sender, and records it', async () => {
    queueHappyPath();
    expect(await sendShareEmail(LIST, RECIPIENTS)).toEqual({ ok: true, data: undefined });

    const input = sendEmail.mock.calls[0]![0];
    expect(input).toMatchObject({
      bcc: RECIPIENTS,
      replyTo: 'leader@example.test',
      subject: 'Ana shared “Sunday worship” with you',
    });
    expect(input).not.toHaveProperty('to');
    const react = input.react as ReactElement<{ url: string; senderName: string }>;
    expect(isValidElement(react)).toBe(true);
    expect(react.props.url).toBe(`https://app.example.test/share/${TOKEN}`);
    expect(react.props.senderName).toBe('Ana');

    const [, audit] = inserts();
    const values = audit!.find((c) => c.method === 'values')!.args[0];
    expect(values).toEqual({
      actorId: USER_ID,
      entity: 'share_email',
      entityId: LIST,
      action: 'create',
      diff: { recipients: { from: null, to: 2 } },
    });
    expect(JSON.stringify(values)).not.toContain('@example.test');
  });

  it('mints a fresh never-expiring link through createShare, never reading stored tokens', async () => {
    queueHappyPath();
    expect(await sendShareEmail(LIST, RECIPIENTS)).toEqual({ ok: true, data: undefined });
    const [shareInsert] = inserts();
    const values = shareInsert!.find((c) => c.method === 'values')!.args[0];
    expect(values).toMatchObject({ listId: LIST, createdBy: USER_ID, expiresAt: null });
    expect(inserts()).toHaveLength(2);
    // No select reads from `shares` other than the public read by token.
    const selects = chains.filter((c) => c[0]!.method === 'select');
    expect(selects).toHaveLength(5);
  });

  it('returns RATE_LIMITED after 10 emails in the last hour, without sending', async () => {
    queue.push(accessRow(), countRow(10));
    expect(await sendShareEmail(LIST, RECIPIENTS)).toMatchObject({
      ok: false,
      error: { code: 'RATE_LIMITED' },
    });
    expect(sendEmail).not.toHaveBeenCalled();
    expect(inserts()).toHaveLength(0);
  });

  it('allows the 10th email', async () => {
    queueHappyPath({ sent: 9 });
    expect(await sendShareEmail(LIST, RECIPIENTS)).toEqual({ ok: true, data: undefined });
  });

  it('maps the SMTP sending limit to RATE_LIMITED and does not count it', async () => {
    queueHappyPath();
    sendEmail.mockRejectedValue(new EmailRateLimitError('quota'));
    expect(await sendShareEmail(LIST, RECIPIENTS)).toMatchObject({
      ok: false,
      error: { code: 'RATE_LIMITED' },
    });
    // Only the link was inserted; the failed send is not counted.
    expect(inserts()).toHaveLength(1);
  });

  it('reports other send failures as INTERNAL', async () => {
    queueHappyPath();
    sendEmail.mockRejectedValue(new Error('535 bad login'));
    expect(await sendShareEmail(LIST, RECIPIENTS)).toMatchObject({
      ok: false,
      error: { code: 'INTERNAL', message: 'Something went wrong. Please try again.' },
    });
  });

  it('still succeeds when recording the send fails', async () => {
    queue.push(
      accessRow(),
      countRow(0),
      accessRow(),
      shareRow(),
      sharedListRow(),
      [],
      new Error('db down'),
    );
    expect(await sendShareEmail(LIST, RECIPIENTS)).toEqual({ ok: true, data: undefined });
    expect(reportError).toHaveBeenCalledWith(expect.any(Error), { handler: 'sendShareEmail' });
  });

  it('refuses on a production build without SMTP', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    isEmailConfigured.mockReturnValue(false);
    queue.push(accessRow());
    expect(await sendShareEmail(LIST, RECIPIENTS)).toMatchObject({
      ok: false,
      error: { code: 'INTERNAL', message: expect.stringContaining('Email isn') },
    });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('logs instead of failing outside production without SMTP', async () => {
    isEmailConfigured.mockReturnValue(false);
    sendEmail.mockResolvedValue({ delivered: false });
    queueHappyPath();
    expect(await sendShareEmail(LIST, RECIPIENTS)).toEqual({ ok: true, data: undefined });
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });
});
