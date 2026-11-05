/**
 * The open set player lives in the URL as `?play=<n>` (n is 1-based), so a reload or the offline
 * copy of the setlist page reopens it (LIST-11). Pure. An `as=<role>` left by older links (roles
 * were removed on 2026-11-05) is ignored, and dropped when the URL is next written.
 */

/**
 * The 0-based song index in `search`, or null when there's no `play`. A malformed or
 * out-of-range song number opens song 1.
 */
export function parsePlayParams(search: string, total: number): number | null {
  const raw = new URLSearchParams(search).get('play');
  if (raw === null || total <= 0) return null;
  const n = /^\d{1,4}$/.test(raw) ? Number(raw) : NaN;
  return n >= 1 && n <= total ? n - 1 : 0;
}

/** `search` with the player's song set, or removed when `index` is null. Other params are kept. */
export function withPlayParams(search: string, index: number | null) {
  const params = new URLSearchParams(search);
  params.delete('as');
  if (index !== null) params.set('play', String(index + 1));
  else params.delete('play');
  const out = params.toString();
  return out ? `?${out}` : '';
}
