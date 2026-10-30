import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const { captureException } = vi.hoisted(() => ({ captureException: vi.fn() }));
vi.mock('@sentry/nextjs', () => ({ captureException }));

import {
  isSensitiveKey,
  log,
  REDACTED,
  reportError,
  scrub,
  scrubString,
  serializeError,
} from './log';

describe('isSensitiveKey', () => {
  test.each([
    'lyrics',
    'Lyrics',
    'lyricsText',
    'verse_1',
    'verse1',
    'verse5',
    'chorus',
    'bridge',
    'chorus_line',
    'chorusLine',
    'verse1Line',
    'firstLine',
    'notes',
    'energy_notes',
    'email',
    'userEmail',
    'password',
    'newPassword',
    'token',
    'share_token',
    'access_token',
    'cookie',
    'set-cookie',
    'authorization',
    'Authorization',
    'x-forwarded-for',
    'ip_address',
    'username',
    'client_secret',
    'apiKey',
  ])('%s is sensitive', (key) => expect(isSensitiveKey(key)).toBe(true));

  test.each(['id', 'title', 'songId', 'code', 'handler', 'chordChorus', 'energy', 'level', 'msg'])(
    '%s is not sensitive',
    (key) => expect(isSensitiveKey(key)).toBe(false),
  );
});

describe('scrubString', () => {
  test('masks email addresses', () => {
    expect(scrubString('no user for Jane.Doe+x@example.org, retry')).toBe(
      'no user for [email], retry',
    );
  });

  test('masks Drizzle query params', () => {
    const msg =
      'Failed query: insert into songs (title, lyrics) values ($1, $2)\nparams: Amazing,{"chorus":"la la"}';
    expect(scrubString(msg)).toBe(
      `Failed query: insert into songs (title, lyrics) values ($1, $2)\nparams: ${REDACTED}`,
    );
  });

  test('masks Postgres failing-row details', () => {
    expect(scrubString('Failing row contains (1, Amazing, la la la).')).toBe(
      `Failing row contains ${REDACTED}`,
    );
  });

  test('masks share tokens and auth query params', () => {
    expect(scrubString('https://app.test/share/abc123?x=1')).toBe(
      'https://app.test/share/[token]?x=1',
    );
    expect(scrubString('/auth/callback?code=xyz&next=/library')).toBe(
      `/auth/callback?code=${REDACTED}&next=/library`,
    );
    expect(scrubString('/reset#access_token=a.b.c&type=recovery')).toBe(
      `/reset#access_token=${REDACTED}&type=recovery`,
    );
  });

  test('leaves ordinary text alone', () => {
    expect(scrubString('Song not found: 42')).toBe('Song not found: 42');
  });
});

describe('scrub', () => {
  test('redacts sensitive keys deeply and masks strings, without mutating input', () => {
    const input = {
      songId: 's1',
      title: 'Amazing Grace',
      lyrics: { chorus: 'how sweet the sound', verse_1: 'that saved' },
      nested: [{ email: 'a@b.co', note: 'from a@b.co' }],
      empty: { password: null, token: undefined },
    };
    const copy = structuredClone(input);
    expect(scrub(input)).toEqual({
      songId: 's1',
      title: 'Amazing Grace',
      lyrics: REDACTED,
      nested: [{ email: REDACTED, note: 'from [email]' }],
      empty: { password: null, token: undefined },
    });
    expect(input).toEqual(copy);
  });

  test('passes primitives and dates through', () => {
    const d = new Date(0);
    expect(scrub(3)).toBe(3);
    expect(scrub(null)).toBeNull();
    expect(scrub(undefined)).toBeUndefined();
    expect(scrub(true)).toBe(true);
    expect(scrub(d)).toBe(d);
  });

  test('handles circular references and deep nesting', () => {
    const a: Record<string, unknown> = { id: 1 };
    a.self = a;
    expect(scrub(a)).toEqual({ id: 1, self: '[circular]' });

    let deep: Record<string, unknown> = { leaf: true };
    for (let i = 0; i < 20; i++) deep = { child: deep };
    expect(JSON.stringify(scrub(deep))).toContain('[truncated]');
  });

  test('repeated (non-circular) references are kept', () => {
    const shared = { id: 'x' };
    expect(scrub({ a: shared, b: shared })).toEqual({ a: { id: 'x' }, b: { id: 'x' } });
  });

  test('serializes errors and stringifies class instances', () => {
    const err = new Error('lookup failed for a@b.co');
    const out = scrub({ err, url: new URL('https://x.test/share/tok') }) as unknown as {
      err: { name: string; message: string; stack?: string };
      url: string;
    };
    expect(out.err.name).toBe('Error');
    expect(out.err.message).toBe('lookup failed for [email]');
    expect(out.err.stack).not.toContain('a@b.co');
    expect(out.url).toBe('https://x.test/share/[token]');
  });

  test('null-prototype objects are walked', () => {
    const o = Object.assign(Object.create(null) as object, { email: 'a@b.co', id: 1 });
    expect(scrub(o)).toEqual({ email: REDACTED, id: 1 });
  });
});

