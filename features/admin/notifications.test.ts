// @vitest-environment node
// Unit: access request emails (ADM-04) with a fake query builder and a mocked lib/email.
// The real round trip through the database and Mailpit is in notifications.int.test.ts.
import { isValidElement, type ReactElement } from 'react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/env', () => ({ env: { APP_URL: 'https://app.example.test/' } }));

const reportError = vi.fn();
const warn = vi.fn();
vi.mock('@/lib/log', () => ({
  reportError: (...a: unknown[]) => reportError(...a),
  log: { warn: (...a: unknown[]) => warn(...a) },
}));

const sendEmail = vi.fn<(input: Record<string, unknown>) => Promise<{ delivered: boolean }>>();
vi.mock('@/lib/email', () => ({
  sendEmail: (input: Record<string, unknown>) => sendEmail(input),
}));

/** Fake Drizzle db: each awaited select chain resolves to the next queued result. */
const queue: unknown[] = [];
function chain(): object {
  const proxy: object = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === 'then') {
          const result = queue.shift() ?? [];
          return (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
            result instanceof Error ? reject(result) : resolve(result);
        }
        return () => proxy;
      },
    },
  );
  return proxy;
}
const select = vi.fn(() => chain());
vi.mock('@/lib/db', () => ({ getDb: () => ({ select }) }));

const { notifyAccessApproved, notifyAccessRequested } = await import('./notifications');

const REQUESTER = {
  id: '44444444-4444-4444-8444-444444444444',
  email: 'new.person@example.test',
  name: 'New Person',
  authProvider: 'google' as const,
  branchId: '22222222-2222-4222-8222-222222222222',
};

function sentProps(): Record<string, unknown> {
  const input = sendEmail.mock.calls[0]?.[0];
  const react = input?.react;
  if (!isValidElement(react)) throw new Error('no email element');
  return (react as ReactElement<Record<string, unknown>>).props;
}

beforeEach(() => {
  queue.length = 0;
  select.mockClear();
  sendEmail.mockReset();
  sendEmail.mockResolvedValue({ delivered: true });
  reportError.mockReset();
  warn.mockReset();
});

describe('notifyAccessRequested', () => {
  it('BCCs every admin once with the request details and the review link', async () => {
    // Admin emails (order of Promise.all: admins first, then branch).
    queue.push(
      [
        { email: 'admin.one@example.test' },
        { email: 'Admin.One@example.test ' },
        { email: 'admin.two@example.test' },
      ],
      [{ name: 'Example Branch', code: 'EXB' }],
    );
    expect(await notifyAccessRequested(REQUESTER)).toBe(true);

    expect(sendEmail).toHaveBeenCalledTimes(1);
    const input = sendEmail.mock.calls[0]![0];
    expect(input.bcc).toEqual(['admin.one@example.test', 'admin.two@example.test']);
    expect(input.to).toBeUndefined();
    expect(input.subject).toBe('Access request from New Person');
    expect(sentProps()).toEqual({
      requester: REQUESTER,
      branchName: 'Example Branch (EXB)',
      url: 'https://app.example.test/admin/users',
    });
  });

  it('skips the branch lookup when there is no suggested branch', async () => {
    queue.push([{ email: 'admin@example.test' }]);
    expect(await notifyAccessRequested({ ...REQUESTER, branchId: null })).toBe(true);
    expect(select).toHaveBeenCalledTimes(1);
    expect(sentProps().branchName).toBeNull();
  });

  it('sends nothing when there is no active admin', async () => {
    queue.push([], []);
    expect(await notifyAccessRequested(REQUESTER)).toBe(false);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('no active admin'), {
      userId: REQUESTER.id,
    });
  });

  it('reports false when SMTP is not configured and the message was only logged', async () => {
    queue.push([{ email: 'admin@example.test' }], []);
    sendEmail.mockResolvedValue({ delivered: false });
    expect(await notifyAccessRequested(REQUESTER)).toBe(false);
    expect(reportError).not.toHaveBeenCalled();
  });

  it('never throws when sending fails: reports the error and resolves false', async () => {
    queue.push([{ email: 'admin@example.test' }], []);
    const failure = new Error('SMTP connection refused');
    sendEmail.mockRejectedValue(failure);
    await expect(notifyAccessRequested(REQUESTER)).resolves.toBe(false);
    expect(reportError).toHaveBeenCalledWith(failure, {
      handler: 'notifyAccessRequested',
      userId: REQUESTER.id,
    });
  });

  it('never throws when the admin lookup fails', async () => {
    const failure = new Error('database unavailable');
    queue.push(failure, []);
    await expect(notifyAccessRequested(REQUESTER)).resolves.toBe(false);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(reportError).toHaveBeenCalledWith(failure, expect.anything());
  });
});

describe('notifyAccessApproved', () => {
  const approved = { email: 'new.person@example.test', name: 'New Person' };

  it('emails the user a sign-in link', async () => {
    expect(await notifyAccessApproved(approved)).toBe(true);
    const input = sendEmail.mock.calls[0]![0];
    expect(input.to).toBe('new.person@example.test');
    expect(input.subject).toBe('Your Worship Library account is ready');
    expect(sentProps()).toEqual({ name: 'New Person', url: 'https://app.example.test/login' });
  });

  it('never throws when sending fails: reports the error and resolves false', async () => {
    const failure = new Error('Daily user sending limit exceeded');
    sendEmail.mockRejectedValue(failure);
    await expect(notifyAccessApproved(approved)).resolves.toBe(false);
    expect(reportError).toHaveBeenCalledWith(failure, { handler: 'notifyAccessApproved' });
  });
});
