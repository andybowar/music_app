/**
 * Derived branch usage (REQ-BR-02; contracts/api.md "Pure modules"). No I/O.
 *
 * A song's derived level for a branch comes from how many of that branch's setlists
 * included it in the last 365 days: >=6 high, 2–5 low, 1 rare, 0 none.
 */

import type { UsageLevel } from '@/types/domain';

/** Time zone the nightly job runs in; "today" for the history window is a date there. */
export const USAGE_TIME_ZONE = 'America/Chicago';

/** Length of the setlist history window, in days (today included). */
export const USAGE_WINDOW_DAYS = 365;

/** Maps a song's setlist count for one branch over the last 365 days to a usage level. */
export function deriveUsageLevel(setlistCountLast365d: number): UsageLevel {
  if (setlistCountLast365d >= 6) return 'high';
  if (setlistCountLast365d >= 2) return 'low';
  if (setlistCountLast365d >= 1) return 'rare';
  return 'none';
}

/** `YYYY-MM-DD` for the calendar date of `now` in `timeZone`. */
export function localDate(now: Date, timeZone: string = USAGE_TIME_ZONE): string {
  // en-CA formats dates as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/**
 * Inclusive `event_date` window for setlist history: the 365 days ending today (in
 * `timeZone`). Setlists dated after today are planned, not used, so they don't count.
 */
export function usageWindow(
  now: Date,
  timeZone: string = USAGE_TIME_ZONE,
): { from: string; to: string } {
  const to = localDate(now, timeZone);
  const [y, m, d] = to.split('-').map(Number) as [number, number, number];
  const from = new Date(Date.UTC(y, m - 1, d - (USAGE_WINDOW_DAYS - 1))).toISOString().slice(0, 10);
  return { from, to };
}
