import { cn } from '@/components/ui/utils';

export interface BranchCodeProps {
  code: string | null;
}

export function branchCodeLabel(code: string | null): string {
  return code === null ? 'Added by: branch unknown' : `Added by branch ${code}`;
}

/** Code of the branch that added the song, e.g. "OR" (REQ-ROW-01). */
export function BranchCode({ code }: BranchCodeProps) {
  const label = branchCodeLabel(code);
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex min-w-7 items-center justify-center text-xs font-semibold tracking-wide uppercase',
        code === null && 'opacity-70',
      )}
    >
      {code ?? '—'}
    </span>
  );
}
