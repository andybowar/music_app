import type { Metadata } from 'next';
import Link from 'next/link';

import { BUGS_HREF, NEW_BUG_HREF, pagePathFrom } from '@/features/bugs/types';
import { BugReportForm } from '@/features/bugs/ui/BugReportForm';
import { BugsForbidden } from '@/features/bugs/ui/Forbidden';
import { requirePageUser } from '@/lib/auth';
import { can } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Report a bug' };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/**
 * Report a bug (ADM-08), opened from the account menu with `?from=<the page you were on>`.
 * `from` is used only when it is a same-origin path.
 */
export default async function NewBugReportPage({ searchParams }: Props) {
  const pagePath = pagePathFrom((await searchParams).from);
  const next = pagePath ? `${NEW_BUG_HREF}?from=${encodeURIComponent(pagePath)}` : NEW_BUG_HREF;
  const user = await requirePageUser(next);
  if (!can(user, 'bug:report')) return <BugsForbidden />;

  return (
    <div className="mx-auto grid max-w-3xl gap-4 px-4 py-6">
      <nav aria-label="Breadcrumb" className="text-sm">
        <Link href={BUGS_HREF} className="text-muted-foreground underline-offset-4 hover:underline">
          Your bug reports
        </Link>
      </nav>
      <div className="grid gap-1">
        <h1 className="text-xl font-semibold">Report a bug</h1>
        <p className="text-sm text-muted-foreground">
          Tell us what went wrong. The admins get your report and you can follow it under your bug
          reports.
        </p>
      </div>
      <BugReportForm pagePath={pagePath} />
    </div>
  );
}
