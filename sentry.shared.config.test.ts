import type { ErrorEvent } from '@sentry/nextjs';

import { describe, expect, test } from 'vitest';

import { REDACTED } from '@/lib/log';

import { readDsn, scrubBreadcrumb, scrubEvent, sharedOptions } from './sentry.shared.config';

describe('scrubEvent (beforeSend)', () => {
  const event: ErrorEvent = {
    type: undefined,
    event_id: 'e1',
    message: 'failed for jane@example.org',
    user: { id: 'u1', email: 'jane@example.org', username: 'jane', ip_address: '1.2.3.4' },
    request: {
      url: 'https://app.test/share/secret-token?x=1',
      method: 'POST',
      data: { lyrics: { chorus: 'how sweet' } },
      cookies: { 'sb-access-token': 'abc' },
      headers: {
        cookie: 'sb=abc',
        authorization: 'Bearer abc',
        'x-forwarded-for': '1.2.3.4',
        'User-Agent': 'Firefox',
        referer: 'https://app.test/auth/callback?code=xyz',
      },
      query_string: 'token=abc&page=2',
      env: { REMOTE_ADDR: '1.2.3.4' },
    },
    exception: {
      values: [
        {
          type: 'Error',
          value:
            'Failed query: update songs set lyrics = $1\nparams: {"verse_1":"once I was lost"}',
        },
      ],
    },
    extra: { song: { id: 's1', title: 'Grace', lyrics: { chorus: 'x' }, chorusLine: 'x' } },
    contexts: { action: { email: 'a@b.co', songId: 's1' } },
    tags: { handler: 'withAction' },
    breadcrumbs: [
      { category: 'console', message: 'saving for a@b.co', data: { notes: 'private' } },
    ],
  };

  const out = scrubEvent(event);
  const json = JSON.stringify(out);

  test('no lyrics, emails, tokens or IPs survive anywhere', () => {
    for (const secret of [
      'how sweet',
      'once I was lost',
      'jane@example.org',
      'a@b.co',
      'secret-token',
      'abc',
      'xyz',
      '1.2.3.4',
      'private',
      'jane',
    ]) {
      expect(json).not.toContain(secret);
    }
  });

  test('keeps only the user id', () => {
    expect(out.user).toEqual({ id: 'u1' });
  });

  test('drops request body, cookies, env and unsafe headers', () => {
    expect(out.request).toEqual({
      url: 'https://app.test/share/[token]?x=1',
      method: 'POST',
      query_string: `token=${REDACTED}&page=2`,
      headers: {
        'User-Agent': 'Firefox',
        referer: `https://app.test/auth/callback?code=${REDACTED}`,
      },
    });
    expect(out.request).not.toHaveProperty('data');
    expect(out.request).not.toHaveProperty('cookies');
    expect(out.request).not.toHaveProperty('env');
  });

  test('keeps non-PII context useful for debugging', () => {
    expect(out.event_id).toBe('e1');
    expect(out.tags).toEqual({ handler: 'withAction' });
    expect(out.extra).toEqual({
      song: { id: 's1', title: 'Grace', lyrics: REDACTED, chorusLine: REDACTED },
    });
    expect(out.contexts).toEqual({ action: { email: REDACTED, songId: 's1' } });
    expect(out.message).toBe('failed for [email]');
    expect(out.exception?.values?.[0]?.value).toBe(
      `Failed query: update songs set lyrics = $1\nparams: ${REDACTED}`,
    );
  });

  test('does not mutate the original event', () => {
    expect(event.user?.email).toBe('jane@example.org');
    expect(event.request?.data).toBeDefined();
  });

  test('events without user or request pass through', () => {
    expect(scrubEvent({ type: undefined, message: 'plain' })).toEqual({
      type: undefined,
      message: 'plain',
    });
  });

  test('a user without an id is dropped entirely', () => {
    expect(scrubEvent({ type: undefined, user: { email: 'a@b.co' } })).not.toHaveProperty('user');
  });

  test('a request without headers keeps no headers', () => {
    expect(scrubEvent({ type: undefined, request: { url: '/x' } }).request).toEqual({ url: '/x' });
  });
});

describe('scrubBreadcrumb', () => {
  test('scrubs message and data', () => {
    expect(
      scrubBreadcrumb({ message: 'POST /share/tok', data: { email: 'a@b.co', status: 500 } }),
    ).toEqual({ message: 'POST /share/[token]', data: { email: REDACTED, status: 500 } });
  });
});

describe('readDsn', () => {
  test('blank or missing means disabled', () => {
    expect(readDsn(undefined)).toBeUndefined();
    expect(readDsn('')).toBeUndefined();
    expect(readDsn('   ')).toBeUndefined();
    expect(readDsn(' https://k@o.ingest.sentry.io/1 ')).toBe('https://k@o.ingest.sentry.io/1');
  });
});

describe('sharedOptions', () => {
  test('never sends default PII and wires the scrubbers', () => {
    const opts = sharedOptions('https://k@o.ingest.sentry.io/1', 'preview');
    expect(opts).toMatchObject({
      dsn: 'https://k@o.ingest.sentry.io/1',
      environment: 'preview',
      sendDefaultPii: false,
      tracesSampleRate: 0,
      beforeSend: scrubEvent,
      beforeSendTransaction: scrubEvent,
      beforeBreadcrumb: scrubBreadcrumb,
    });
  });

  test('environment defaults to development', () => {
    expect(sharedOptions('dsn', undefined).environment).toBe('development');
  });
});
