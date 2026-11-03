// @vitest-environment jsdom
import type { RouteHandlerCallbackOptions } from 'serwist';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ACTIONS_CACHE,
  actionCacheKey,
  actionRedirectUrl,
  appendToStream,
  bannerScript,
  carriesSignedStorageUrl,
  escapeHtml,
  extractTitle,
  handleAction,
  handleListRsc,
  handleNavigation,
  handlePdf,
  isListPagePath,
  PAGES_CACHE,
  RESOURCES_CACHE,
  SAVED_AT_HEADER,
  listTitle,
  offlineFallbackHtml,
  overflow,
  pageCacheKey,
  parseRange,
  pdfResourceId,
  resourceCacheKey,
  withBanner,
} from './sw';

const LIST_ID = '3f1c2a54-6b7d-4e8f-9a0b-1c2d3e4f5a6b';
const RESOURCE_ID = 'A1B2C3D4-E5F6-4a7b-8c9d-0e1f2a3b4c5d';
const ORIGIN = 'https://app.example.org';

describe('isListPagePath', () => {
  it('matches a single list page, with or without a trailing slash', () => {
    expect(isListPagePath(`/lists/${LIST_ID}`)).toBe(true);
    expect(isListPagePath(`/lists/${LIST_ID}/`)).toBe(true);
  });

  it('rejects the index, sub-paths and non-uuid ids', () => {
    expect(isListPagePath('/lists')).toBe(false);
    expect(isListPagePath(`/lists/${LIST_ID}/edit`)).toBe(false);
    expect(isListPagePath('/lists/not-a-uuid')).toBe(false);
    expect(isListPagePath(`/songs/${LIST_ID}`)).toBe(false);
  });
});

describe('pageCacheKey', () => {
  it('drops the query, hash and trailing slash', () => {
    expect(pageCacheKey(new URL(`${ORIGIN}/lists/${LIST_ID}/?_rsc=abc#x`))).toBe(
      `${ORIGIN}/lists/${LIST_ID}`,
    );
  });
});

describe('pdfResourceId', () => {
  const signed = (path: string) =>
    new URL(`http://127.0.0.1:54321/storage/v1/object/sign/resources/${path}?token=t`);

  it('reads the resource id from a signed PDF URL, lower-cased', () => {
    expect(pdfResourceId(signed(`songs/s/common/${RESOURCE_ID}.pdf`))).toBe(
      RESOURCE_ID.toLowerCase(),
    );
    expect(pdfResourceId(signed(`songs/s/k/${RESOURCE_ID}.PDF`))).toBe(RESOURCE_ID.toLowerCase());
  });

  it('ignores other formats, buckets and unsigned URLs', () => {
    expect(pdfResourceId(signed(`songs/s/k/${RESOURCE_ID}.mp3`))).toBeNull();
    expect(
      pdfResourceId(new URL(`http://x/storage/v1/object/sign/other/${RESOURCE_ID}.pdf`)),
    ).toBeNull();
    expect(
      pdfResourceId(new URL(`http://x/storage/v1/object/public/resources/${RESOURCE_ID}.pdf`)),
    ).toBeNull();
    expect(pdfResourceId(signed('songs/s/k/not-a-uuid.pdf'))).toBeNull();
  });

  it('keys the cache by resource id, so a new token maps to the same entry', () => {
    const a = pdfResourceId(signed(`songs/s/k/${RESOURCE_ID}.pdf`));
    const b = pdfResourceId(
      new URL(
        `http://127.0.0.1:54321/storage/v1/object/sign/resources/songs/s/k/${RESOURCE_ID}.pdf?token=other`,
      ),
    );
    expect(resourceCacheKey(ORIGIN, a!)).toBe(resourceCacheKey(ORIGIN, b!));
    expect(resourceCacheKey(ORIGIN, a!)).toBe(
      `${ORIGIN}/__offline/resource/${RESOURCE_ID.toLowerCase()}`,
    );
  });
});

