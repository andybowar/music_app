import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { getBugReport } from '@/features/bugs/server';
import { BUGS_HREF, bugHref } from '@/features/bugs/types';
import { BugReportDetail } from '@/features/bugs/ui/BugReportDetail';
import { BugsForbidden } from '@/features/bugs/ui/Forbidden';
import { requirePageUser } from '@/lib/auth';
import { can } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Bug report' };

type Props = { params: Promise<{ id: string }> };

/** One of your bug reports (ADM-08). Unknown ids and other people's reports are a 404. */
export default async function MyBugReportPage({ params }: Props) {
  const { id } = await params;
  const user = await requirePageUser(bugHref(id));
  if (!can(user, 'bug:report')) return <BugsForbidden />;

  const report = await getBugReport(id);
  if (!report || report.createdBy !== user.id) notFound();

  return (
    <div className="mx-auto grid max-w-3xl gap-4 px-4 py-6">
      <nav aria-label="Breadcrumb" className="text-sm">
        <Link href={BUGS_HREF} className="text-muted-foreground underline-offset-4 hover:underline">
          Your bug reports
        </Link>
      </nav>
      <BugReportDetail report={report} />
    </div>
  );
}
