// contracts/api.md `PlayerAdapter` over the YouTube IFrame Player API (PLAY-03, REQ-LIST-05).
//
// - The official API script (https://www.youtube.com/iframe_api) is injected at most once per page,
//   however many adapters exist; a failed or timed-out load is reported and can be retried.
// - Each adapter owns one player (one iframe) and reuses it across tracks with `cueVideoById`.
// - `load()` resolves once the player is ready with the video cued, and rejects on a player error,
//   a timeout, being superseded by a newer `load()` (AbortError) or `destroy()` (AbortError).
// - Errors while a load is pending reject that load only; `onError` fires for errors after a
//   track has loaded, so the caller never sees both for the same failure.
// - `onEnded` / `onError` register a single callback each (a later call replaces the earlier one).
// - SSR-safe: nothing touches `window` or `document` until `load()` is called.

import type { PlayerAdapter, Track } from '@/features/player/engine';

export const YOUTUBE_IFRAME_API_SRC = 'https://www.youtube.com/iframe_api';

const DEFAULT_SCRIPT_TIMEOUT_MS = 15_000;
const DEFAULT_LOAD_TIMEOUT_MS = 20_000;

// YT.PlayerState values we act on.
const STATE_ENDED = 0;
const STATE_CUED = 5;

// Minimal slice of the IFrame API that this adapter uses (no @types dependency).
export type YouTubePlayer = {
  cueVideoById(videoId: string): void;
  playVideo(): void;
  pauseVideo(): void;
  stopVideo(): void;
  destroy(): void;
  getVideoData?(): { video_id?: string } | undefined;
  getVideoUrl?(): string;
};

export type YouTubePlayerOptions = {
  width?: number | string;
  height?: number | string;
  playerVars?: Record<string, string | number>;
  events: {
    onReady(e: { target: YouTubePlayer }): void;
    onStateChange(e: { data: number; target: YouTubePlayer }): void;
    onError(e: { data: number; target: YouTubePlayer }): void;
  };
};

export type YouTubeNamespace = {
  Player: new (el: HTMLElement, opts: YouTubePlayerOptions) => YouTubePlayer;
};

type YouTubeGlobals = { YT?: Partial<YouTubeNamespace>; onYouTubeIframeAPIReady?: () => void };

const ERROR_MESSAGES: Record<number, string> = {
  2: 'invalid video ID',
  5: 'the HTML5 player could not play this video',
  100: 'video not found or private',
  101: 'the owner does not allow embedded playback',
  150: 'the owner does not allow embedded playback',
};

export class YouTubePlayerError extends Error {
  readonly code: number;
  constructor(code: number) {
    super(`YouTube player error ${code}: ${ERROR_MESSAGES[code] ?? 'unknown error'}`);
    this.name = 'YouTubePlayerError';
    this.code = code;
  }
}

function abortError(message: string): Error {
  const e = new Error(message);
  e.name = 'AbortError';
  return e;
}

function readyNamespace(g: YouTubeGlobals): YouTubeNamespace | null {
  return typeof g.YT?.Player === 'function' ? (g.YT as YouTubeNamespace) : null;
}

let apiPromise: Promise<YouTubeNamespace> | null = null;

/** Loads the IFrame API once per page. Rejects (and allows a later retry) if the script fails. */
export function loadYouTubeIframeApi(
  timeoutMs: number = DEFAULT_SCRIPT_TIMEOUT_MS,
): Promise<YouTubeNamespace> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(new Error('The YouTube IFrame API can only load in a browser'));
  }
  const g = window as unknown as YouTubeGlobals;
  const ready = readyNamespace(g);
  if (ready) return Promise.resolve(ready);
  if (apiPromise) return apiPromise;

  apiPromise = new Promise<YouTubeNamespace>((resolve, reject) => {
    const previousReady = g.onYouTubeIframeAPIReady;
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${YOUTUBE_IFRAME_API_SRC}"]`,
    );
    const script = existing ?? document.createElement('script');

    const cleanup = () => {
      clearTimeout(timer);
      script.removeEventListener('error', onScriptError);
    };
    const fail = (err: Error) => {
      cleanup();
      g.onYouTubeIframeAPIReady = previousReady;
      if (!existing) script.remove();
      apiPromise = null; // let a later load() retry
      reject(err);
    };
    const onScriptError = () => fail(new Error('Failed to load the YouTube IFrame API script'));

    g.onYouTubeIframeAPIReady = () => {
      cleanup();
      previousReady?.();
      const ns = readyNamespace(g);
      if (ns) resolve(ns);
      else fail(new Error('The YouTube IFrame API loaded without YT.Player'));
    };
    script.addEventListener('error', onScriptError);
    // Declared last; only callbacks that run later read it.
    const timer = setTimeout(
      () => fail(new Error(`Timed out loading the YouTube IFrame API after ${timeoutMs} ms`)),
      timeoutMs,
    );
    if (!existing) {
      script.src = YOUTUBE_IFRAME_API_SRC;
      script.async = true;
      document.head.appendChild(script);
    }
  });
  return apiPromise;
}

export type YouTubeAdapterOptions = {
  /** Where the player iframe mounts. Default: a compact fixed box appended to `document.body`. */
  container?: HTMLElement;
  /** How long `load()` waits for the player to be ready with the video cued. */
  loadTimeoutMs?: number;
  /** How long to wait for the API script, if this adapter is the one that injects it. */
  scriptTimeoutMs?: number;
};

