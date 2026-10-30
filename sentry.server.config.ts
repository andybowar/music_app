// Sentry for the Node.js server runtime. Loaded from instrumentation.ts `register()`.
// No-op unless SENTRY_DSN is set (local dev, CI and tests run without it).
// SENTRY_DSN is read directly rather than via `env` (lib/env.ts) because reading
// any server variable there validates the whole group, which would make startup
// depend on unrelated secrets.
import * as Sentry from '@sentry/nextjs';

import { readDsn, sharedOptions } from './sentry.shared.config';

const dsn = readDsn(process.env.SENTRY_DSN);

if (dsn) {
  Sentry.init(sharedOptions(dsn, process.env.VERCEL_ENV ?? process.env.NODE_ENV));
}
