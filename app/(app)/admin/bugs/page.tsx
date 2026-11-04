import type { Metadata } from 'next';
import Link from 'next/link';

import { listBugReports } from '@/features/bugs/server';
import { ADMIN_BUGS_HREF, isBugReportStatus, type BugReportStatus } from '@/features/bugs/types';
import { BugReportList } from '@/features/bugs/ui/BugReportList';
import { BugsForbidden } from '@/features/bugs/ui/Forbidden';
import { requirePageUser } from '@/lib/auth';
import { can } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Bug reports · Admin' };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

function parseStatus(raw: string | string[] | undefined): BugReportStatus | 'all' {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return isBugReportStatus(value) ? value : 'all';
}

/** Admin › Bug reports (ADM-08): every report, filterable by status. */
export default async function AdminBugReportsPage({ searchParams }: Props) {
  const user = await requirePageUser(ADMIN_BUGS_HREF);
  if (!can(user, 'bug:triage')) return <BugsForbidden admin />;

  const status = parseStatus((await searchParams).status);
  const reports = await listBugReports();

  return (
    <div className="mx-auto grid max-w-3xl gap-4 px-4 py-6">
      <nav aria-label="Breadcrumb" className="text-sm">
        <Link href="/admin" className="text-muted-foreground underline-offset-4 hover:underline">
          Admin
        </Link>
      </nav>
      <h1 className="text-xl font-semibold">Bug reports</h1>
      <BugReportList reports={reports} admin status={status} />
    </div>
  );
}
