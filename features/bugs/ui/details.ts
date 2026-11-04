/**
 * Bug report helpers for the UI (ADM-08). Pure, so they are unit-tested on their own; the
 * server repeats every file check.
 */
import { isImageMimeType, MAX_IMAGE_BYTES, MAX_IMAGES_PER_BUG } from '../types';

export interface FileCheck {
  accepted: File[];
  /** One plain-language message per refused file. */
  rejected: string[];
}

/**
 * Split `files` into the screenshots that may be added and messages for the rest. `used` is
 * how many the report already has queued; at most `MAX_IMAGES_PER_BUG` in total.
 */
export function checkScreenshotFiles(files: readonly File[], used: number): FileCheck {
  const accepted: File[] = [];
  const rejected: string[] = [];
  for (const file of files) {
    const name = file.name || 'Pasted image';
    if (!isImageMimeType(file.type)) {
      rejected.push(`“${name}” isn't a PNG, JPEG, WebP or GIF image.`);
    } else if (file.size === 0) {
      rejected.push(`“${name}” is empty.`);
    } else if (file.size > MAX_IMAGE_BYTES) {
      rejected.push(`“${name}” is larger than 10 MB.`);
    } else if (used + accepted.length >= MAX_IMAGES_PER_BUG) {
      rejected.push(
        `“${name}” wasn't added: a report can have at most ${MAX_IMAGES_PER_BUG} screenshots.`,
      );
    } else {
      accepted.push(file);
    }
  }
  return { accepted, rejected };
}

/** What the browser sends with a report: user agent and window size. */
export interface CapturedEnvironment {
  userAgent: string;
  /** `{width}x{height}` of the window, e.g. `390x844`. */
  viewport: string;
}

/** Read the environment from `window` (call in an effect: there's no window on the server). */
export function captureEnvironment(win: Pick<Window, 'innerWidth' | 'innerHeight' | 'navigator'>) {
  return {
    userAgent: win.navigator.userAgent,
    viewport: `${Math.round(win.innerWidth)}x${Math.round(win.innerHeight)}`,
  } satisfies CapturedEnvironment;
}

const BROWSERS: [RegExp, string][] = [
  [/Edg(?:A|iOS)?\/(\d+)/, 'Edge'],
  [/OPR\/(\d+)/, 'Opera'],
  [/SamsungBrowser\/(\d+)/, 'Samsung Internet'],
  [/Firefox\/(\d+)|FxiOS\/(\d+)/, 'Firefox'],
  [/Chrome\/(\d+)|CriOS\/(\d+)/, 'Chrome'],
  [/Version\/(\d+)[\d.]* .*Safari\//, 'Safari'],
];

const SYSTEMS: [RegExp, string][] = [
  [/iPhone|iPad|iPod/, 'iOS'],
  [/Android/, 'Android'],
  [/CrOS/, 'ChromeOS'],
  [/Mac OS X|Macintosh/, 'macOS'],
  [/Windows/, 'Windows'],
  [/Linux/, 'Linux'],
];

/** "Chrome 130 on macOS" from a user agent; the raw string when it isn't recognized. */
export function describeBrowser(userAgent: string | null | undefined): string {
  const ua = userAgent?.trim();
  if (!ua) return 'Unknown';
  let browser: string | null = null;
  for (const [re, name] of BROWSERS) {
    const m = re.exec(ua);
    if (m) {
      const version = m.slice(1).find(Boolean);
      browser = version ? `${name} ${version}` : name;
      break;
    }
  }
  const system = SYSTEMS.find(([re]) => re.test(ua))?.[1] ?? null;
  if (browser && system) return `${browser} on ${system}`;
  return browser ?? system ?? ua;
}

/** "390 × 844" from "390x844". */
export function describeViewport(viewport: string | null | undefined): string {
  if (!viewport) return 'Unknown';
  const m = /^(\d+)x(\d+)$/.exec(viewport);
  return m ? `${m[1]} × ${m[2]}` : viewport;
}
