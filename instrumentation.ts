// Next.js instrumentation hook (OPS-02): loads the Sentry config for the active
// server runtime and reports errors thrown while handling requests (RSC render,
// route handlers, server actions, middleware). Both are no-ops without a DSN.
import * as Sentry from '@sentry/nextjs';

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') await import('./sentry.server.config');
  if (process.env.NEXT_RUNTIME === 'edge') await import('./sentry.edge.config');
}

export const onRequestError = Sentry.captureRequestError;
