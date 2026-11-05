/**
 * Whether to suggest adding the app to the Home Screen on an iPad or iPhone. Pure.
 *
 * iPadOS and iOS don't offer an install prompt, so we explain the Share → Add to Home Screen
 * steps instead. iPads since iPadOS 13 present themselves as a Mac ("Macintosh" in the user
 * agent), so a Mac with a touch screen counts as an iPad (Macs have no touch screen).
 */

export type AppleDevice = 'ipad' | 'iphone';
/** Safari, or another browser (Chrome, Edge, Firefox…) whose Share button is in the address bar. */
export type AppleBrowser = 'safari' | 'other';

export interface DeviceInfo {
  userAgent: string;
  maxTouchPoints: number;
}

export function appleDevice({ userAgent, maxTouchPoints }: DeviceInfo): AppleDevice | null {
  if (/iPhone|iPod/.test(userAgent)) return 'iphone';
  if (/iPad/.test(userAgent)) return 'ipad';
  if (/Macintosh/.test(userAgent) && maxTouchPoints > 1) return 'ipad';
  return null;
}

const OTHER_BROWSERS = /CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|DuckDuckGo|GSA\/|YaBrowser|Brave/;

export function appleBrowser(userAgent: string): AppleBrowser {
  return OTHER_BROWSERS.test(userAgent) ? 'other' : 'safari';
}

/** How long ✕ hides the banner on a device. */
export const DISMISS_DAYS = 30;
export const DISMISS_STORAGE_KEY = 'install-hint:dismissed-at';

/** Whether a dismissal (an ISO time, or nothing) still hides the banner at `now`. */
export function stillDismissed(dismissedAt: string | null, now: Date): boolean {
  if (!dismissedAt) return false;
  const at = Date.parse(dismissedAt);
  if (Number.isNaN(at)) return false;
  return now.getTime() - at < DISMISS_DAYS * 24 * 60 * 60 * 1000;
}

export interface InstallHint {
  device: AppleDevice;
  browser: AppleBrowser;
}

/**
 * The hint to show, or null: only on an iPad or iPhone, never inside the installed app
 * (`standalone`), and not while dismissed.
 */
export function installHint(input: {
  device: DeviceInfo;
  standalone: boolean;
  dismissedAt: string | null;
  now: Date;
}): InstallHint | null {
  const device = appleDevice(input.device);
  if (!device || input.standalone || stillDismissed(input.dismissedAt, input.now)) return null;
  return { device, browser: appleBrowser(input.device.userAgent) };
}
