import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Toaster } from '@/components/ui/sonner';
import { getRequest } from '@/features/admin/backlog/server';
import { BacklogForbidden } from '@/features/admin/backlog/ui/Forbidden';
import { RequestDetail } from '@/features/admin/backlog/ui/RequestDetail';
import { REQUESTS_HREF, requestHref } from '@/features/admin/backlog/ui/RequestList';
import { requirePageUser } from '@/lib/auth';
import { can } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Request · Admin' };

type Props = { params: Promise<{ id: string }> };

/** Admin › Requests › one request (ADM-06). Unknown ids are a 404. */
export default async function RequestPage({ params }: Props) {
  const { id } = await params;
  const user = await requirePageUser(requestHref(id));
  if (!can(user, 'admin:backlog')) return <BacklogForbidden />;

  const request = await getRequest(id);
  if (!request) notFound();

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
      <RequestDetail request={request} />
      <Toaster />
    </div>
  );
}
