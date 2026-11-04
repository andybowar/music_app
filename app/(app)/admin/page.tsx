import { ChevronRight, Plus } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { unstable_rethrow } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Toaster } from '@/components/ui/sonner';
import { adminAreasFor, ADMIN_HREF } from '@/features/admin/adminAreas';
import { listRequests, listTodos } from '@/features/admin/backlog/server';
import type { AdminTodo, FeatureRequest } from '@/features/admin/backlog/types';
import { BacklogTodos } from '@/features/admin/backlog/ui/BacklogTodos';
import { RequestList, REQUESTS_HREF } from '@/features/admin/backlog/ui/RequestList';
import { SectionError } from '@/features/admin/backlog/ui/RouteStates';
import { listUsers } from '@/features/admin/server';
import { listOpenBugReports } from '@/features/bugs/server';
import { ADMIN_BUGS_HREF, type BugReport } from '@/features/bugs/types';
import { BugReportList } from '@/features/bugs/ui/BugReportList';
import { requirePageUser } from '@/lib/auth';
import { reportError } from '@/lib/log';
import { can } from '@/lib/permissions';

// Per-user, per-request data: never prerender.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Admin' };

/** Pending access requests, or `null` when they can't be counted (the card still links). */
async function pendingCount(): Promise<number | null> {
  try {
    return (await listUsers({ accessStatus: 'pending' })).length;
  } catch (e) {
    unstable_rethrow(e);
    reportError(e, { where: '(app)/admin pendingCount' });
    return null;
  }
}

/** The backlog's to-dos, or `null` when they couldn't be loaded (that section shows an error). */
async function loadTodos(): Promise<AdminTodo[] | null> {
  try {
    const result = await listTodos();
    if (result.ok) return result.data;
    reportError(new Error(result.error.message), { where: '(app)/admin listTodos' });
    return null;
  } catch (e) {
    unstable_rethrow(e);
    reportError(e, { where: '(app)/admin listTodos' });
    return null;
  }
}

/** The 5 newest requests, or `null` when they couldn't be loaded. */
async function loadRequests(): Promise<FeatureRequest[] | null> {
  try {
    return (await listRequests()).slice(0, DASHBOARD_REQUESTS);
  } catch (e) {
    unstable_rethrow(e);
    reportError(e, { where: '(app)/admin listRequests' });
    return null;
  }
}

const DASHBOARD_REQUESTS = 5;

/** The 5 newest open (new or confirmed) bug reports and the open count, or `null` on failure. */
async function loadBugReports(): Promise<{ reports: BugReport[]; total: number } | null> {
  try {
    return await listOpenBugReports(DASHBOARD_BUGS);
  } catch (e) {
    unstable_rethrow(e);
    reportError(e, { where: '(app)/admin listOpenBugReports' });
    return null;
  }
}

const DASHBOARD_BUGS = 5;

/**
 * Admin dashboard (ADM-05), reached from the account menu: one card per admin area the user
 * may open. Admins see Users, Branches and Themes; music leaders see Themes only. Below the
 * cards, users with `admin:backlog` (admins) get the To-dos and Enhancement requests sections
 * (ADM-06); with `bug:triage` (admins) the newest open bug reports follow (ADM-08). Each
 * section shows its own error state if its data fails to load.
 */
export default async function AdminPage() {
  const user = await requirePageUser(ADMIN_HREF);
  const areas = adminAreasFor(user);

  if (areas.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <p className="text-sm font-medium text-muted-foreground">403</p>
        <h1 className="mt-1 text-xl font-semibold">You don&apos;t have access to this page</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Only admins and music leaders can open admin tools. Ask an admin if you need a different
          role.
        </p>
      </div>
    );
  }

  const backlog = can(user, 'admin:backlog');
  const triage = can(user, 'bug:triage');
  const [pending, todos, requests, bugs] = await Promise.all([
    can(user, 'admin:users') ? pendingCount() : null,
    backlog ? loadTodos() : null,
    backlog ? loadRequests() : null,
    triage ? loadBugReports() : null,
  ]);

  return (
    <div className="mx-auto grid max-w-3xl gap-4 px-4 py-6">
      <h1 className="text-xl font-semibold">Admin</h1>
      <ul className="grid gap-3 sm:grid-cols-2" aria-label="Admin areas">
        {areas.map((area) => (
          <li key={area.id}>
            <Link
              href={area.href}
              className="flex h-full min-h-tap items-start gap-3 rounded-lg border bg-card p-4 transition-colors outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring"
            >
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="flex items-center gap-2 font-medium">
                  {area.title}
                  {area.id === 'users' && pending ? (
                    <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
                      {pending} pending
                    </span>
                  ) : null}
                </span>
                <span className="text-sm text-muted-foreground">{area.description}</span>
              </span>
              <ChevronRight aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>

      {backlog ? (
        <>
          <section aria-labelledby="admin-todos" className="grid gap-3 rounded-lg border p-4">
            <h2 id="admin-todos" className="text-lg font-semibold">
              To-dos
            </h2>
            {todos ? <BacklogTodos todos={todos} /> : <SectionError what="the to-dos" />}
          </section>

          <section aria-labelledby="admin-requests" className="grid gap-3 rounded-lg border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="admin-requests" className="text-lg font-semibold">
                Enhancement requests
              </h2>
              <Button asChild size="sm" className="min-h-tap">
                <Link href={`${REQUESTS_HREF}/new`}>
                  <Plus aria-hidden /> New request
                </Link>
              </Button>
            </div>
            {requests ? (
              <RequestList requests={requests} limit={DASHBOARD_REQUESTS} />
            ) : (
              <SectionError what="the requests" />
            )}
            <Link
              href={REQUESTS_HREF}
              className="justify-self-start text-sm font-medium underline-offset-4 hover:underline"
            >
              View all requests
            </Link>
          </section>
          <Toaster />
        </>
      ) : null}

      {triage ? (
        <section aria-labelledby="admin-bugs" className="grid gap-3 rounded-lg border p-4">
          <h2 id="admin-bugs" className="flex flex-wrap items-center gap-2 text-lg font-semibold">
            Bug reports
            {bugs ? (
              <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
                {bugs.total} open
              </span>
            ) : null}
          </h2>
          {bugs ? (
            bugs.reports.length > 0 ? (
              <BugReportList reports={bugs.reports} admin limit={DASHBOARD_BUGS} />
            ) : (
              <p className="text-sm text-muted-foreground">No open bug reports.</p>
            )
          ) : (
            <SectionError what="the bug reports" />
          )}
          <Link
            href={ADMIN_BUGS_HREF}
            className="justify-self-start text-sm font-medium underline-offset-4 hover:underline"
          >
            View all bug reports
          </Link>
        </section>
      ) : null}
    </div>
  );
}
