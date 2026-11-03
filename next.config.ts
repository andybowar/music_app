import type { NextConfig } from 'next';

import { withSentryConfig } from '@sentry/nextjs/config';
import withSerwistInit from '@serwist/next';

// H-01: PWA service worker (app/sw.ts → public/sw.js, a build artifact). Webpack only, so it is
// off in `next dev --turbopack`; `next build` / `next start` exercise it. Registration is
// injected into the client entry. No reload on reconnect: it would drop unsaved edits.
const withSerwist = withSerwistInit({
  swSrc: 'app/sw.ts',
  swDest: 'public/sw.js',
  swUrl: '/sw.js',
  register: true,
  reloadOnOnline: false,
  cacheOnNavigation: false,
  globPublicPatterns: ['icons/**/*'],
  disable: process.env.NODE_ENV === 'development',
});

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Playwright and Supabase auth redirects use 127.0.0.1 rather than localhost.
  allowedDevOrigins: ['127.0.0.1'],
  experimental: {
    serverActions: {
      // Uploads go straight to Storage via signed URLs; actions only carry metadata.
      bodySizeLimit: '2mb',
    },
  },
};

// OPS-02: Sentry build integration. Source maps upload only when SENTRY_AUTH_TOKEN
// (+ SENTRY_ORG / SENTRY_PROJECT) is set, i.e. in the Vercel build; local and CI
// builds skip it. Runtime reporting is configured in sentry.*.config.ts.
export default withSentryConfig(withSerwist(nextConfig), {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  telemetry: false,
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
  release: { create: Boolean(process.env.SENTRY_AUTH_TOKEN) },
});
