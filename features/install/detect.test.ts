import { describe, expect, it } from 'vitest';

import { appleBrowser, appleDevice, installHint, stillDismissed } from './detect';

const UA = {
  ipadSafari:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  ipadOld:
    'Mozilla/5.0 (iPad; CPU OS 12_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.1 Mobile/15E148 Safari/604.1',
  ipadChrome:
    'Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/124.0 Mobile/15E148 Safari/604.1',
  iphoneSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
  iphoneFirefox:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/125.0 Mobile/15E148 Safari/605.1.15',
  android:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36',
};

describe('appleDevice', () => {
  it('finds iPads, including those that present themselves as a Mac', () => {
    expect(appleDevice({ userAgent: UA.ipadSafari, maxTouchPoints: 5 })).toBe('ipad');
    expect(appleDevice({ userAgent: UA.ipadOld, maxTouchPoints: 5 })).toBe('ipad');
    expect(appleDevice({ userAgent: UA.ipadChrome, maxTouchPoints: 5 })).toBe('ipad');
  });

  it('finds iPhones, and leaves Macs and other devices out', () => {
    expect(appleDevice({ userAgent: UA.iphoneSafari, maxTouchPoints: 5 })).toBe('iphone');
    expect(appleDevice({ userAgent: UA.ipadSafari, maxTouchPoints: 0 })).toBeNull();
    expect(appleDevice({ userAgent: UA.android, maxTouchPoints: 5 })).toBeNull();
  });
});

describe('appleBrowser', () => {
  it('tells Safari from other browsers', () => {
    expect(appleBrowser(UA.ipadSafari)).toBe('safari');
    expect(appleBrowser(UA.iphoneSafari)).toBe('safari');
    expect(appleBrowser(UA.ipadChrome)).toBe('other');
    expect(appleBrowser(UA.iphoneFirefox)).toBe('other');
  });
});

describe('installHint', () => {
  const now = new Date('2026-11-05T12:00:00Z');
  const ipad = { userAgent: UA.ipadSafari, maxTouchPoints: 5 };

  it('shows on an iPad or iPhone in the browser', () => {
    expect(installHint({ device: ipad, standalone: false, dismissedAt: null, now })).toEqual({
      device: 'ipad',
      browser: 'safari',
    });
  });

  it('hides in the installed app, on other devices, and for 30 days after ✕', () => {
    expect(installHint({ device: ipad, standalone: true, dismissedAt: null, now })).toBeNull();
    expect(
      installHint({
        device: { userAgent: UA.android, maxTouchPoints: 5 },
        standalone: false,
        dismissedAt: null,
        now,
      }),
    ).toBeNull();
    expect(
      installHint({ device: ipad, standalone: false, dismissedAt: '2026-10-20T12:00:00Z', now }),
    ).toBeNull();
    expect(
      installHint({ device: ipad, standalone: false, dismissedAt: '2026-10-01T12:00:00Z', now }),
    ).not.toBeNull();
  });

  it('treats a missing or broken dismissal as none', () => {
    expect(stillDismissed(null, now)).toBe(false);
    expect(stillDismissed('not a date', now)).toBe(false);
  });
});
