'use client';

import { useEffect, useState, type RefObject } from 'react';

import { Toggle } from '@/components/ui/toggle';
import type { UUID } from '@/types/domain';

import { DEFAULT_SPEED, SPEED_MAX, SPEED_MIN, readSpeed, writeSpeed } from './playerPrefs';
import { useAutoscroll } from './scrolling';

export interface AutoscrollControlsProps {
  /** The song being read: its speed (1–10) is remembered on this device. */
  songId: UUID;
  /** What scrolls: the set player's scroll area, or the page (`document.scrollingElement`). */
  target: RefObject<HTMLElement | null>;
  /** Autoscroll turns off whenever this changes (another song, another role). */
  resetKey?: string;
  className?: string;
}

/**
 * The Autoscroll toggle and its 1–10 speed slider (LIST-11), shared by the set player and the
 * song page. The speed is per song and shared between the two; autoscroll stops at the bottom
 * and turns off on every song change.
 */
export function AutoscrollControls({
  songId,
  target,
  resetKey,
  className,
}: AutoscrollControlsProps) {
  const [on, setOn] = useState(false);
  const [speed, setSpeed] = useState(DEFAULT_SPEED);

  useEffect(() => {
    setOn(false);
    setSpeed(readSpeed(songId));
  }, [songId, resetKey]);

  useAutoscroll(target, { on, speed, onEnd: () => setOn(false) });

  return (
    <div className={className ?? 'flex flex-wrap items-center gap-x-4 gap-y-2'}>
      <Toggle variant="outline" className="min-h-tap px-3" pressed={on} onPressedChange={setOn}>
        Autoscroll
      </Toggle>
      <label className="flex items-center gap-2 text-sm">
        Speed
        <input
          type="range"
          min={SPEED_MIN}
          max={SPEED_MAX}
          step={1}
          value={speed}
          aria-valuetext={`${speed} of ${SPEED_MAX}`}
          className="h-tap w-28 accent-foreground"
          onChange={(e) => {
            const value = Number(e.target.value);
            setSpeed(value);
            writeSpeed(songId, value);
          }}
        />
        <span className="w-5 tabular-nums" aria-hidden>
          {speed}
        </span>
      </label>
    </div>
  );
}
