/**
 * The open set player lives in the URL as `?play=<n>&as=<role>` (n is 1-based), so a reload or
 * the offline copy of the setlist page reopens it (LIST-11). Pure.
 */
import { parseRole, type PlayerRole } from './playerPrefs';

export interface PlayState {
  /** 0-based. */
  index: number;
  /** Null when the URL doesn't say: ask, as Start does. */
  role: PlayerRole | null;
}

/**
 * The player state in `search`, or null when there's no `play`. A malformed or out-of-range
 * song number opens song 1.
 */
export function parsePlayParams(search: string, total: number): PlayState | null {
  const params = new URLSearchParams(search);
  const raw = params.get('play');
  if (raw === null || total <= 0) return null;
  const n = /^\d{1,4}$/.test(raw) ? Number(raw) : NaN;
  const index = n >= 1 && n <= total ? n - 1 : 0;
  return { index, role: parseRole(params.get('as')) };
}

/** `search` with the player state set, or removed when `state` is null. Other params are kept. */
export function withPlayParams(search: string, state: { index: number; role: PlayerRole } | null) {
  const params = new URLSearchParams(search);
  if (state) {
    params.set('play', String(state.index + 1));
    params.set('as', state.role);
  } else {
    params.delete('play');
    params.delete('as');
  }
  const out = params.toString();
  return out ? `?${out}` : '';
}
