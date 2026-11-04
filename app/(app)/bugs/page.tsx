import { Bug } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { listMyBugReports } from '@/features/bugs/server';
import { BUGS_HREF, NEW_BUG_HREF } from '@/features/bugs/types';
import { BugReportList } from '@/features/bugs/ui/BugReportList';
import { BugsForbidden } from '@/features/bugs/ui/Forbidden';
import { requirePageUser } from '@/lib/auth';
import { can } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Your bug reports' };

/** Your bug reports (ADM-08): what you reported, its status and any note from the admins. */
export default async function MyBugReportsPage() {
  const user = await requirePageUser(BUGS_HREF);
  if (!can(user, 'bug:report')) return <BugsForbidden />;

  const reports = await listMyBugReports();

  return (
    <div className="mx-auto grid max-w-3xl gap-4 px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Your bug reports</h1>
        <Button asChild className="min-h-tap">
          <Link href={NEW_BUG_HREF}>
            <Bug aria-hidden /> Report a bug
          </Link>
        </Button>
      </div>
      <BugReportList reports={reports} />
    </div>
  );
}
