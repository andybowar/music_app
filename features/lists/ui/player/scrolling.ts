/**
 * Autoscroll and page-turner stepping for the set player (LIST-11). The pure parts are exported
 * for tests; `useAutoscroll` drives a scroll container with requestAnimationFrame.
 */
import { useEffect, useRef, type RefObject } from 'react';

import { SPEED_MAX, SPEED_MIN } from './playerPrefs';

/** Pixels per second for speed 1–10: about 8 px/s at 1, 118 px/s at 10 (×1.35 a step). */
export function pixelsPerSecond(speed: number): number {
  const s = Math.min(SPEED_MAX, Math.max(SPEED_MIN, speed));
  return 8 * 1.35 ** (s - 1);
}

export interface ScrollBox {
  top: number;
  height: number;
  scrollHeight: number;
}

/** How close to an end counts as being there (subpixel scrolling never lands exactly). */
const EDGE = 2;
/** A page turn moves 85% of the visible height, so the last lines stay in view. */
const PAGE = 0.85;

export function atBottom({ top, height, scrollHeight }: ScrollBox): boolean {
  return top + height >= scrollHeight - EDGE;
}

export function atTop({ top }: ScrollBox): boolean {
  return top <= EDGE;
}

/**
 * What a page-turner press does in the musician view: scroll a screen, or, once the chart is at
 * that end already, move to the next (or previous) song.
 */
export function pageStep(
  box: ScrollBox,
  direction: 'down' | 'up',
): { type: 'scroll'; to: number } | { type: 'song' } {
  if (direction === 'down') {
    if (atBottom(box)) return { type: 'song' };
    return {
      type: 'scroll',
      to: Math.min(box.top + box.height * PAGE, box.scrollHeight - box.height),
    };
  }
  if (atTop(box)) return { type: 'song' };
  return { type: 'scroll', to: Math.max(0, box.top - box.height * PAGE) };
}

export function scrollBox(el: HTMLElement): ScrollBox {
  return { top: el.scrollTop, height: el.clientHeight, scrollHeight: el.scrollHeight };
}

/**
 * Scrolls `ref` down at `speed` while `on`. Stops by itself at the bottom and calls `onEnd`.
 * Manual scrolling while it runs is fine: it carries on from wherever the reader left it.
 */
export function useAutoscroll(
  ref: RefObject<HTMLElement | null>,
  { on, speed, onEnd }: { on: boolean; speed: number; onEnd(): void },
): void {
  const onEndRef = useRef(onEnd);
  useEffect(() => {
    onEndRef.current = onEnd;
  });

  useEffect(() => {
    if (!on) return;
    const el = ref.current;
    if (!el) return;
    const rate = pixelsPerSecond(speed);
    let frame = 0;
    let last: number | null = null;
    // Fractions of a pixel are carried over: browsers round scrollTop, so slow speeds would stall.
    let carry = 0;
    const tick = (now: number) => {
      if (last !== null) {
        carry += (rate * (now - last)) / 1000;
        const whole = Math.floor(carry);
        if (whole > 0) {
          el.scrollTop += whole;
          carry -= whole;
        }
        if (atBottom(scrollBox(el))) {
          onEndRef.current();
          return;
        }
      }
      last = now;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [on, speed, ref]);
}
