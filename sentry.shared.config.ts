/**
 * Options shared by the server, edge and client Sentry configs (OPS-02).
 *
 * Every event, transaction and breadcrumb passes through `scrubEvent` /
 * `scrubBreadcrumb` before it leaves the process, so lyrics, emails, request
 * bodies, cookies and share tokens never reach Sentry (see `scrub` in lib/log).
 *
 * No runtime import of `@sentry/nextjs` here, so this stays pure and unit-testable.
 */

import type { Breadcrumb, Event } from '@sentry/nextjs';

import { scrub } from '@/lib/log';

/** Request headers worth keeping; everything else (cookie, authorization, IPs) is dropped. */
const SAFE_HEADERS = new Set(['user-agent', 'referer', 'content-type', 'accept', 'host']);

type SentryRequest = NonNullable<Event['request']>;

function scrubRequest(request: SentryRequest): SentryRequest {
  // Request bodies (`data`: server-action form posts carry lyrics), cookies and raw
  // env are dropped outright rather than filtered.
  const { data: _data, cookies: _cookies, env: _env, headers, ...rest } = request;
  const out: SentryRequest = scrub(rest);
  if (headers) {
    const kept = Object.fromEntries(
      Object.entries(headers).filter(([name]) => SAFE_HEADERS.has(name.toLowerCase())),
    );
    out.headers = scrub(kept);
  }
  return out;
}

/** `beforeSend` / `beforeSendTransaction`: returns a scrubbed copy of the event. */
export function scrubEvent<E extends Event>(event: E): E {
  const { user, request, ...rest } = event;
  const out = scrub(rest) as E;
  // Keep only the opaque user id so issues can be grouped by user without PII.
  if (user?.id !== undefined) out.user = { id: user.id };
  if (request) out.request = scrubRequest(request);
  return out;
}

export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb {
  return scrub(breadcrumb);
}

/** Treat blank strings as unset so `SENTRY_DSN=` in .env.local keeps Sentry off. */
export function readDsn(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function sharedOptions(dsn: string, environment: string | undefined) {
  return {
    dsn,
    environment: environment ?? 'development',
    // Never attach IPs, cookies or request bodies automatically.
    sendDefaultPii: false,
    // Errors only (REQ-NF-04); performance tracing can be enabled later.
    tracesSampleRate: 0,
    beforeSend: scrubEvent,
    beforeSendTransaction: scrubEvent,
    beforeBreadcrumb: scrubBreadcrumb,
  } as const;
}
