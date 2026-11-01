// Sentry test endpoint (OPS-02; CR OPS-02-instrumentation-client). Lets the owner trigger a
// server error on staging to check reporting:
//   curl -H "Authorization: Bearer $CRON_SECRET" https://<staging>/api/debug/sentry
// Without the right bearer token it answers 404, so it doesn't reveal that it exists.
import { isAuthorized } from './authorize';

export const dynamic = 'force-dynamic';

export function GET(request: Request): Response {
  if (!isAuthorized(request.headers.get('authorization'), process.env.CRON_SECRET)) {
    return new Response('Not found', { status: 404 });
  }
  // Thrown on purpose: instrumentation.ts `onRequestError` reports it to Sentry.
  throw new Error('Sentry test error');
}
