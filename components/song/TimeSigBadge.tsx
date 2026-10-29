import { cn } from '@/components/ui/utils';

export interface TimeSigBadgeProps {
  value: string | null;
}

export function timeSigLabel(value: string | null): string {
  return value === null ? 'Time signature not set' : `${value} time`;
}

/** Time signature, stacked like notation ("4" over "4") when it is `n/d` (REQ-ROW-01). */
export function TimeSigBadge({ value }: TimeSigBadgeProps) {
  const label = timeSigLabel(value);
  const parts = value === null ? null : /^(\d{1,2})\/(\d{1,2})$/.exec(value);
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex min-w-5 flex-col items-center justify-center text-xs leading-none font-semibold tabular-nums',
        value === null && 'opacity-70',
      )}
    >
      {parts ? (
        <>
          <span>{parts[1]}</span>
          <span>{parts[2]}</span>
        </>
      ) : (
        (value ?? '—')
      )}
    </span>
  );
}
