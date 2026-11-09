/// <reference lib="webworker" />
/**
 * Service worker (H-01; REQ-NF-01 installable PWA, REQ-NF-02 offline setlists).
 *
 * Built by `@serwist/next` (next.config.ts) into `public/sw.js` on `next build`; disabled in
 * `next dev`. The page side (registration) is injected by `@serwist/next` into the client entry.
 *
 * What works offline:
 *
 * - **App code**: every `/_next/static` asset and `public/icons/` is precached.
 * - **Setlists the user has opened** (`/lists/<id>`): the HTML is saved on every full load and
 *   refreshed in the background on client-side navigations (`RSC` fetches) and `router.refresh()`.
 *   Pages already open when the worker first activates are saved too. Offline, a list navigation
 *   is answered from the saved copy; any other navigation gets a small "you're offline" page that
 *   links to the saved setlists. Client-side navigations fail over to a full navigation (Next.js
 *   does that when an RSC fetch fails), which then hits the saved copy.
 * - **Their PDFs**: a PDF is opened through the `getSignedResourceUrl` server action, then fetched
 *   from a short-lived signed Storage URL. The PDF body is cached under its **resource id**, never
 *   the signed URL, so an expired token doesn't matter; the action's response is kept too (keyed
 *   by action id + arguments) so that the same button works offline. Only action responses that
 *   carry a signed Storage URL are kept, so mutations are never replayed.
 * - **Offline banner**: a small script is appended to every HTML navigation the worker answers.
 *   It shows a status banner while the browser is offline, and on a saved copy it says when the
 *   copy was saved and offers a reload once the connection is back.
 *
 * Privacy: visiting `/login` (signed out, or switching accounts) clears every offline copy.
 *
 * Pure helpers are exported for unit tests (`app/sw.test.ts`); the worker wiring at the bottom
 * only runs inside a ServiceWorkerGlobalScope.
 */

import type { PrecacheEntry, RouteHandlerCallbackOptions, SerwistGlobalConfig } from 'serwist';

import { Serwist } from 'serwist';

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

// ---------------------------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------------------------

export const PAGES_CACHE = 'offline-pages-v1';
export const RESOURCES_CACHE = 'offline-resources-v1';
export const ACTIONS_CACHE = 'offline-actions-v1';
export const OFFLINE_CACHES = [PAGES_CACHE, RESOURCES_CACHE, ACTIONS_CACHE] as const;

/** Most saved setlists / files / action replies kept; the oldest go first. */
export const MAX_PAGES = 50;
export const MAX_RESOURCES = 300;
export const MAX_ACTIONS = 300;

/** Background refreshes of a saved page are skipped when the copy is younger than this. */
export const REFRESH_AFTER_MS = 30_000;

/** Headers stored on saved pages. */
export const SAVED_AT_HEADER = 'x-offline-saved-at';
export const TITLE_HEADER = 'x-offline-title';

/** Server action arguments longer than this are never used as a cache key. */
const MAX_ACTION_BODY = 2048;

const UUID = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
const LIST_PAGE = new RegExp(`^/lists/${UUID}/?$`);
/** `…/storage/v1/object/sign/resources/songs/{song}/{key|common}/{resource_id}.pdf` */
const SIGNED_PDF = new RegExp(`/storage/v1/object/sign/resources/(?:.+/)?(${UUID})\\.pdf$`, 'i');
const SIGNED_STORAGE_URL = /\/storage\/v1\/object\/sign\//;

// ---------------------------------------------------------------------------------------------
// Pure helpers (unit tested)
// ---------------------------------------------------------------------------------------------

/** Whether `pathname` is a single list page (`/lists/<uuid>`), the pages saved for offline. */
export function isListPagePath(pathname: string): boolean {
  return LIST_PAGE.test(pathname);
}

/** The saved-page key for a list URL: origin + path, no query or hash, no trailing slash. */
export function pageCacheKey(url: URL): string {
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
}

/** The resource id of a signed Storage URL for a PDF, or `null` for anything else. */
export function pdfResourceId(url: URL): string | null {
  const match = SIGNED_PDF.exec(url.pathname);
  return match?.[1] ? match[1].toLowerCase() : null;
}

/** Where a PDF body is cached: under its resource id, so signed-URL tokens don't matter. */
export function resourceCacheKey(origin: string, resourceId: string): string {
  return `${origin}/__offline/resource/${resourceId}`;
}

