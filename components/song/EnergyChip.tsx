import { ENERGY_RING, ENERGY_TOKEN, ROW_TOKEN } from '@/components/ui/tokens';
import { cn } from '@/components/ui/utils';
import { ENERGY_META, type EnergyLevel } from '@/types/domain';

/** Tooltip/announcement for a value set on a setlist item rather than on the song. */
export const OVERRIDDEN_HINT = 'set for this event';

/** Styling shared by atoms whose value can be overridden per event (dotted underline). */
export const OVERRIDDEN_CLASS = 'underline decoration-dotted decoration-2 underline-offset-4';

export interface EnergyChipProps {
  energy: EnergyLevel | null;
  bpm: number | null;
  overridden?: boolean;
}

/** Accessible label `${bpm} BPM, ${ENERGY_META.label}` (REQ-NF-03), with fallbacks for nulls. */
export function energyChipLabel({ energy, bpm, overridden = false }: EnergyChipProps): string {
  const tempo = bpm === null ? 'Tempo not set' : `${bpm} BPM`;
  const level = energy === null ? 'energy not set' : ENERGY_META[energy].label;
  return `${tempo}, ${level}${overridden ? `, ${OVERRIDDEN_HINT}` : ''}`;
}

/**
 * BPM on an energy-colored chip (REQ-ROW-01). Energy is never color-only: the label is both the
 * accessible name and the hover tooltip. Presentational only; SongRow wraps it in its own button.
 */
export function EnergyChip({ energy, bpm, overridden = false }: EnergyChipProps) {
  const label = energyChipLabel({ energy, bpm, overridden });
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      data-energy={energy ?? 'none'}
      data-overridden={overridden || undefined}
      className={cn(
        'inline-flex h-7 min-w-11 items-center justify-center px-1.5 text-sm font-semibold tabular-nums',
        ROW_TOKEN.chipRadius,
        energy === null
          ? 'bg-transparent text-row-foreground ring-1 ring-row-foreground/60'
          : [ENERGY_TOKEN[energy].bg, ENERGY_TOKEN[energy].fg, ENERGY_RING],
        overridden && OVERRIDDEN_CLASS,
      )}
    >
      {bpm ?? '—'}
    </span>
  );
}
