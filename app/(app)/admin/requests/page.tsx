import { Plus } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { listRequests } from '@/features/admin/backlog/server';
import {
  FEATURE_REQUEST_STATUSES,
  type FeatureRequestStatus,
} from '@/features/admin/backlog/types';
import { BacklogForbidden } from '@/features/admin/backlog/ui/Forbidden';
import { RequestList, REQUESTS_HREF } from '@/features/admin/backlog/ui/RequestList';
import { requirePageUser } from '@/lib/auth';
import { can } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Requests · Admin' };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

function parseStatus(raw: string | string[] | undefined): FeatureRequestStatus | 'all' {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return (FEATURE_REQUEST_STATUSES as readonly string[]).includes(value ?? '')
    ? (value as FeatureRequestStatus)
    : 'all';
}

/** Admin › Requests (ADM-06): every enhancement and change request, filterable by status. */
export default async function RequestsPage({ searchParams }: Props) {
  const user = await requirePageUser(REQUESTS_HREF);
  if (!can(user, 'admin:backlog')) return <BacklogForbidden />;

  const status = parseStatus((await searchParams).status);
  const requests = await listRequests();

  return (
    <div className="mx-auto grid max-w-3xl gap-4 px-4 py-6">
      <nav aria-label="Breadcrumb" className="text-sm">
        <Link href="/admin" className="text-muted-foreground underline-offset-4 hover:underline">
          Admin
        </Link>
      </nav>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Enhancement requests</h1>
        <Button asChild className="min-h-tap">
          <Link href={`${REQUESTS_HREF}/new`}>
            <Plus aria-hidden /> New request
          </Link>
        </Button>
      </div>
      <RequestList requests={requests} status={status} />
    </div>
  );
}
