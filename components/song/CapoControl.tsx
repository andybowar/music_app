'use client';

import { MinusIcon, PlusIcon, SparklesIcon } from 'lucide-react';
import { useId, useState } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/utils';
import { CAPO_MAX, shapeKey } from '@/lib/lyrics/capo';

import { displayKey } from './KeyBadge';

export interface CapoControlProps {
  /** 0 = no capo. */
  capo: number;
  onChange(capo: number): void;
  /** The key the song sounds in (it doesn't change with the capo). */
  soundingKey: string | null;
  /** The friendliest fret for these chords (`suggestCapo`), or null when there's nothing to judge. */
  suggestion: number | null;
  className?: string;
}

const fretLabel = (capo: number) => (capo === 0 ? 'No capo' : `Capo ${capo}`);

/**
 * Capo fret picker: − / + from no capo to fret 7, and Suggest. The line under it says which
 * shapes to play; the song's key stays the same.
 */
export function CapoControl({
  capo,
  onChange,
  soundingKey,
  suggestion,
  className,
}: CapoControlProps) {
  const id = useId();
  const [note, setNote] = useState('');
  const shapes = capo > 0 && soundingKey ? shapeKey(soundingKey, capo) : null;
  const status =
    capo === 0
      ? `No capo${soundingKey ? ` · key ${displayKey(soundingKey)}` : ''}`
      : `${fretLabel(capo)}${shapes ? ` · play ${displayKey(shapes)} shapes` : ''}${soundingKey ? ` · key ${displayKey(soundingKey)}` : ''}`;
  const set = (next: number) => {
    setNote('');
    onChange(next);
  };

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <div
        className="flex flex-wrap items-center gap-2"
        role="group"
        aria-labelledby={`${id}-label`}
      >
        <span id={`${id}-label`} className="text-sm font-medium">
          Capo
        </span>
        <Button
          type="button"
          variant="outline"
          size="icon-lg"
          aria-label="Capo down a fret"
          disabled={capo === 0}
          onClick={() => set(capo - 1)}
        >
          <MinusIcon aria-hidden />
        </Button>
        <span className="min-w-[4.5rem] text-center text-sm font-semibold tabular-nums" aria-hidden>
          {capo === 0 ? 'None' : `Fret ${capo}`}
        </span>
        <Button
          type="button"
          variant="outline"
          size="icon-lg"
          aria-label="Capo up a fret"
          disabled={capo === CAPO_MAX}
          onClick={() => set(capo + 1)}
        >
          <PlusIcon aria-hidden />
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="min-h-tap"
          disabled={suggestion === null}
          onClick={() => {
            if (suggestion === null) return;
            onChange(suggestion);
            setNote(
              suggestion === 0
                ? 'These chords are already easiest without a capo.'
                : `Suggested: ${fretLabel(suggestion)}, the fewest sharps and flats.`,
            );
          }}
        >
          <SparklesIcon aria-hidden />
          Suggest
        </Button>
      </div>
      <p aria-live="polite" className="text-xs text-muted-foreground">
        {status}
        {note ? ` — ${note}` : ''}
      </p>
    </div>
  );
}
