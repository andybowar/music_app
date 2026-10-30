import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/components/ui/utils';
import type { BranchUsage, UsageLevel } from '@/types/domain';

export interface UsagePanelProps {
  addedByBranchCode: string | null;
  usage: BranchUsage[];
}

/** Display text and bar count (out of 3) for each usage level. */
export const USAGE_LEVEL_DISPLAY: Record<UsageLevel, { label: string; bars: number }> = {
  high: { label: 'High', bars: 3 },
  low: { label: 'Low', bars: 2 },
  rare: { label: 'Rare', bars: 1 },
  none: { label: 'Not used', bars: 0 },
};

const BAR_HEIGHT = ['h-1.5', 'h-2.5', 'h-4'] as const;

function Bars({ count }: { count: number }) {
  return (
    <span aria-hidden="true" className="flex h-4 items-end gap-0.5">
      {BAR_HEIGHT.map((h, i) => (
        <span
          key={h}
          className={cn(
            'w-1 rounded-sm',
            h,
            i < count ? 'bg-foreground' : 'bg-muted-foreground/25',
          )}
        />
      ))}
    </span>
  );
}

/**
 * Branch usage panel (REQ-ROW-02), opened from the branch code: which branch added the song and
 * how much each branch uses it. Levels are text plus bars, never bars alone (REQ-NF-03).
 */
export function UsagePanel({ addedByBranchCode, usage }: UsagePanelProps) {
  return (
    <div className="space-y-3">
      <p className="text-sm">
        <span className="text-muted-foreground">Added by </span>
        {addedByBranchCode === null ? (
          <span className="text-muted-foreground">unknown branch</span>
        ) : (
          <span className="font-semibold uppercase">{addedByBranchCode}</span>
        )}
      </p>
      {usage.length === 0 ? (
        <p className="text-sm text-muted-foreground">No branch usage recorded yet.</p>
      ) : (
        <table className="w-full text-sm">
          <caption className="sr-only">Usage by branch</caption>
          <thead className="sr-only">
            <tr>
              <th scope="col">Branch</th>
              <th scope="col">Usage</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {usage.map((u) => {
              const meta = USAGE_LEVEL_DISPLAY[u.level];
              return (
                <tr key={u.branchId} data-level={u.level}>
                  <th scope="row" className="py-2 pr-3 text-left font-semibold uppercase">
                    {u.branchCode}
                  </th>
                  <td className="py-2">
                    <span className="flex items-center justify-end gap-2">
                      <span className={cn(u.level === 'none' && 'text-muted-foreground')}>
                        {meta.label}
                        {u.source === 'derived' && (
                          <span
                            className="text-xs text-muted-foreground"
                            title="Worked out from setlist history"
                          >
                            {' '}
                            (from setlists)
                          </span>
                        )}
                      </span>
                      <Bars count={meta.bars} />
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

/** Placeholder while branch usage loads. */
export function UsagePanelSkeleton() {
  return (
    <div className="space-y-3" role="status" aria-busy="true" aria-label="Loading branch usage">
      <Skeleton className="h-4 w-28" />
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-6 w-full" />
      ))}
    </div>
  );
}
