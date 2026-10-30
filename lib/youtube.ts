/**
 * YouTube URL parsing (contracts/api.md "Pure modules"; REQ-LIB-09, REQ-LIST-05).
 *
 * `parseYouTubeId` pulls the 11-character video id out of the URL shapes people paste:
 *
 *   https://www.youtube.com/watch?v=ID&t=30s      (also m., music. and the bare domain)
 *   https://youtu.be/ID?si=…
 *   https://www.youtube.com/shorts/ID
 *   https://www.youtube.com/embed/ID              (also youtube-nocookie.com)
 *   https://www.youtube.com/live/ID, /v/ID
 *
 * Extra query params, fragments, trailing slashes, surrounding whitespace and a missing
 * `https://` are tolerated. Anything else (other hosts, look-alike hosts, non-http(s)
 * schemes, playlists/channels, malformed ids) returns `null`.
 *
 * Pure: no I/O, safe on client and server.
 */

/** YouTube video ids are 11 chars of base64url. */
const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

/** Hosts serving `/watch`, `/shorts/…`, `/embed/…` (compared after lowercasing). */
const YOUTUBE_HOSTS: ReadonlySet<string> = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
]);

const SHORT_HOSTS: ReadonlySet<string> = new Set(['youtu.be', 'www.youtu.be']);

/** Path prefixes whose next segment is the video id. */
const ID_PATH_PREFIXES: ReadonlySet<string> = new Set(['shorts', 'embed', 'live', 'v']);

/** Has an explicit `scheme:` (e.g. `https:`, `ftp:`, `javascript:`), so we don't add one. */
const HAS_SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;

function toUrl(raw: string): URL | null {
  const text = raw.trim();
  if (!text) return null;
  // Accept `youtu.be/ID` / `www.youtube.com/watch?v=ID` pasted without a scheme.
  const withScheme = HAS_SCHEME_RE.test(text) ? text : `https://${text}`;
  try {
    return new URL(withScheme);
  } catch {
    return null;
  }
}

/** The YouTube video id in `url`, or `null` when it isn't a recognisable YouTube video link. */
export function parseYouTubeId(url: string): string | null {
  const parsed = toUrl(url);
  if (!parsed) return null;
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;

  const host = parsed.hostname.toLowerCase();
  const segments = parsed.pathname.split('/').filter(Boolean);

  let id: string | null | undefined;
  if (SHORT_HOSTS.has(host)) {
    id = segments.length === 1 ? segments[0] : null;
  } else if (YOUTUBE_HOSTS.has(host)) {
    const [first, second] = segments;
    if (first === 'watch' && segments.length === 1) {
      id = parsed.searchParams.get('v');
    } else if (first !== undefined && ID_PATH_PREFIXES.has(first) && segments.length === 2) {
      id = second;
    }
  }

  return id && VIDEO_ID_RE.test(id) ? id : null;
}
