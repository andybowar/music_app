import { ChevronRight, ImageIcon } from 'lucide-react';
import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/components/ui/utils';
import { formatDate } from '@/features/admin/backlog/ui/format';

import {
  ADMIN_BUGS_HREF,
  BUG_REPORT_STATUSES,
  BUG_STATUS_LABEL,
  bugHref,
  type BugReport,
  type BugReportStatus,
} from '../types';

export interface BugReportListProps {
  reports: BugReport[];
  /** Admin view: shows the reporter, links to /admin/bugs and offers the status filter. */
  admin?: boolean;
  status?: BugReportStatus | 'all';
  /** Show at most this many, without the status filter (the /admin dashboard's preview). */
  limit?: number;
}

const STATUS_TONE: Record<BugReportStatus, string> = {
  new: 'border-transparent bg-primary text-primary-foreground',
  confirmed: 'border-transparent bg-secondary text-secondary-foreground',
  fixed: 'text-muted-foreground',
  wont_fix: 'text-muted-foreground',
  duplicate: 'text-muted-foreground',
};

/** The status as text (never colour alone). */
export function BugStatusBadge({ status }: { status: BugReportStatus }) {
  return (
    <Badge variant="outline" className={STATUS_TONE[status]}>
      {BUG_STATUS_LABEL[status]}
    </Badge>
  );
}

/** "1 screenshot", "3 screenshots". */
export function screenshotCountLabel(n: number): string {
  return `${n} ${n === 1 ? 'screenshot' : 'screenshots'}`;
}

function filterHref(status: BugReportStatus | 'all'): string {
  return status === 'all' ? ADMIN_BUGS_HREF : `${ADMIN_BUGS_HREF}?status=${status}`;
}

/**
 * Bug reports newest first (ADM-08, REQ-ADM-03): a reporter's own on /bugs, everyone's on
 * /admin/bugs. The admin view without `limit` offers the status filter as links
 * (`?status=…`), so it works without client JavaScript.
 */
export function BugReportList({
  reports,
  admin = false,
  status = 'all',
  limit,
}: BugReportListProps) {
  const filtered = reports
    .filter((r) => status === 'all' || r.status === status)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit ?? Infinity);

  const empty = !admin
    ? "You haven't reported any bugs."
    : status === 'all'
      ? 'No bug reports yet.'
      : `No bug reports marked ${BUG_STATUS_LABEL[status].toLowerCase()}.`;

  return (
    <div className="grid gap-3">
      {admin && limit === undefined ? (
        <nav aria-label="Filter by status">
          <ul className="flex flex-wrap gap-2">
            {(['all', ...BUG_REPORT_STATUSES] as const).map((s) => (
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
                  {s === 'all' ? 'All' : BUG_STATUS_LABEL[s]}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="grid gap-2" aria-label="Bug reports">
          {filtered.map((r) => (
            <li key={r.id}>
              <Link
                href={bugHref(r.id, admin)}
                className="flex min-h-tap items-start gap-3 rounded-lg border bg-card p-3 transition-colors outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring"
              >
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="font-medium break-words">{r.title}</span>
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <BugStatusBadge status={r.status} />
                    {admin ? <span>{r.createdByName ?? 'Unknown'}</span> : null}
                    <time dateTime={r.createdAt}>{formatDate(r.createdAt)}</time>
                    <span className="inline-flex items-center gap-1">
                      <ImageIcon aria-hidden className="size-3.5" />
                      {screenshotCountLabel(r.imageCount)}
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
