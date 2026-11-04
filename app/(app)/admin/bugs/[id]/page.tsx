import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Toaster } from '@/components/ui/sonner';
import { getBugReport } from '@/features/bugs/server';
import { ADMIN_BUGS_HREF, bugHref } from '@/features/bugs/types';
import { BugReportDetail } from '@/features/bugs/ui/BugReportDetail';
import { BugsForbidden } from '@/features/bugs/ui/Forbidden';
import { requirePageUser } from '@/lib/auth';
import { can } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Bug report · Admin' };

type Props = { params: Promise<{ id: string }> };

/** Admin › Bug reports › one report, with triage controls (ADM-08). Unknown ids are a 404. */
export default async function AdminBugReportPage({ params }: Props) {
  const { id } = await params;
  const user = await requirePageUser(bugHref(id, true));
  if (!can(user, 'bug:triage')) return <BugsForbidden admin />;

  const report = await getBugReport(id);
  if (!report) notFound();

  return (
    <div className="mx-auto grid max-w-3xl gap-4 px-4 py-6">
      <nav aria-label="Breadcrumb" className="text-sm">
        <Link
          href={ADMIN_BUGS_HREF}
          className="text-muted-foreground underline-offset-4 hover:underline"
        >
          Bug reports
        </Link>
      </nav>
      <BugReportDetail report={report} admin />
      <Toaster />
    </div>
  );
}
