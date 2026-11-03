import { ChevronRight, ImageIcon } from 'lucide-react';
import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/components/ui/utils';

import {
  FEATURE_REQUEST_STATUSES,
  KIND_LABEL,
  STATUS_LABEL,
  type FeatureRequest,
  type FeatureRequestStatus,
} from '../types';
import { formatDate, imageCountLabel } from './format';

export const REQUESTS_HREF = '/admin/requests';

export interface RequestListProps {
  requests: FeatureRequest[];
  status?: FeatureRequestStatus | 'all';
  /** Show at most this many, without the status filter (the /admin dashboard's preview). */
  limit?: number;
}

const STATUS_TONE: Record<FeatureRequestStatus, string> = {
  new: 'border-transparent bg-primary text-primary-foreground',
  planned: 'border-transparent bg-secondary text-secondary-foreground',
  in_progress: 'border-transparent bg-secondary text-secondary-foreground',
  done: 'text-muted-foreground',
  declined: 'text-muted-foreground',
};

export function StatusBadge({ status }: { status: FeatureRequestStatus }) {
  return (
    <Badge variant="outline" className={STATUS_TONE[status]}>
      {STATUS_LABEL[status]}
    </Badge>
  );
}

export function requestHref(id: string): string {
  return `${REQUESTS_HREF}/${id}`;
}

function filterHref(status: FeatureRequestStatus | 'all'): string {
  return status === 'all' ? REQUESTS_HREF : `${REQUESTS_HREF}?status=${status}`;
}

/**
 * Enhancement and change requests (ADM-06, REQ-ADM-02), newest first. With no `limit` it
 * offers the status filter as links (`?status=…`), so it works without client JavaScript.
 */
export function RequestList({ requests, status = 'all', limit }: RequestListProps) {
  const filtered = requests
    .filter((r) => status === 'all' || r.status === status)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit ?? Infinity);

  return (
    <div className="grid gap-3">
      {limit === undefined ? (
        <nav aria-label="Filter by status">
          <ul className="flex flex-wrap gap-2">
            {(['all', ...FEATURE_REQUEST_STATUSES] as const).map((s) => (
              <li key={s}>
                <Link
                  href={filterHref(s)}
                  aria-current={s === status ? 'page' : undefined}
                  className={cn(
                    'inline-flex min-h-tap items-center rounded-full border px-3 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring',
                    s === status
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'hover:bg-accent',
                  )}
                >
                  {s === 'all' ? 'All' : STATUS_LABEL[s]}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {status === 'all'
            ? 'No requests yet.'
            : `No ${STATUS_LABEL[status].toLowerCase()} requests.`}
        </p>
      ) : (
        <ul className="grid gap-2" aria-label="Requests">
          {filtered.map((r) => (
            <li key={r.id}>
              <Link
                href={requestHref(r.id)}
                className="flex min-h-tap items-start gap-3 rounded-lg border bg-card p-3 transition-colors outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring"
              >
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="font-medium break-words">{r.title}</span>
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <Badge variant="outline">{KIND_LABEL[r.kind]}</Badge>
                    <StatusBadge status={r.status} />
                    <span>{r.createdByName ?? 'Unknown'}</span>
                    <time dateTime={r.createdAt}>{formatDate(r.createdAt)}</time>
                    <span className="inline-flex items-center gap-1">
                      <ImageIcon aria-hidden className="size-3.5" />
                      {imageCountLabel(r.imageCount)}
                    </span>
                  </span>
                </span>
                <ChevronRight
                  aria-hidden
                  className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
