// @vitest-environment node
// Unit: the "new bug report" email (ADM-08) with a fake query builder and a mocked lib/email.
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
vi.mock('@/lib/db', () => ({ getDb: () => ({ select: () => chain() }) }));

const { notifyBugReported } = await import('./notify');

const NOTICE = {
  id: '10000000-0000-4000-8000-000000000001',
  title: 'Search is broken',
  pagePath: '/library',
  reporter: { id: 'u1', name: 'Mia Member', email: 'mia@example.test' },
};

beforeEach(() => {
  queue.length = 0;
  vi.clearAllMocks();
});

describe('notifyBugReported', () => {
  it('BCCs every admin once, with a link to the report', async () => {
    queue.push([{ email: 'A@example.test ' }, { email: 'a@example.test' }, { email: 'b@x.test' }]);
    sendEmail.mockResolvedValue({ delivered: true });
    expect(await notifyBugReported(NOTICE)).toBe(true);
    const input = sendEmail.mock.calls[0]![0];
    expect(input.bcc).toEqual(['a@example.test', 'b@x.test']);
    expect(input.subject).toBe('Bug report: Search is broken');
    const react = input.react;
    if (!isValidElement(react)) throw new Error('no element');
    expect((react as ReactElement<Record<string, unknown>>).props).toMatchObject({
      title: 'Search is broken',
      pagePath: '/library',
      reporter: NOTICE.reporter,
      url: `https://app.example.test/admin/bugs/${NOTICE.id}`,
    });
  });

  it('sends nothing when there is no other admin', async () => {
    queue.push([]);
    expect(await notifyBugReported(NOTICE)).toBe(false);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
  });

  it('never throws: a failed send is reported and returns false', async () => {
    queue.push([{ email: 'a@example.test' }]);
    sendEmail.mockRejectedValue(new Error('smtp down'));
    expect(await notifyBugReported(NOTICE)).toBe(false);
    expect(reportError).toHaveBeenCalledWith(expect.any(Error), {
      handler: 'notifyBugReported',
      reportId: NOTICE.id,
    });
  });

  it('never throws: a failed lookup is reported', async () => {
    queue.push(new Error('db down'));
    expect(await notifyBugReported(NOTICE)).toBe(false);
    expect(reportError).toHaveBeenCalled();
  });
});