describe('actionCacheKey', () => {
  it('keys text/plain bodies by action id and arguments', () => {
    const key = actionCacheKey(ORIGIN, 'abc123', 'text/plain;charset=UTF-8', `["${RESOURCE_ID}"]`);
    expect(key).toBe(
      `${ORIGIN}/__offline/action/abc123?args=${encodeURIComponent(`["${RESOURCE_ID}"]`)}`,
    );
  });

  it('refuses multipart bodies, missing ids and long bodies', () => {
    expect(actionCacheKey(ORIGIN, 'abc', 'multipart/form-data; boundary=x', 'x')).toBeNull();
    expect(actionCacheKey(ORIGIN, 'abc', null, 'x')).toBeNull();
    expect(actionCacheKey(ORIGIN, '', 'text/plain', 'x')).toBeNull();
    expect(actionCacheKey(ORIGIN, 'abc', 'text/plain', 'x'.repeat(5000))).toBeNull();
  });
});

describe('actionRedirectUrl', () => {
  const base = `${ORIGIN}/login`;

  it('reads the same-origin target of an action redirect', () => {
    expect(actionRedirectUrl(`/lists/${LIST_ID};replace`, base)?.pathname).toBe(
      `/lists/${LIST_ID}`,
    );
    expect(actionRedirectUrl(`${ORIGIN}/library;push`, base)?.pathname).toBe('/library');
  });

  it('ignores missing, empty and cross-origin redirects', () => {
    expect(actionRedirectUrl(null, base)).toBeNull();
    expect(actionRedirectUrl(';push', base)).toBeNull();
    expect(actionRedirectUrl('https://evil.example/lists;push', base)).toBeNull();
    expect(actionRedirectUrl('http://[bad;push', base)).toBeNull();
  });
});

describe('carriesSignedStorageUrl', () => {
  it('spots a signed Storage URL in a server action reply', () => {
    expect(
      carriesSignedStorageUrl(
        '0:{"ok":true,"data":{"url":"https://p.supabase.co/storage/v1/object/sign/resources/a.pdf?token=t"}}',
      ),
    ).toBe(true);
    expect(carriesSignedStorageUrl('0:{"ok":true,"data":{"id":"x"}}')).toBe(false);
  });
});

describe('extractTitle / escapeHtml', () => {
  it('reads and decodes the title', () => {
    expect(extractTitle('<html><head><title>BG 4/19/26 &amp; more · Worship Library</title>')).toBe(
      'BG 4/19/26 & more · Worship Library',
    );
    expect(extractTitle('<title>  </title>')).toBeNull();
    expect(extractTitle('<p>no title</p>')).toBeNull();
  });

  it('names a saved list without the app-name suffix', () => {
    expect(listTitle('<title>BG 4/19/26 · Worship Library</title>')).toBe('BG 4/19/26');
    expect(listTitle('<title> · Worship Library</title>')).toBe('Setlist');
    expect(listTitle('')).toBe('Setlist');
  });

  it('escapes markup characters', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;',
    );
  });
});

describe('parseRange', () => {
  it('parses closed, open-ended and suffix ranges', () => {
    expect(parseRange('bytes=0-99', 1000)).toEqual({ start: 0, end: 99 });
    expect(parseRange('bytes=900-', 1000)).toEqual({ start: 900, end: 999 });
    expect(parseRange('bytes=-100', 1000)).toEqual({ start: 900, end: 999 });
    expect(parseRange('bytes=-5000', 1000)).toEqual({ start: 0, end: 999 });
    expect(parseRange('bytes=10-5000', 1000)).toEqual({ start: 10, end: 999 });
  });

  it('rejects missing, malformed, multi-range and unsatisfiable ranges', () => {
    expect(parseRange(null, 1000)).toBeNull();
    expect(parseRange('bytes=-', 1000)).toBeNull();
    expect(parseRange('bytes=-0', 1000)).toBeNull();
    expect(parseRange('bytes=0-1,5-6', 1000)).toBeNull();
    expect(parseRange('items=0-1', 1000)).toBeNull();
    expect(parseRange('bytes=1000-', 1000)).toBeNull();
    expect(parseRange('bytes=50-10', 1000)).toBeNull();
    expect(parseRange('bytes=0-1', 0)).toBeNull();
  });
});

