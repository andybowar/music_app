import { Skeleton } from '@/components/ui/skeleton';

export interface ReminderPanelProps {
  chorusLine: string | null;
  verse1Line: string | null;
}

function present(line: string | null): string | null {
  const t = line?.trim();
  return t ? t : null;
}

/**
 * Reminder panel (REQ-ROW-02), opened from the song title: the first line of the chorus and of
 * verse 1, so a leader can tell which song this is.
 */
export function ReminderPanel({ chorusLine, verse1Line }: ReminderPanelProps) {
  const chorus = present(chorusLine);
  const verse = present(verse1Line);
  if (chorus === null && verse === null) {
    return <p className="text-sm text-muted-foreground">No lyrics recorded for this song yet.</p>;
  }
  const rows = [
    { label: 'Chorus', line: chorus, empty: 'No chorus' },
    { label: 'Verse 1', line: verse, empty: 'No verse 1' },
  ];
  return (
    <dl className="space-y-3">
      {rows.map((r) => (
        <div key={r.label}>
          <dt className="text-xs font-medium text-muted-foreground">{r.label}</dt>
          <dd className={r.line === null ? 'text-sm text-muted-foreground italic' : 'text-base'}>
            {r.line ?? r.empty}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Placeholder while the reminder lines load. */
export function ReminderPanelSkeleton() {
  return (
    <div className="space-y-3" role="status" aria-busy="true" aria-label="Loading lyrics reminder">
      {[0, 1].map((i) => (
        <div key={i} className="space-y-1">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-5 w-56 max-w-full" />
        </div>
      ))}
    </div>
  );
}
