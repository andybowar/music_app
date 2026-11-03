import { ChevronRight } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { unstable_rethrow } from 'next/navigation';

import { adminAreasFor, ADMIN_HREF } from '@/features/admin/adminAreas';
import { listUsers } from '@/features/admin/server';
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

/**
 * Admin dashboard (ADM-05), reached from the account menu: one card per admin area the user
 * may open. Admins see Users, Branches and Themes; music leaders see Themes only.
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

  const pending = can(user, 'admin:users') ? await pendingCount() : null;

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
    </div>
  );
}
