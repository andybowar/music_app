import { POP_TOKEN } from '@/components/ui/tokens';
import { cn } from '@/components/ui/utils';
import type { Composer } from '@/types/domain';

export type ComposerNameItem = Pick<Composer, 'name' | 'popMember'>;

export interface ComposerNameProps {
  composers: ComposerNameItem[];
  /** How many names to show before collapsing the rest into "+N". Default 2, minimum 1. */
  max?: number;
}

export const DEFAULT_MAX_COMPOSERS = 2;

/** "Name" or "Name (People of Praise member (current))" — used for overflow tooltips. */
function describe(c: ComposerNameItem): string {
  return c.popMember === 'none' ? c.name : `${c.name} (${POP_TOKEN[c.popMember].title})`;
}

/**
 * Composer names for the song row with POP-membership highlight (REQ-LIB-03). Past/current
 * members get the POP color *and* a `title` plus visually hidden text, so membership is never
 * conveyed by color alone (REQ-NF-03). Overflow collapses to "+N" whose tooltip lists the rest.
 */
export function ComposerName({ composers, max = DEFAULT_MAX_COMPOSERS }: ComposerNameProps) {
  if (composers.length === 0) {
    return (
      <span className="opacity-70" title="Composer unknown">
        <span aria-hidden="true">—</span>
        <span className="sr-only">Composer unknown</span>
      </span>
    );
  }

  const limit = Number.isFinite(max) ? Math.max(1, Math.floor(max)) : composers.length;
  const shown = composers.slice(0, limit);
  const hidden = composers.slice(limit);
  const hiddenText = hidden.map(describe).join(', ');

  return (
    <span className="min-w-0">
      {shown.map((c, i) => (
        <span key={`${i}-${c.name}`}>
          {i > 0 && ', '}
          {c.popMember === 'none' ? (
            c.name
          ) : (
            <span
              title={POP_TOKEN[c.popMember].title}
              data-pop={c.popMember}
              className={cn('font-medium', POP_TOKEN[c.popMember].text)}
            >
              {c.name}
              <span className="sr-only"> ({POP_TOKEN[c.popMember].title})</span>
            </span>
          )}
        </span>
      ))}
      {hidden.length > 0 && (
        <span title={hiddenText} data-overflow={hidden.length}>
          {' '}
          <span aria-hidden="true">+{hidden.length}</span>
          <span className="sr-only">
            and {hidden.length} more: {hiddenText}
          </span>
        </span>
      )}
    </span>
  );
}
