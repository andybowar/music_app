import { render } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { atBottom, atTop, pageStep, pixelsPerSecond, useAutoscroll } from './scrolling';

describe('pixelsPerSecond', () => {
  it('rises with speed and clamps to 1–10', () => {
    expect(pixelsPerSecond(1)).toBeCloseTo(8);
    expect(pixelsPerSecond(10)).toBeGreaterThan(100);
    expect(pixelsPerSecond(5)).toBeGreaterThan(pixelsPerSecond(4));
    expect(pixelsPerSecond(0)).toBe(pixelsPerSecond(1));
    expect(pixelsPerSecond(20)).toBe(pixelsPerSecond(10));
  });
});

describe('pageStep', () => {
  const box = (top: number) => ({ top, height: 400, scrollHeight: 1000 });

  it('scrolls 85% of a screen, stopping at the ends', () => {
    expect(pageStep(box(0), 'down')).toEqual({ type: 'scroll', to: 340 });
    expect(pageStep(box(500), 'down')).toEqual({ type: 'scroll', to: 600 });
    expect(pageStep(box(600), 'up')).toEqual({ type: 'scroll', to: 260 });
    expect(pageStep(box(100), 'up')).toEqual({ type: 'scroll', to: 0 });
  });

  it('moves to the next or previous song once already at that end', () => {
    expect(pageStep(box(599), 'down')).toEqual({ type: 'song' });
    expect(pageStep(box(1), 'up')).toEqual({ type: 'song' });
    expect(pageStep({ top: 0, height: 400, scrollHeight: 400 }, 'down')).toEqual({ type: 'song' });
  });

  it('knows the ends', () => {
    expect(atTop(box(2))).toBe(true);
    expect(atTop(box(3))).toBe(false);
    expect(atBottom(box(598))).toBe(true);
    expect(atBottom(box(597))).toBe(false);
  });
});

describe('useAutoscroll', () => {
  let frames: Array<(t: number) => void> = [];
  beforeEach(() => {
    frames = [];
    vi.stubGlobal('requestAnimationFrame', (cb: (t: number) => void) => frames.push(cb));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });
  afterEach(() => vi.unstubAllGlobals());

  const run = (t: number) => {
    const pending = frames;
    frames = [];
    pending.forEach((cb) => cb(t));
  };

  function Harness({ on, speed, onEnd }: { on: boolean; speed: number; onEnd(): void }) {
    const ref = useRef<HTMLDivElement>(null);
    useAutoscroll(ref, { on, speed, onEnd });
    return <div ref={ref} data-testid="box" />;
  }

  function sized(el: HTMLElement, scrollHeight: number) {
    Object.defineProperty(el, 'clientHeight', { value: 100, configurable: true });
    Object.defineProperty(el, 'scrollHeight', { value: scrollHeight, configurable: true });
  }

  it('scrolls at the speed, carrying fractions, and stops at the bottom', () => {
    const onEnd = vi.fn();
    const { getByTestId, rerender } = render(<Harness on={false} speed={1} onEnd={onEnd} />);
    const el = getByTestId('box');
    sized(el, 120);
    rerender(<Harness on speed={1} onEnd={onEnd} />);
    run(0);
    run(100); // 0.8px: carried, not yet scrolled
    expect(el.scrollTop).toBe(0);
    run(1000); // 8px in total
    expect(el.scrollTop).toBe(8);
    run(3000); // would pass the bottom
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(frames).toHaveLength(0);
  });

  it('does nothing while off', () => {
    render(<Harness on={false} speed={5} onEnd={vi.fn()} />);
    expect(frames).toHaveLength(0);
  });
});
