import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { getRequest } from '@/features/admin/backlog/server';
import { BacklogForbidden } from '@/features/admin/backlog/ui/Forbidden';
import { RequestForm } from '@/features/admin/backlog/ui/RequestForm';
import { requestHref } from '@/features/admin/backlog/ui/RequestList';
import { requirePageUser } from '@/lib/auth';
import { can } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Edit request · Admin' };

type Props = { params: Promise<{ id: string }> };

/** Admin › Requests › Edit (ADM-06). Unknown ids are a 404. */
export default async function EditRequestPage({ params }: Props) {
  const { id } = await params;
  const user = await requirePageUser(`${requestHref(id)}/edit`);
  if (!can(user, 'admin:backlog')) return <BacklogForbidden />;

  const request = await getRequest(id);
  if (!request) notFound();

  return (
    <div className="mx-auto grid max-w-3xl gap-4 px-4 py-6">
      <nav aria-label="Breadcrumb" className="text-sm">
        <Link
          href={requestHref(request.id)}
          className="text-muted-foreground underline-offset-4 hover:underline"
        >
          Back to the request
        </Link>
      </nav>
      <h1 className="text-xl font-semibold">Edit request</h1>
      <RequestForm request={request} />
    </div>
  );
}
