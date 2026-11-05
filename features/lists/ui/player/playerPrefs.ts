/**
 * Set player settings kept on this device (LIST-11): lyrics text size, and the autoscroll speed
 * of each song. Every read and write tolerates storage being unavailable (private mode, quota).
 */
import type { UUID } from '@/types/domain';

/** Lyrics text sizes in px (the base step is at least 20px). */
export const TEXT_SIZES = [20, 24, 28, 34] as const;
export const DEFAULT_TEXT_STEP = 0;

export const SPEED_MIN = 1;
export const SPEED_MAX = 10;
export const DEFAULT_SPEED = 3;

const TEXT_KEY = 'set-player:text-size';
const speedKey = (songId: UUID) => `set-player:speed:${songId}`;

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Not saved; the setting still applies until the page closes.
  }
}

/** Clamps to a whole number within [min, max]; anything else gives `fallback`. */
export function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'string' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

export function readTextStep(): number {
  return clampInt(read(TEXT_KEY), 0, TEXT_SIZES.length - 1, DEFAULT_TEXT_STEP);
}

export function writeTextStep(step: number): void {
  write(TEXT_KEY, String(clampInt(step, 0, TEXT_SIZES.length - 1, DEFAULT_TEXT_STEP)));
}

export function readSpeed(songId: UUID): number {
  return clampInt(read(speedKey(songId)), SPEED_MIN, SPEED_MAX, DEFAULT_SPEED);
}

export function writeSpeed(songId: UUID, speed: number): void {
  write(speedKey(songId), String(clampInt(speed, SPEED_MIN, SPEED_MAX, DEFAULT_SPEED)));
}
