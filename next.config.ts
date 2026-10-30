import type { NextConfig } from 'next';

import { withSentryConfig } from '@sentry/nextjs/config';

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
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  telemetry: false,
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
  release: { create: Boolean(process.env.SENTRY_AUTH_TOKEN) },
});
