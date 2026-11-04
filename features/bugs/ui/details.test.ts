// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
  captureEnvironment,
  checkScreenshotFiles,
  describeBrowser,
  describeViewport,
} from './details';

const file = (name: string, type = 'image/png', size = 100) =>
  new File([new Uint8Array(size)], name, { type });

describe('checkScreenshotFiles', () => {
  it('accepts images and explains every refusal', () => {
    const big = file('big.png');
    Object.defineProperty(big, 'size', { value: 10 * 1024 * 1024 + 1 });
    const { accepted, rejected } = checkScreenshotFiles(
      [file('a.png'), file('doc.pdf', 'application/pdf'), file('empty.png', 'image/png', 0), big],
      0,
    );
    expect(accepted.map((f) => f.name)).toEqual(['a.png']);
    expect(rejected).toEqual([
      "“doc.pdf” isn't a PNG, JPEG, WebP or GIF image.",
      '“empty.png” is empty.',
      '“big.png” is larger than 10 MB.',
    ]);
  });

  it('stops at 5 screenshots in total', () => {
    const { accepted, rejected } = checkScreenshotFiles(
      [file('a.webp', 'image/webp'), file('b.gif', 'image/gif'), file('c.jpg', 'image/jpeg')],
      3,
    );
    expect(accepted).toHaveLength(2);
    expect(rejected).toEqual(["“c.jpg” wasn't added: a report can have at most 5 screenshots."]);
  });

  it('names pasted images', () => {
    expect(checkScreenshotFiles([file('', 'text/plain')], 0).rejected[0]).toContain('Pasted image');
  });
});

describe('describeBrowser', () => {
  it.each([
    [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
      'Chrome 130 on macOS',
    ],
    [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
      'Safari 18 on iOS',
    ],
    [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0',
      'Firefox 132 on Windows',
    ],
    [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
      'Edge 130 on Windows',
    ],
    [
      'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36',
      'Samsung Internet 26 on Android',
    ],
    ['Mozilla/5.0 (X11; Linux x86_64) SomethingNew/1.0', 'Linux'],
    ['curl/8.0', 'curl/8.0'],
    ['', 'Unknown'],
    [null, 'Unknown'],
  ])('%s → %s', (ua, expected) => expect(describeBrowser(ua)).toBe(expected));
});

describe('describeViewport', () => {
  it('formats WxH', () => {
    expect(describeViewport('390x844')).toBe('390 × 844');
    expect(describeViewport('odd')).toBe('odd');
    expect(describeViewport(null)).toBe('Unknown');
  });
});

describe('captureEnvironment', () => {
  it('reads the user agent and the window size', () => {
    expect(
      captureEnvironment({
        innerWidth: 390.4,
        innerHeight: 844,
        navigator: { userAgent: 'UA' } as Navigator,
      }),
    ).toEqual({ userAgent: 'UA', viewport: '390x844' });
  });
});