describe('overflow', () => {
  it('returns the oldest keys beyond the limit', () => {
    expect(overflow([1, 2, 3, 4], 2)).toEqual([1, 2]);
    expect(overflow([1, 2], 2)).toEqual([]);
  });
});

describe('bannerScript', () => {
  it('is a single inline script with the save time embedded safely', () => {
    const script = bannerScript({ savedAt: '2026-04-19T10:00:00.000Z' });
    expect(script.startsWith('<script>')).toBe(true);
    expect(script.endsWith('</script>')).toBe(true);
    expect(script).toContain('var savedAt="2026-04-19T10:00:00.000Z"');
    expect(script).toContain('role","status"');
  });

  it('defaults to a live page (no save time)', () => {
    expect(bannerScript()).toContain('var savedAt=null');
  });

  it('cannot be broken out of by the embedded value', () => {
    const script = bannerScript({ savedAt: '</script><script>alert(1)</script>' });
    expect(script.match(/<\/script>/g)).toHaveLength(1);
  });
});

async function read(stream: ReadableStream<Uint8Array>): Promise<string> {
  return new Response(stream).text();
}

describe('appendToStream', () => {
  it('passes chunks through and appends the suffix at the end', async () => {
    const source = new Response('<html><body>hi</body></html>').body!;
    expect(await read(source.pipeThrough(appendToStream('<script>x</script>')))).toBe(
      '<html><body>hi</body></html><script>x</script>',
    );
  });
});

describe('withBanner', () => {
  it('appends the script to HTML and drops stale framing headers', async () => {
    const res = withBanner(
      new Response('<html><body>page</body></html>', {
        status: 200,
        headers: {
          'content-type': 'text/html; charset=utf-8',
          'content-length': '30',
          'x-keep': '1',
        },
      }),
      { savedAt: '2026-04-19T10:00:00.000Z' },
    );
    expect(res.headers.get('content-length')).toBeNull();
    expect(res.headers.get('x-keep')).toBe('1');
    const html = await res.text();
    expect(html.startsWith('<html><body>page</body></html><script>')).toBe(true);
    expect(html).toContain('2026-04-19T10:00:00.000Z');
  });

  it('leaves non-HTML responses alone', () => {
    const json = new Response('{}', { headers: { 'content-type': 'application/json' } });
    expect(withBanner(json)).toBe(json);
    const empty = new Response(null, { status: 204, headers: { 'content-type': 'text/html' } });
    expect(withBanner(empty)).toBe(empty);
  });
});

describe('offlineFallbackHtml', () => {
  it('links to saved setlists, escaping titles', () => {
    const html = offlineFallbackHtml([
      {
        url: `${ORIGIN}/lists/${LIST_ID}`,
        title: 'BG <4/19/26>',
        savedAt: '2026-04-19T10:00:00.000Z',
      },
    ]);
    expect(html).toContain(`<a href="/lists/${LIST_ID}">BG &lt;4/19/26&gt;</a>`);
    expect(html).toContain('<html lang="en">');
  });

  it('explains what will be available when nothing is saved', () => {
    expect(offlineFallbackHtml([])).toContain('Setlists you open while online');
  });
});

