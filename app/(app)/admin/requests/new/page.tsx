import type { Metadata } from 'next';
import Link from 'next/link';

import { BacklogForbidden } from '@/features/admin/backlog/ui/Forbidden';
import { RequestForm } from '@/features/admin/backlog/ui/RequestForm';
import { REQUESTS_HREF } from '@/features/admin/backlog/ui/RequestList';
import { requirePageUser } from '@/lib/auth';
import { can } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'New request · Admin' };

/** Admin › Requests › New (ADM-06): the request form with the wireframe uploader. */
export default async function NewRequestPage() {
  const user = await requirePageUser(`${REQUESTS_HREF}/new`);
  if (!can(user, 'admin:backlog')) return <BacklogForbidden />;

  return (
    <div className="mx-auto grid max-w-3xl gap-4 px-4 py-6">
      <nav aria-label="Breadcrumb" className="text-sm">
        <Link
          href={REQUESTS_HREF}
          className="text-muted-foreground underline-offset-4 hover:underline"
        >
          Enhancement requests
        </Link>
      </nav>
      <h1 className="text-xl font-semibold">New request</h1>
      <RequestForm />
    </div>
  );
}
