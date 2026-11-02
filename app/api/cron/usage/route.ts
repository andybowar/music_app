// Nightly derived branch usage (BR-03; REQ-BR-02; contracts/api.md). Vercel Cron calls this
// with `Authorization: Bearer $CRON_SECRET` (schedule in vercel.json). Manual run:
//   curl -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/cron/usage
import { env } from '@/lib/env';
import { runUsageJob } from '@/lib/usage/job';

import { isAuthorized } from './authorize';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  if (!isAuthorized(request.headers.get('authorization'), env.CRON_SECRET)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { updated } = await runUsageJob();
  return Response.json({ updated });
}
