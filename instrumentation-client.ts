// Sentry for the browser (OPS-02; CR OPS-02-instrumentation-client). No-op unless
// NEXT_PUBLIC_SENTRY_DSN is set. Next.js loads this file for both webpack and Turbopack
// builds (it replaces the old `sentry.client.config.ts`).
// Static `process.env.NEXT_PUBLIC_*` references so Next inlines them at build time;
// NEXT_PUBLIC_VERCEL_ENV comes from Vercel's system environment variables.
import * as Sentry from '@sentry/nextjs';

import { readDsn, sharedOptions } from './sentry.shared.config';

const dsn = readDsn(process.env.NEXT_PUBLIC_SENTRY_DSN);

if (dsn) {
  Sentry.init(sharedOptions(dsn, process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV));
}

// Records client-side navigations as Sentry spans (no-op without a DSN).
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