type Pending = {
  gen: number;
  videoId: string;
  resolve(): void;
  reject(err: Error): void;
  timer: ReturnType<typeof setTimeout>;
};

function loadedVideoId(p: YouTubePlayer): string | null {
  const fromData = p.getVideoData?.()?.video_id;
  if (fromData) return fromData;
  const url = p.getVideoUrl?.();
  if (!url) return null;
  try {
    return new URL(url).searchParams.get('v');
  } catch {
    return null;
  }
}

export function createYouTubeAdapter(options: YouTubeAdapterOptions = {}): PlayerAdapter {
  const loadTimeoutMs = options.loadTimeoutMs ?? DEFAULT_LOAD_TIMEOUT_MS;
  const scriptTimeoutMs = options.scriptTimeoutMs ?? DEFAULT_SCRIPT_TIMEOUT_MS;

  let destroyed = false;
  let generation = 0;
  let pending: Pending | null = null;
  let loaded: string | null = null; // videoId that is cued and controllable
  let host: HTMLElement | null = null;
  let player: YouTubePlayer | null = null;
  let playerReady: Promise<YouTubePlayer> | null = null;
  let endedCb: (() => void) | null = null;
  let errorCb: (() => void) | null = null;

  function settle(gen: number, err?: Error) {
    if (!pending || pending.gen !== gen) return;
    const p = pending;
    pending = null;
    clearTimeout(p.timer);
    if (err) {
      p.reject(err);
    } else {
      loaded = p.videoId;
      p.resolve();
    }
  }

  function abortPending(message: string) {
    if (pending) settle(pending.gen, abortError(message));
  }

  // True when the player reports a different video than `expected` (stale event).
  function isOtherVideo(target: YouTubePlayer, expected: string): boolean {
    const actual = loadedVideoId(target);
    return actual !== null && actual !== expected;
  }

  function onStateChange(e: { data: number; target: YouTubePlayer }) {
    if (destroyed) return;
    if (pending) {
      if (e.data === STATE_CUED && !isOtherVideo(e.target, pending.videoId)) settle(pending.gen);
      return; // anything else while loading belongs to the previous video
    }
    if (e.data === STATE_ENDED && loaded !== null && !isOtherVideo(e.target, loaded)) endedCb?.();
  }

  function onPlayerError(e: { data: number }) {
    if (destroyed) return;
    if (pending) settle(pending.gen, new YouTubePlayerError(e.data));
    else if (loaded !== null) errorCb?.();
  }

  function ensurePlayer(): Promise<YouTubePlayer> {
    if (playerReady) return playerReady;
    const attempt = loadYouTubeIframeApi(scriptTimeoutMs).then(
      (YT) =>
        new Promise<YouTubePlayer>((resolve, reject) => {
          if (destroyed) {
            reject(abortError('YouTube adapter was destroyed'));
            return;
          }
          host = document.createElement('div');
          host.dataset.youtubePlayer = '';
          if (options.container) {
            options.container.appendChild(host);
          } else {
            // Compact but visible: YouTube's terms forbid hiding the player.
            host.style.cssText =
              'position:fixed;right:8px;bottom:8px;width:200px;height:200px;z-index:40;';
            document.body.appendChild(host);
          }
          const target = document.createElement('div');
          host.appendChild(target);
          player = new YT.Player(target, {
            width: '100%',
            height: '100%',
            playerVars: { playsinline: 1, rel: 0, modestbranding: 1 },
            events: { onReady: (e) => resolve(e.target), onStateChange, onError: onPlayerError },
          });
        }),
    );
    playerReady = attempt;
    attempt.catch(() => {
      if (playerReady === attempt) playerReady = null; // retry on the next load()
    });
    return attempt;
  }

  function controllable(): YouTubePlayer | null {
    return !destroyed && !pending && loaded !== null ? player : null;
  }

  return {
    load(t: Track): Promise<void> {
      if (destroyed) return Promise.reject(new Error('YouTube adapter has been destroyed'));
      if (t.source.type !== 'youtube') {
        return Promise.reject(
          new TypeError(`YouTube adapter cannot play a ${t.source.type} track (track ${t.id})`),
        );
      }
      if (typeof window === 'undefined' || typeof document === 'undefined') {
        return Promise.reject(new Error('YouTube adapter can only load tracks in a browser'));
      }
      const videoId = t.source.videoId;
      abortPending('Superseded by a newer load()');
      loaded = null;
      const gen = ++generation;
      return new Promise<void>((resolve, reject) => {
        const timer = setTimeout(
          () => settle(gen, new Error(`Timed out loading YouTube video ${videoId}`)),
          loadTimeoutMs,
        );
        pending = { gen, videoId, resolve, reject, timer };
        ensurePlayer().then(
          (p) => {
            if (gen === generation && !destroyed) p.cueVideoById(videoId);
          },
          (err: unknown) => settle(gen, err instanceof Error ? err : new Error(String(err))),
        );
      });
    },
    play() {
      controllable()?.playVideo();
    },
    pause() {
      controllable()?.pauseVideo();
    },
    stop() {
      controllable()?.stopVideo();
    },
    onEnded(cb) {
      endedCb = cb;
    },
    onError(cb) {
      errorCb = cb;
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      generation++;
      abortPending('YouTube adapter was destroyed');
      loaded = null;
      endedCb = null;
      errorCb = null;
      try {
        player?.destroy();
      } catch {
        // The iframe may already be gone; teardown continues regardless.
      }
      player = null;
      host?.remove();
      host = null;
    },
  };
}
