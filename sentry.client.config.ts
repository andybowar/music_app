// Sentry for the browser. No-op unless NEXT_PUBLIC_SENTRY_DSN is set.
// Static `process.env.NEXT_PUBLIC_*` references so Next inlines them at build time;
// NEXT_PUBLIC_VERCEL_ENV comes from Vercel's system environment variables.
// Loaded by the webpack build (`next build`). Turbopack (`next dev --turbopack`)
// only loads `instrumentation-client.ts`, see
// agent-spec/change-requests/OPS-02-instrumentation-client.md.
import * as Sentry from '@sentry/nextjs';

import { readDsn, sharedOptions } from './sentry.shared.config';

const dsn = readDsn(process.env.NEXT_PUBLIC_SENTRY_DSN);

if (dsn) {
  Sentry.init(sharedOptions(dsn, process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV));
}
