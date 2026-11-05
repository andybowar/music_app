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

/**
 * Where ✕ is remembered. Any non-empty value means dismissed for good, including the ISO times
 * written when ✕ hid the banner for 30 days only.
 */
export const DISMISS_STORAGE_KEY = 'install-hint:dismissed-at';

export interface InstallHint {
  device: AppleDevice;
  browser: AppleBrowser;
}

/**
 * The hint to show, or null: only on an iPad or iPhone, never inside the installed app
 * (`standalone`), and never again once dismissed (`dismissed`: any value stored under
 * `DISMISS_STORAGE_KEY`).
 */
export function installHint(input: {
  device: DeviceInfo;
  standalone: boolean;
  dismissed: string | null;
}): InstallHint | null {
  const device = appleDevice(input.device);
  if (!device || input.standalone || input.dismissed) return null;
  return { device, browser: appleBrowser(input.device.userAgent) };
}