/**
 * Where a server action reply is cached: the action id plus its serialized arguments. `null`
 * when the arguments can't be a key (multipart / FormData bodies, or too long).
 */
export function actionCacheKey(
  origin: string,
  actionId: string,
  contentType: string | null,
  body: string,
): string | null {
  if (!actionId || !(contentType ?? '').startsWith('text/plain')) return null;
  if (body.length > MAX_ACTION_BODY) return null;
  return `${origin}/__offline/action/${encodeURIComponent(actionId)}?args=${encodeURIComponent(body)}`;
}

/**
 * The same-origin target of a server action redirect (`x-action-redirect: <url>;<push|replace>`),
 * e.g. sign-in or "create setlist" landing on a list page. `null` when absent or cross-origin.
 */
export function actionRedirectUrl(header: string | null, base: string): URL | null {
  const location = header?.split(';')[0]?.trim();
  if (!location) return null;
  try {
    const url = new URL(location, base);
    return url.origin === new URL(base).origin ? url : null;
  } catch {
    return null;
  }
}

/** Whether a server action reply carries a signed Storage URL (`getSignedResourceUrl`). */
export function carriesSignedStorageUrl(text: string): boolean {
  return SIGNED_STORAGE_URL.test(text);
}

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#x27;': "'",
  '&#39;': "'",
};

/** The document `<title>`, entity-decoded and trimmed; `null` when there is none. */
export function extractTitle(html: string): string | null {
  const match = /<title[^>]*>([^<]*)<\/title>/i.exec(html);
  if (!match?.[1]) return null;
  const title = match[1].replace(/&(?:amp|lt|gt|quot|#x27|#39);/g, (e) => ENTITIES[e] ?? e).trim();
  return title || null;
}

/** A saved list's name for the offline page: the title without the app-name suffix. */
export function listTitle(html: string): string {
  const title = extractTitle(html)
    ?.replace(/(?:^|\s+)·\s+Worship Library$/, '')
    .trim();
  return title || 'Setlist';
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Parse a single-range `Range` header against a body of `size` bytes. Returns the inclusive
 * byte range, or `null` when the header is missing, multi-range or unsatisfiable.
 */
export function parseRange(
  header: string | null,
  size: number,
): { start: number; end: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec((header ?? '').trim());
  if (!match || size <= 0) return null;
  const [, rawStart = '', rawEnd = ''] = match;
  if (rawStart === '' && rawEnd === '') return null;
  let start: number;
  let end: number;
  if (rawStart === '') {
    // Suffix range: the last N bytes.
    const length = Number(rawEnd);
    if (length === 0) return null;
    start = Math.max(0, size - length);
    end = size - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd === '' ? size - 1 : Math.min(Number(rawEnd), size - 1);
  }
  if (start > end || start >= size) return null;
  return { start, end };
}

/** Options for the offline banner script appended to HTML pages. */
export type BannerOptions = {
  /** ISO time the page was saved, when it is being served from the offline copy. */
  savedAt?: string | null;
};

/**
 * Banner styles. A pill centred near the bottom: above the mobile tab bar (h-14 + safe area,
 * hidden from `xl`) and the PDF viewer's page controls, clear of the sticky header.
 */
const BANNER_CSS = [
  '#offline-banner{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(var(--bottom-nav-height,56px) + 16px);z-index:2147483000;display:flex;align-items:center;gap:12px;width:max-content;max-width:calc(100vw - 16px);box-sizing:border-box;padding:8px 14px;border-radius:9999px;background:#171717;color:#fafafa;font:500 14px/1.4 system-ui,-apple-system,sans-serif;box-shadow:0 4px 12px rgba(0,0,0,.25)}',
  '#offline-banner button{flex:none;min-height:32px;padding:2px 12px;border-radius:9999px;border:1px solid #fafafa;background:transparent;color:inherit;font:inherit;cursor:pointer}',
  '#offline-banner button:focus-visible{outline:2px solid #fafafa;outline-offset:2px}',
  '@media (min-width:1280px){#offline-banner{bottom:24px}}',
].join('');

/**
 * The `<script>` appended to every HTML navigation the worker answers. Self-contained (no React,
 * no Tailwind): it builds the banner itself, after hydration has had a chance to run, and keeps it
 * in sync with `online` / `offline` events.
 */
export function bannerScript({ savedAt = null }: BannerOptions = {}): string {
  // JSON in a <script>: escape `<` so a value can never close the tag.
  const saved = JSON.stringify(savedAt).replace(/</g, '\\u003c');
  return `<script>(function(){
var savedAt=${saved};var id="offline-banner";var el=null;
function when(){try{return new Date(savedAt).toLocaleString(undefined,{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"});}catch(e){return "";}}
function build(){
el=document.createElement("div");el.id=id;el.setAttribute("role","status");el.setAttribute("aria-live","polite");
if(!document.getElementById(id+"-style")){var css=document.createElement("style");css.id=id+"-style";css.textContent=${JSON.stringify(BANNER_CSS)};document.head.appendChild(css);}
var text=document.createElement("span");text.setAttribute("data-offline-text","");el.appendChild(text);
var btn=document.createElement("button");btn.type="button";btn.textContent="Reload";
btn.addEventListener("click",function(){location.reload();});el.appendChild(btn);return el;}
function render(){
var offline=navigator.onLine===false;
if(!offline&&!savedAt){if(el&&el.parentNode)el.parentNode.removeChild(el);return;}
if(!el)build();
var msg=offline?(savedAt?"You\\u2019re offline. Showing the copy saved "+when()+".":"You\\u2019re offline. Setlists you\\u2019ve opened are still available."):"You\\u2019re back online.";
el.querySelector("[data-offline-text]").textContent=msg;
el.lastChild.style.display=offline?"none":"";
if(!el.isConnected)document.body.appendChild(el);}
function start(){setTimeout(render,0);}
window.addEventListener("online",render);window.addEventListener("offline",render);
if(document.readyState==="complete")start();else window.addEventListener("load",start);
})();</script>`;
}

/** Append `suffix` after the last chunk of an HTML stream (the parser puts it in `<body>`). */
export function appendToStream(suffix: string): TransformStream<Uint8Array, Uint8Array> {
  return new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      controller.enqueue(chunk);
    },
    flush(controller) {
      controller.enqueue(new TextEncoder().encode(suffix));
    },
  });
}

