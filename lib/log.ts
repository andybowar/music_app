/**
 * Structured logging + PII scrubbing (OPS-02, REQ-NF-04).
 *
 * - `log.debug|info|warn|error(msg, fields?)` writes one JSON line per call
 *   (`{ level, time, msg, ...fields }`) so Vercel/hosted log search can filter by
 *   field. Fields are scrubbed before they are written.
 * - `scrub(value)` is the single PII filter, shared with the Sentry `beforeSend`
 *   hooks (`sentry.shared.config.ts`): values under lyric/email/secret keys are
 *   replaced, and email addresses, SQL parameter dumps, share tokens and auth
 *   query params are masked inside any string.
 * - `reportError(error, context?)` logs an unexpected error and forwards it to
 *   Sentry. Sentry calls are no-ops until `Sentry.init` runs, which only happens
 *   when a DSN is configured, so this is safe in dev, CI and tests.
 *
 * Not `server-only`: the client Sentry config imports `scrub`.
 */

import { captureException } from '@sentry/nextjs';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogFields = Record<string, unknown>;

export const REDACTED = '[redacted]';

const normalizeKey = (key: string) => key.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Keys whose values are always dropped (compared after lowercasing and removing `_`/`-`). */
const SENSITIVE_EXACT = new Set([
  // Lyrics: SongLyrics sections and the derived first lines (types/domain.ts, DB columns).
  'chorus',
  'bridge',
  'verse1',
  'verse2',
  'verse3',
  'verse4',
  'verse5',
  'chorusline',
  'verse1line',
  'firstline',
  // Free text that may contain personal notes.
  'notes',
  'energynotes',
  // Identity / network.
  'username',
  'fullname',
  'displayname',
  'ipaddress',
  'ip',
  'xforwardedfor',
  'xrealip',
  'authorization',
  'apikey',
]);

/** Key fragments that mark a value as sensitive wherever they appear in the key. */
const SENSITIVE_FRAGMENTS = ['lyric', 'email', 'password', 'secret', 'token', 'cookie'];

export function isSensitiveKey(key: string): boolean {
  const k = normalizeKey(key);
  return SENSITIVE_EXACT.has(k) || SENSITIVE_FRAGMENTS.some((f) => k.includes(f));
}

const STRING_RULES: ReadonlyArray<readonly [RegExp, string]> = [
  // Drizzle "Failed query: …\nparams: <values>" — values can be lyrics or emails.
  [/(\bparams:\s*)[\s\S]*/gi, `$1${REDACTED}`],
  // Postgres constraint errors echo the whole row.
  [/(Failing row contains)[\s\S]*/g, `$1 ${REDACTED}`],
  [/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]'],
  // Public share links are bearer tokens.
  [/(\/share\/)[^/?#\s"'<>]+/g, '$1[token]'],
  [
    /((?:^|[?&#])(?:token|code|access_token|refresh_token|token_hash)=)[^&#\s"'<>]+/gi,
    `$1${REDACTED}`,
  ],
];

export function scrubString(input: string): string {
  return STRING_RULES.reduce((s, [pattern, replacement]) => s.replace(pattern, replacement), input);
}

const MAX_DEPTH = 12;

function isPlainObject(value: object): boolean {
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function scrubInner(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (typeof value === 'string') return scrubString(value);
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return '[circular]';
  if (depth >= MAX_DEPTH) return '[truncated]';
  seen.add(value);
  try {
    if (Array.isArray(value)) return value.map((v) => scrubInner(v, depth + 1, seen));
    if (value instanceof Error) return scrubInner(serializeError(value), depth, seen);
    if (value instanceof Date) return value;
    if (!isPlainObject(value)) return scrubString(String(value));
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value)) {
      out[key] =
        isSensitiveKey(key) && v !== null && v !== undefined
          ? REDACTED
          : scrubInner(v, depth + 1, seen);
    }
    return out;
  } finally {
    seen.delete(value);
  }
}

/**
 * Deep-copies `value` with PII removed. Never mutates its input. Errors become
 * `{ name, message, stack, cause? }`; other class instances are stringified.
 */
export function scrub<T>(value: T): T {
  return scrubInner(value, 0, new WeakSet()) as T;
}

export type SerializedError = { name: string; message: string; stack?: string; cause?: unknown };

export function serializeError(error: unknown): SerializedError {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      ...(error.stack ? { stack: error.stack } : {}),
      ...(error.cause !== undefined ? { cause: serializeError(error.cause) } : {}),
    };
  }
  return { name: 'NonError', message: typeof error === 'string' ? error : safeStringify(error) };
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

const WRITERS: Record<LogLevel, (line: string) => void> = {
  debug: (line) => console.debug(line),
  info: (line) => console.info(line),
  warn: (line) => console.warn(line),
  error: (line) => console.error(line),
};

function write(level: LogLevel, msg: string, fields?: LogFields): void {
  if (level === 'debug' && process.env.NODE_ENV === 'production') return;
  const entry = { ...scrub(fields), level, time: new Date().toISOString(), msg: scrubString(msg) };
  WRITERS[level](safeStringify(entry));
}

export const log = {
  debug: (msg: string, fields?: LogFields) => write('debug', msg, fields),
  info: (msg: string, fields?: LogFields) => write('info', msg, fields),
  warn: (msg: string, fields?: LogFields) => write('warn', msg, fields),
  error: (msg: string, fields?: LogFields) => write('error', msg, fields),
};

/** Log an unexpected error and report it to Sentry (no-op without a DSN). */
export function reportError(error: unknown, context?: LogFields): void {
  log.error('unhandled error', { ...context, err: error });
  const handler = context?.handler;
  captureException(error, {
    ...(typeof handler === 'string' ? { tags: { handler } } : {}),
    ...(context ? { extra: scrub(context) } : {}),
  });
}