describe('banner behaviour', () => {
  let online = true;

  afterEach(() => {
    vi.restoreAllMocks();
    document.getElementById('offline-banner')?.remove();
    document.getElementById('offline-banner-style')?.remove();
  });

  /** Run the banner script in this jsdom document (already `complete`, so it renders on a tick). */
  async function load(savedAt: string | null, initiallyOnline: boolean) {
    online = initiallyOnline;
    vi.spyOn(window.navigator, 'onLine', 'get').mockImplementation(() => online);
    const code = bannerScript({ savedAt })
      .replace(/^<script>/, '')
      .replace(/<\/script>$/, '');
    // Executing the generated inline script is the behaviour under test.
    new Function(code)();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  function setOnline(value: boolean) {
    online = value;
    window.dispatchEvent(new Event(value ? 'online' : 'offline'));
  }

  const banner = () => document.getElementById('offline-banner');

  it('stays hidden on a live page while online, and appears when the connection drops', async () => {
    await load(null, true);
    expect(banner()).toBeNull();
    setOnline(false);
    expect(banner()?.getAttribute('role')).toBe('status');
    expect(banner()?.getAttribute('aria-live')).toBe('polite');
    expect(banner()?.textContent).toBe(
      'You’re offline. Setlists you’ve opened are still available.Reload',
    );
    expect(document.getElementById('offline-banner-style')).not.toBeNull();
    setOnline(true);
    expect(banner()).toBeNull();
  });

  it('on a saved copy, says when it was saved and offers a reload once back online', async () => {
    await load('2026-04-19T10:00:00.000Z', false);
    expect(banner()?.textContent).toContain('You’re offline. Showing the copy saved');
    const button = banner()?.querySelector('button');
    expect(button?.style.display).toBe('none');
    setOnline(true);
    expect(banner()?.textContent).toBe('You’re back online.Reload');
    expect(button?.style.display).toBe('');
    expect(button?.type).toBe('button');
  });
});

// ---------------------------------------------------------------------------------------------
// Route handlers, against an in-memory CacheStorage and a mocked network
// ---------------------------------------------------------------------------------------------

class MemoryCache {
  entries = new Map<string, Response>();
  async match(key: RequestInfo | URL) {
    return this.entries.get(keyOf(key))?.clone();
  }
  async put(key: RequestInfo | URL, response: Response) {
    this.entries.set(keyOf(key), response);
  }
  async delete(key: RequestInfo | URL) {
    return this.entries.delete(keyOf(key));
  }
  async keys() {
    return [...this.entries.keys()].map((url) => new Request(url));
  }
}

function keyOf(key: RequestInfo | URL): string {
  if (typeof key === 'string') return key;
  return key instanceof URL ? key.href : key.url;
}

describe('route handlers', () => {
  const APP = window.location.origin;
  const LIST_URL = `${APP}/lists/${LIST_ID}`;
  const SIGNED = `http://127.0.0.1:54321/storage/v1/object/sign/resources/songs/s/k/${RESOURCE_ID}.pdf`;
  let stores: Map<string, MemoryCache>;
  let pending: Promise<unknown>[];
  let network: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    stores = new Map();
    pending = [];
    network = vi.fn();
    vi.stubGlobal('fetch', network);
    vi.stubGlobal('caches', {
      open: async (name: string) => {
        if (!stores.has(name)) stores.set(name, new MemoryCache());
        return stores.get(name)!;
      },
      delete: async (name: string) => stores.delete(name),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const event = { waitUntil: (p: Promise<unknown>) => pending.push(p) };
  const settle = () => Promise.all(pending);
  const store = (name: string) => stores.get(name)?.entries ?? new Map<string, Response>();

  /** Handler options. Navigation requests can't be constructed, so they are plain objects. */
  function opts(
    href: string,
    init: { mode?: string; method?: string; headers?: Record<string, string>; body?: string } = {},
  ): RouteHandlerCallbackOptions {
    const request = init.mode
      ? ({
          url: href,
          mode: init.mode,
          headers: new Headers(init.headers),
        } as unknown as Request)
      : new Request(href, { method: init.method, headers: init.headers, body: init.body });
    return { request, url: new URL(href), event } as unknown as RouteHandlerCallbackOptions;
  }

  const html = (title: string) =>
    new Response(
      `<html><head><title>${title} · Worship Library</title></head><body>x</body></html>`,
      {
        headers: { 'content-type': 'text/html; charset=utf-8' },
      },
    );

  describe('navigations', () => {
    it('saves an opened list page and adds the banner script', async () => {
      network.mockResolvedValue(html('BG 4/19/26'));
      const res = await handleNavigation(opts(LIST_URL, { mode: 'navigate' }));
      expect(await res.text()).toMatch(/x<\/body><\/html><script>.*offline-banner/s);
      await settle();
      const saved = store(PAGES_CACHE).get(LIST_URL);
      expect(saved?.headers.get(SAVED_AT_HEADER)).toBeTruthy();
      expect(decodeURIComponent(saved?.headers.get('x-offline-title') ?? '')).toBe('BG 4/19/26');
    });

    it('serves the saved copy offline, marked with its save time', async () => {
      network.mockResolvedValueOnce(html('BG 4/19/26'));
      await handleNavigation(opts(LIST_URL, { mode: 'navigate' }));
      await settle();
      network.mockRejectedValue(new TypeError('Failed to fetch'));
      const res = await handleNavigation(opts(`${LIST_URL}?x=1`, { mode: 'navigate' }));
      const body = await res.text();
      expect(body).toContain('<title>BG 4/19/26 · Worship Library</title>');
      expect(body).toMatch(/var savedAt="\d{4}-\d{2}-\d{2}T/);
    });

    it('answers other offline navigations with a page linking the saved setlists', async () => {
      network.mockResolvedValueOnce(html('BG 4/19/26'));
      await handleNavigation(opts(LIST_URL, { mode: 'navigate' }));
      await settle();
      network.mockRejectedValue(new TypeError('Failed to fetch'));
      const res = await handleNavigation(opts(`${APP}/library`, { mode: 'navigate' }));
      expect(res.status).toBe(503);
      expect(await res.text()).toContain(`<a href="/lists/${LIST_ID}">BG 4/19/26</a>`);
    });

    it('forgets the copy when the list redirects (signed out or no access)', async () => {
      network.mockResolvedValueOnce(html('BG 4/19/26'));
      await handleNavigation(opts(LIST_URL, { mode: 'navigate' }));
      await settle();
      const redirect = new Response(null, { status: 307 });
      Object.defineProperty(redirect, 'type', { value: 'opaqueredirect' });
      network.mockResolvedValue(redirect);
      expect(await handleNavigation(opts(LIST_URL, { mode: 'navigate' }))).toBe(redirect);
      await settle();
      expect(store(PAGES_CACHE).has(LIST_URL)).toBe(false);
    });

    it('clears every offline copy on the sign-in page', async () => {
      network.mockResolvedValueOnce(html('BG 4/19/26'));
      await handleNavigation(opts(LIST_URL, { mode: 'navigate' }));
      await settle();
      network.mockResolvedValue(html('Sign in'));
      await handleNavigation(opts(`${APP}/login`, { mode: 'navigate' }));
      await settle();
      expect(stores.has(PAGES_CACHE)).toBe(false);
    });

    it('does not save non-list pages', async () => {
      network.mockResolvedValue(html('Library'));
      await handleNavigation(opts(`${APP}/library`, { mode: 'navigate' }));
      await settle();
      expect(store(PAGES_CACHE).size).toBe(0);
    });
  });

  describe('client-side list navigations', () => {
    it('refreshes the saved copy in the background', async () => {
      network
        .mockResolvedValueOnce(
          new Response('0:rsc', { headers: { 'content-type': 'text/x-component' } }),
        )
        .mockResolvedValueOnce(html('BG 4/19/26'));
      const res = await handleListRsc(opts(`${LIST_URL}?_rsc=abc`, { headers: { rsc: '1' } }));
      expect(await res.text()).toBe('0:rsc');
      await settle();
      expect(network).toHaveBeenLastCalledWith(LIST_URL, { credentials: 'same-origin' });
      expect(store(PAGES_CACHE).has(LIST_URL)).toBe(true);
    });

    it('skips the refresh when the copy is fresh', async () => {
      network.mockResolvedValueOnce(html('BG 4/19/26'));
      await handleNavigation(opts(LIST_URL, { mode: 'navigate' }));
      await settle();
      network.mockResolvedValue(new Response('0:rsc'));
      await handleListRsc(opts(`${LIST_URL}?_rsc=abc`, { headers: { rsc: '1' } }));
      await settle();
      expect(network).toHaveBeenCalledTimes(2);
    });
  });

  describe('server actions', () => {
    const action = (body = `["${RESOURCE_ID}"]`) =>
      opts(LIST_URL, {
        method: 'POST',
        headers: { 'next-action': 'abc123', 'content-type': 'text/plain;charset=UTF-8' },
        body,
      });
    const signedReply = () =>
      new Response(`0:{"ok":true,"data":{"url":"${SIGNED}?token=t1"}}`, {
        headers: { 'content-type': 'text/x-component' },
      });

    it('replays a signed-URL reply offline', async () => {
      network.mockResolvedValueOnce(signedReply());
      await handleAction(action());
      await settle();
      expect(store(ACTIONS_CACHE).size).toBe(1);
      network.mockRejectedValue(new TypeError('Failed to fetch'));
      const res = await handleAction(action());
      expect(await res.text()).toContain('token=t1');
    });

    it('never keeps other replies, so mutations are not replayed', async () => {
      network.mockResolvedValueOnce(new Response('0:{"ok":true,"data":{"id":"x"}}'));
      await handleAction(action('["x"]'));
      await settle();
      expect(store(ACTIONS_CACHE).size).toBe(0);
      network.mockRejectedValue(new TypeError('Failed to fetch'));
      await expect(handleAction(action('["x"]'))).rejects.toThrow('Failed to fetch');
    });

    it('saves the list page an action redirects to', async () => {
      network
        .mockResolvedValueOnce(
          new Response('0:{}', { headers: { 'x-action-redirect': `/lists/${LIST_ID};push` } }),
        )
        .mockResolvedValueOnce(html('New setlist'));
      await handleAction(action('["a"]'));
      await settle();
      expect(store(PAGES_CACHE).has(LIST_URL)).toBe(true);
    });
  });

  describe('PDFs', () => {
    const pdf = (body = '%PDF-1.4 chart') =>
      new Response(body, { headers: { 'content-type': 'application/pdf' } });
    const KEY = resourceCacheKey(APP, RESOURCE_ID.toLowerCase());

    it('caches the body under the resource id and serves it with any later token', async () => {
      network.mockResolvedValueOnce(pdf());
      const online = await handlePdf(opts(`${SIGNED}?token=t1`));
      expect(await online.text()).toBe('%PDF-1.4 chart');
      await settle();
      expect(store(RESOURCES_CACHE).has(KEY)).toBe(true);

      network.mockRejectedValueOnce(new TypeError('Failed to fetch'));
      expect(await (await handlePdf(opts(`${SIGNED}?token=t2`))).text()).toBe('%PDF-1.4 chart');

      // An expired token: Storage answers 400, the saved body still renders.
      network.mockResolvedValueOnce(new Response('expired', { status: 400 }));
      expect(await (await handlePdf(opts(`${SIGNED}?token=t1`))).text()).toBe('%PDF-1.4 chart');
    });

    it('answers a range request offline from the saved body', async () => {
      network.mockResolvedValueOnce(pdf('0123456789'));
      await handlePdf(opts(`${SIGNED}?token=t1`));
      await settle();
      network.mockRejectedValue(new TypeError('Failed to fetch'));
      const res = await handlePdf(opts(`${SIGNED}?token=t2`, { headers: { range: 'bytes=2-4' } }));
      expect(res.status).toBe(206);
      expect(res.headers.get('content-range')).toBe('bytes 2-4/10');
      expect(await res.text()).toBe('234');
    });

    it('passes failures through when nothing is saved', async () => {
      const denied = new Response('nope', { status: 400 });
      network.mockResolvedValueOnce(denied);
      expect(await handlePdf(opts(`${SIGNED}?token=t1`))).toBe(denied);
      network.mockRejectedValueOnce(new TypeError('Failed to fetch'));
      expect((await handlePdf(opts(`${SIGNED}?token=t1`))).type).toBe('error');
    });
  });
});
