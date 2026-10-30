import { Skeleton } from '@/components/ui/skeleton';
import { POP_TOKEN } from '@/components/ui/tokens';
import { cn } from '@/components/ui/utils';
import type { Composer } from '@/types/domain';

export interface ComposerPanelProps {
  composers: Composer[];
}

/** POP colors for the panel surface: on-light shades, and the row shades in dark mode. */
const POP_PANEL_TEXT = {
  current: cn(POP_TOKEN.current.textOnLight, 'dark:text-pop-current'),
  past: cn(POP_TOKEN.past.textOnLight, 'dark:text-pop-past'),
} as const;

/**
 * Composer panel (REQ-ROW-02): every composer, in credit order. People of Praise members are
 * colored *and* labeled in text, so membership never depends on color alone (REQ-NF-03).
 */
export function ComposerPanel({ composers }: ComposerPanelProps) {
  if (composers.length === 0) {
    return <p className="text-sm text-muted-foreground">No composer recorded for this song.</p>;
  }
  return (
    <ul className="divide-y">
      {composers.map((c, i) => (
        <li key={c.id || `${i}-${c.name}`} className="flex flex-col py-2 first:pt-0 last:pb-0">
          {c.popMember === 'none' ? (
            <span className="font-medium">{c.name}</span>
          ) : (
            <>
              <span
                title={POP_TOKEN[c.popMember].title}
                data-pop={c.popMember}
                className={cn('font-medium', POP_PANEL_TEXT[c.popMember])}
              >
                {c.name}
              </span>
              <span className="text-xs text-muted-foreground">{POP_TOKEN[c.popMember].title}</span>
            </>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Placeholder while composers load. */
export function ComposerPanelSkeleton() {
  return (
    <div className="space-y-2" role="status" aria-busy="true" aria-label="Loading composers">
      <Skeleton className="h-5 w-40" />
      <Skeleton className="h-5 w-32" />
    </div>
  );
}