describe('serializeError', () => {
  test('includes cause chain', () => {
    const err = new Error('outer', { cause: new TypeError('inner') });
    const out = serializeError(err);
    expect(out).toMatchObject({
      name: 'Error',
      message: 'outer',
      cause: { name: 'TypeError', message: 'inner' },
    });
  });

  test('handles non-errors', () => {
    expect(serializeError('boom')).toEqual({ name: 'NonError', message: 'boom' });
    expect(serializeError({ a: 1 })).toEqual({ name: 'NonError', message: '{"a":1}' });
    expect(serializeError(undefined)).toEqual({ name: 'NonError', message: 'undefined' });
    const circ: Record<string, unknown> = {};
    circ.self = circ;
    expect(serializeError(circ)).toEqual({ name: 'NonError', message: '[object Object]' });
  });

  test('omits stack when absent', () => {
    const err = new Error('x');
    err.stack = undefined;
    expect(serializeError(err)).toEqual({ name: 'Error', message: 'x' });
  });
});

// One spy per console method, shared by every block (spying twice replaces the first).
const spies = {
  debug: vi.spyOn(console, 'debug'),
  info: vi.spyOn(console, 'info'),
  warn: vi.spyOn(console, 'warn'),
  error: vi.spyOn(console, 'error'),
};

describe('log', () => {
  beforeEach(() => {
    for (const s of Object.values(spies)) s.mockImplementation(() => {});
  });
  afterEach(() => {
    for (const s of Object.values(spies)) s.mockClear();
    vi.unstubAllEnvs();
  });

  const lastLine = (spy: (typeof spies)[keyof typeof spies]) =>
    JSON.parse(String(spy.mock.calls.at(-1)?.[0])) as Record<string, unknown>;

  test.each(['debug', 'info', 'warn', 'error'] as const)(
    '%s writes one scrubbed JSON line',
    (level) => {
      log[level]('saved song for a@b.co', { songId: 's1', lyrics: { chorus: 'x' } });
      expect(spies[level]).toHaveBeenCalledOnce();
      const line = lastLine(spies[level]);
      expect(line).toMatchObject({
        level,
        msg: 'saved song for [email]',
        songId: 's1',
        lyrics: REDACTED,
      });
      expect(typeof line.time).toBe('string');
    },
  );

  test('fields cannot override level/time/msg', () => {
    log.info('real', { level: 'error', msg: 'fake', time: 'never' });
    const line = lastLine(spies.info);
    expect(line.level).toBe('info');
    expect(line.msg).toBe('real');
    expect(line.time).not.toBe('never');
  });

  test('works without fields', () => {
    log.warn('plain');
    expect(lastLine(spies.warn)).toMatchObject({ level: 'warn', msg: 'plain' });
  });

  test('debug is dropped in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    log.debug('noisy');
    expect(spies.debug).not.toHaveBeenCalled();
  });
});

describe('reportError', () => {
  const consoleError = spies.error;
  beforeEach(() => {
    consoleError.mockImplementation(() => {});
    captureException.mockReset();
  });
  afterEach(() => consoleError.mockClear());

  test('logs a scrubbed line and sends the error to Sentry with scrubbed context', () => {
    const err = new Error('insert failed\nparams: secret lyrics');
    reportError(err, { handler: 'withAction', email: 'a@b.co' });

    const line = JSON.parse(String(consoleError.mock.calls[0]?.[0])) as Record<string, unknown>;
    expect(line).toMatchObject({
      level: 'error',
      msg: 'unhandled error',
      handler: 'withAction',
      email: REDACTED,
      err: { name: 'Error', message: `insert failed\nparams: ${REDACTED}` },
    });
    expect(captureException).toHaveBeenCalledWith(err, {
      tags: { handler: 'withAction' },
      extra: { handler: 'withAction', email: REDACTED },
    });
  });

  test('works without context', () => {
    reportError('boom');
    expect(captureException).toHaveBeenCalledWith('boom', {});
    expect(consoleError).toHaveBeenCalledOnce();
  });
});
