// Sentry for the Edge runtime (middleware, edge routes). Loaded from instrumentation.ts.
// No-op unless SENTRY_DSN is set (local dev, CI and tests run without it).
// Read directly rather than via `env` (lib/env.ts): see sentry.server.config.ts.
import * as Sentry from '@sentry/nextjs';

import { readDsn, sharedOptions } from './sentry.shared.config';

const dsn = readDsn(process.env.SENTRY_DSN);

if (dsn) {
  Sentry.init(sharedOptions(dsn, process.env.VERCEL_ENV ?? process.env.NODE_ENV));
}