function isHtml(response: Response): boolean {
  return (response.headers.get('content-type') ?? '').includes('text/html');
}

/** `response` with the banner script appended. Non-HTML and unreadable responses pass through. */
export function withBanner(response: Response, options: BannerOptions = {}): Response {
  if (!response.body || response.type === 'opaqueredirect' || !isHtml(response)) return response;
  const headers = new Headers(response.headers);
  // The body is decoded and grows; the original framing headers no longer apply.
  headers.delete('content-length');
  headers.delete('content-encoding');
  return new Response(response.body.pipeThrough(appendToStream(bannerScript(options))), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export type SavedPage = { url: string; title: string; savedAt: string };

/** The page shown for a navigation that fails offline and has no saved copy. */
export function offlineFallbackHtml(saved: readonly SavedPage[]): string {
  const items = saved
    .map(
      (p) => `<li><a href="${escapeHtml(new URL(p.url).pathname)}">${escapeHtml(p.title)}</a></li>`,
    )
    .join('');
  const list = saved.length
    ? `<p>Setlists you’ve opened on this device:</p><ul>${items}</ul>`
    : '<p>Setlists you open while online will be available here offline.</p>';
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Offline · Worship Library</title><style>body{margin:0;font:16px/1.5 system-ui,-apple-system,sans-serif;color:#171717;background:#fff}main{max-width:40rem;margin:0 auto;padding:72px 16px 24px}h1{font-size:1.5rem;margin:0 0 8px}ul{padding-left:1.25rem}li{margin:6px 0}a{color:inherit}</style></head><body><main><h1>This page isn’t available offline</h1>${list}</main></body></html>`;
}

/** Entries beyond `max`, oldest first, given keys in insertion order. */
export function overflow<T>(keys: readonly T[], max: number): T[] {
  return keys.length > max ? keys.slice(0, keys.length - max) : [];
}

// ---------------------------------------------------------------------------------------------
// Cache operations (worker only)
// ---------------------------------------------------------------------------------------------

async function trim(cacheName: string, max: number): Promise<void> {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  await Promise.all(overflow(keys, max).map((key) => cache.delete(key)));
}

/** Save a list page's HTML (with its title and save time) when it is a real, readable page. */
async function savePage(url: URL, response: Response): Promise<void> {
  if (
    response.type.startsWith('opaque') ||
    !response.ok ||
    response.redirected ||
    !isHtml(response)
  ) {
    return;
  }
  const html = await response.text();
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.delete('content-encoding');
  headers.set(SAVED_AT_HEADER, new Date().toISOString());
  headers.set(TITLE_HEADER, encodeURIComponent(listTitle(html)));
  const cache = await caches.open(PAGES_CACHE);
  await cache.put(pageCacheKey(url), new Response(html, { status: 200, headers }));
  await trim(PAGES_CACHE, MAX_PAGES);
}

/** Fetch and save a list page in the background, unless the saved copy is fresh. */
async function refreshPage(url: URL, force = false): Promise<void> {
  const cache = await caches.open(PAGES_CACHE);
  if (!force) {
    const existing = await cache.match(pageCacheKey(url));
    const savedAt = Date.parse(existing?.headers.get(SAVED_AT_HEADER) ?? '');
    if (Number.isFinite(savedAt) && Date.now() - savedAt < REFRESH_AFTER_MS) return;
  }
  const response = await fetch(pageCacheKey(url), { credentials: 'same-origin' });
  if (response.redirected) {
    // Signed out or no longer allowed: forget the copy rather than keep stale private data.
    await cache.delete(pageCacheKey(url));
    return;
  }
  await savePage(url, response);
}

async function savedPages(): Promise<SavedPage[]> {
  const cache = await caches.open(PAGES_CACHE);
  const keys = await cache.keys();
  const pages = await Promise.all(
    keys.map(async (key) => {
      const res = await cache.match(key);
      return {
        url: key.url,
        title: decodeURIComponent(res?.headers.get(TITLE_HEADER) ?? 'Setlist'),
        savedAt: res?.headers.get(SAVED_AT_HEADER) ?? '',
      };
    }),
  );
  return pages.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

async function clearOffline(): Promise<void> {
  await Promise.all(OFFLINE_CACHES.map((name) => caches.delete(name)));
}

function waitUntil(event: ExtendableEvent, work: Promise<unknown>): void {
  // Background caching must never break the response it rides on.
  event.waitUntil(work.catch(() => undefined));
}

// ---------------------------------------------------------------------------------------------
// Route handlers (worker only; exported for tests)
// ---------------------------------------------------------------------------------------------

export async function handleNavigation({ request, event, url }: RouteHandlerCallbackOptions) {
  let response: Response;
  try {
    response = await fetch(request);
  } catch (error) {
    if (isListPagePath(url.pathname)) {
      const saved = await (await caches.open(PAGES_CACHE)).match(pageCacheKey(url));
      if (saved) return withBanner(saved, { savedAt: saved.headers.get(SAVED_AT_HEADER) });
    }
    if (request.mode !== 'navigate') throw error;
    return new Response(offlineFallbackHtml(await savedPages()), {
      status: 503,
      headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
    });
  }
  if (isListPagePath(url.pathname)) {
    if (response.type === 'opaqueredirect' || response.redirected) {
      waitUntil(
        event,
        caches.open(PAGES_CACHE).then((c) => c.delete(pageCacheKey(url))),
      );
    } else {
      waitUntil(event, savePage(url, response.clone()));
    }
  } else if (url.pathname === '/login' && response.ok) {
    waitUntil(event, clearOffline());
  }
  return withBanner(response);
}

/** Client-side navigation / refresh of a list page: pass through, refresh the saved copy. */
export async function handleListRsc({ request, event, url }: RouteHandlerCallbackOptions) {
  const response = await fetch(request);
  if (response.ok) waitUntil(event, refreshPage(url));
  return response;
}

export async function handleAction({ request, event, url }: RouteHandlerCallbackOptions) {
  const body = await request
    .clone()
    .text()
    .catch(() => '');
  const key = actionCacheKey(
    url.origin,
    request.headers.get('next-action') ?? '',
    request.headers.get('content-type'),
    body,
  );
  try {
    const response = await fetch(request);
    // A redirect into a list page renders it from the action reply, with no RSC fetch to hook.
    const target = actionRedirectUrl(response.headers.get('x-action-redirect'), url.href);
    if (target && isListPagePath(target.pathname)) waitUntil(event, refreshPage(target));
    if (key && response.ok) {
      const copy = response.clone();
      waitUntil(
        event,
        (async () => {
          const text = await copy.text();
          if (!carriesSignedStorageUrl(text)) return;
          const cache = await caches.open(ACTIONS_CACHE);
          await cache.put(key, new Response(text, { status: 200, headers: copy.headers }));
          await trim(ACTIONS_CACHE, MAX_ACTIONS);
        })(),
      );
    }
    return response;
  } catch (error) {
    const cached = key ? await (await caches.open(ACTIONS_CACHE)).match(key) : undefined;
    if (cached) return cached;
    throw error;
  }
}

async function cachedSlice(cached: Response, rangeHeader: string): Promise<Response | null> {
  const blob = await cached.blob();
  const range = parseRange(rangeHeader, blob.size);
  if (!range) return null;
  return new Response(blob.slice(range.start, range.end + 1), {
    status: 206,
    headers: {
      'content-type': cached.headers.get('content-type') ?? 'application/pdf',
      'content-range': `bytes ${range.start}-${range.end}/${blob.size}`,
      'content-length': String(range.end - range.start + 1),
    },
  });
}

/** A PDF from a signed Storage URL: network first, cached under the resource id. */
export async function handlePdf({ request, event, url }: RouteHandlerCallbackOptions) {
  const resourceId = pdfResourceId(url);
  if (!resourceId) return fetch(request);
  const key = resourceCacheKey(self.location.origin, resourceId);
  const range = request.headers.get('range');

  let response: Response | undefined;
  try {
    response = await fetch(request);
  } catch {
    response = undefined;
  }
  if (response?.ok) {
    if (response.status === 200 && !range) {
      const copy = response.clone();
      waitUntil(
        event,
        (async () => {
          const blob = await copy.blob();
          const cache = await caches.open(RESOURCES_CACHE);
          await cache.put(
            key,
            new Response(blob, {
              status: 200,
              headers: {
                'content-type': copy.headers.get('content-type') ?? 'application/pdf',
                'content-length': String(blob.size),
              },
            }),
          );
          await trim(RESOURCES_CACHE, MAX_RESOURCES);
        })(),
      );
    }
    return response;
  }

  // Offline, or the signed URL has expired (Storage answers 400): use the saved body.
  const cached = await (await caches.open(RESOURCES_CACHE)).match(key);
  if (cached) {
    if (range) return (await cachedSlice(cached, range)) ?? cached;
    return cached;
  }
  if (response) return response;
  return Response.error();
}

/**
 * On activation, save list pages that are already open (the first visit loads before the worker
 * controls the page) and re-save the existing copies: a new deploy ships new asset hashes, and the
 * old assets leave the precache, so old copies would no longer render. Offline, the fetches fail
 * and the old copies stay.
 */
async function resaveListPages(): Promise<void> {
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const open = windows.map((client) => client.url);
  const saved = (await savedPages()).map((p) => p.url);
  const urls = new Map<string, URL>();
  for (const href of [...open, ...saved]) {
    const u = new URL(href);
    if (u.origin === self.location.origin && isListPagePath(u.pathname))
      urls.set(pageCacheKey(u), u);
  }
  await Promise.all([...urls.values()].map((u) => refreshPage(u, true).catch(() => undefined)));
}

// ---------------------------------------------------------------------------------------------
// Worker wiring
// ---------------------------------------------------------------------------------------------

function isServiceWorker(): boolean {
  return (
    typeof ServiceWorkerGlobalScope !== 'undefined' &&
    globalThis instanceof ServiceWorkerGlobalScope
  );
}

if (isServiceWorker()) {
  const serwist = new Serwist({
    precacheEntries: self.__SW_MANIFEST,
    skipWaiting: true,
    clientsClaim: true,
    navigationPreload: false,
    disableDevLogs: true,
    runtimeCaching: [
      {
        matcher: ({ request, sameOrigin }) => sameOrigin && request.mode === 'navigate',
        handler: handleNavigation,
      },
      {
        matcher: ({ request, sameOrigin, url }) =>
          sameOrigin &&
          request.headers.get('rsc') === '1' &&
          !request.headers.has('next-router-prefetch') &&
          isListPagePath(url.pathname),
        handler: handleListRsc,
      },
      {
        method: 'POST',
        matcher: ({ request, sameOrigin }) => sameOrigin && request.headers.has('next-action'),
        handler: handleAction,
      },
      {
        matcher: ({ url }) => pdfResourceId(url) !== null,
        handler: handlePdf,
      },
    ],
  });
  serwist.addEventListeners();
  self.addEventListener('activate', (event) => {
    event.waitUntil(resaveListPages().catch(() => undefined));
  });
}
