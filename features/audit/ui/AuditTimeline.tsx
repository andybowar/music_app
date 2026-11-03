import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { AuditEntry } from '@/types/domain';

import { describeChanges, entryTitle, type FieldChange } from '../format';

export interface AuditTimelineProps {
  entries: AuditEntry[];
  /** Shown under the list when the trail was cut at the server's limit. */
  truncated?: boolean;
  /** Formats timestamps; defaults to the browser's locale. Injected by tests for stable output. */
  formatDate?(iso: string): string;
}

function defaultFormatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function Change({ change }: { change: FieldChange }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 sm:flex-row sm:gap-3">
      <dt className="shrink-0 text-muted-foreground sm:w-40">{change.label}</dt>
      <dd className="min-w-0 break-words">
        {change.kind === 'sections' ? (
          <>Changed {change.sections.join(', ')}</>
        ) : change.from === null ? (
          <>
            <span className="sr-only">Set to </span>
            {change.to}
          </>
        ) : change.to === null ? (
          <>
            <span className="sr-only">Removed </span>
            <del className="text-muted-foreground">{change.from}</del>
          </>
        ) : (
          <>
            <span className="sr-only">Changed from </span>
            <del className="text-muted-foreground">{change.from}</del>
            <span aria-hidden> → </span>
            <span className="sr-only"> to </span>
            <ins className="no-underline">{change.to}</ins>
          </>
        )}
      </dd>
    </div>
  );
}

/**
 * Change history as a timeline, newest first (LIB-19; REQ-LIB-12): who, when, what changed, with
 * the changed fields of each entry. Presentational; `SongHistory` loads the entries.
 */
export function AuditTimeline({
  entries,
  truncated = false,
  formatDate = defaultFormatDate,
}: AuditTimelineProps) {
  if (entries.length === 0) {
    return (
      <p className="rounded-lg border p-4 text-sm text-muted-foreground">
        No changes recorded yet.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <ol className="flex flex-col" aria-label="Change history">
        {entries.map((entry) => {
          const changes = describeChanges(entry);
          return (
            <li
              key={entry.id}
              className="relative border-l-2 border-border pb-5 pl-4 last:pb-0"
              data-entity={entry.entity}
            >
              <span
                aria-hidden
                className="absolute top-1.5 -left-[5px] size-2 rounded-full bg-muted-foreground"
              />
              <article className="flex min-w-0 flex-col gap-1.5">
                <h3 className="text-sm font-semibold break-words">{entryTitle(entry)}</h3>
                <p className="text-xs text-muted-foreground">
                  <span className="break-words">{entry.actorName}</span>
                  <span aria-hidden> · </span>
                  <span className="sr-only">, </span>
                  <time dateTime={entry.createdAt}>{formatDate(entry.createdAt)}</time>
                </p>
                {changes.length > 0 ? (
                  <dl className="mt-1 flex flex-col gap-1.5 rounded-md bg-muted/50 p-2 text-sm">
                    {changes.map((c) => (
                      <Change key={c.field} change={c} />
                    ))}
                  </dl>
                ) : null}
              </article>
            </li>
          );
        })}
      </ol>
      {truncated ? (
        <p className="text-xs text-muted-foreground">
          Showing the latest {entries.length} changes.
        </p>
      ) : null}
    </div>
  );
}

/** Loading state for the timeline. */
export function AuditTimelineSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div aria-busy="true" className="flex flex-col gap-5">
      <span className="sr-only" role="status">
        Loading change history…
      </span>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex flex-col gap-2 border-l-2 pl-4">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-3 w-1/3" />
          <Skeleton className="h-12 w-full" />
        </div>
      ))}
    </div>
  );
}

/** Error state with a retry button. */
export function AuditTimelineError({ message, onRetry }: { message?: string; onRetry(): void }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-3 rounded-lg border p-4">
      <div>
        <p className="text-sm font-medium">Couldn&apos;t load the change history</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {message ?? 'Something went wrong. Please try again.'}
        </p>
      </div>
      <Button type="button" variant="outline" className="min-h-tap" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}
