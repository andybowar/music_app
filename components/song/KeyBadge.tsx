import { cn } from '@/components/ui/utils';
import { OVERRIDDEN_CLASS, OVERRIDDEN_HINT } from './EnergyChip';

export interface KeyBadgeProps {
  value: string | null;
  overridden?: boolean;
}

/** Shows `#`/`b` as ♯/♭ for display only, e.g. "Bb" → "B♭", "F#m" → "F♯m". */
export function displayKey(value: string): string {
  return value.replace(/^([A-G])#/, '$1♯').replace(/^([A-G])b/, '$1♭');
}

/** Spoken form, e.g. "Bb" → "B flat", "F#m" → "F sharp minor". Unknown shapes pass through. */
export function spokenKey(value: string): string {
  const m = /^([A-G])([#b]?)(m?)$/.exec(value);
  if (!m) return value;
  const [, note, accidental, minor] = m;
  const acc = accidental === '#' ? 'sharp' : accidental === 'b' ? 'flat' : '';
  return [note, acc, minor ? 'minor' : ''].filter(Boolean).join(' ');
}

export function keyBadgeLabel({ value, overridden = false }: KeyBadgeProps): string {
  const base = value === null ? 'Key not set' : `Key ${spokenKey(value)}`;
  return overridden ? `${base}, ${OVERRIDDEN_HINT}` : base;
}

/** Usual (or event-overridden) key of a song (REQ-ROW-01). */
export function KeyBadge({ value, overridden = false }: KeyBadgeProps) {
  const label = keyBadgeLabel({ value, overridden });
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      data-overridden={overridden || undefined}
      className={cn(
        'inline-flex h-7 min-w-8 items-center justify-center px-1 text-sm font-semibold',
        value === null && 'opacity-70',
        overridden && OVERRIDDEN_CLASS,
      )}
    >
      {value === null ? '—' : displayKey(value)}
    </span>
  );
}
