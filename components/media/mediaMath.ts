/** Pure helpers shared by `PdfViewer` and `InlineAudio`. No React, no DOM. */

export const MIN_SCALE = 0.5;
export const MAX_SCALE = 4;
export const ZOOM_STEP = 0.25;

/** Clamp a zoom factor to [MIN_SCALE, MAX_SCALE], rounded to 2 decimals so labels stay stable. */
export function clampScale(scale: number): number {
  if (!Number.isFinite(scale)) return 1;
  const clamped = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
  return Math.round(clamped * 100) / 100;
}

/** Step the zoom by one `ZOOM_STEP` in `direction`, snapping to the step grid first. */
export function stepScale(scale: number, direction: 1 | -1): number {
  const steps = scale / ZOOM_STEP;
  const eps = 1e-6;
  const next = direction === 1 ? Math.floor(steps + eps) + 1 : Math.ceil(steps - eps) - 1;
  return clampScale(next * ZOOM_STEP);
}

/** Scale after a two-finger pinch: `startScale` times the ratio of finger distances. */
export function pinchScale(startScale: number, startDistance: number, distance: number): number {
  if (startDistance <= 0) return clampScale(startScale);
  return clampScale(startScale * (distance / startDistance));
}

/** Distance between two pointers in CSS pixels. */
export function pointerDistance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Clamp a 1-based page number to [1, numPages]. Returns 1 while the page count is unknown. */
export function clampPage(page: number, numPages: number | null): number {
  if (!numPages || numPages < 1 || !Number.isFinite(page)) return 1;
  return Math.min(numPages, Math.max(1, Math.trunc(page)));
}

/** `m:ss`, or `h:mm:ss` from an hour up. Unknown or invalid durations render as `--:--`. */
export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '--:--';
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/**
 * File name for the download button: the last path segment of `url` (query string dropped),
 * falling back to `title.pdf` when the URL has none. Path separators are never returned.
 */
export function downloadName(url: string, title: string, ext = 'pdf'): string {
  let last = '';
  try {
    const path = new URL(url, 'http://local.invalid').pathname;
    last = decodeURIComponent(path.split('/').pop() ?? '');
  } catch {
    last = '';
  }
  if (last && /\.[a-z0-9]{2,5}$/i.test(last)) return last;
  const base =
    title
      .trim()
      .replace(/[\\/:*?"<>|]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim() || 'download';
  return `${base}.${ext}`;
}
