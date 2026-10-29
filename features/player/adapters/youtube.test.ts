import type { PlayerAdapter, Track } from '@/features/player/engine';

import type * as YouTubeModule from './youtube';
import type { YouTubePlayer, YouTubePlayerOptions } from './youtube';

type Mod = typeof YouTubeModule;
type Globals = { YT?: unknown; onYouTubeIframeAPIReady?: () => void };
const g = window as unknown as Globals;

const SRC = 'https://www.youtube.com/iframe_api';
const VIDEO_A = 'testVideo01';
const VIDEO_B = 'testVideo02';

function yt(id: string, videoId: string): Track {
  return { id, title: `Song ${id}`, source: { type: 'youtube', videoId } };
}
const A = yt('a', VIDEO_A);
const B = yt('b', VIDEO_B);
const MP3: Track = {
  id: 'm',
  title: 'Song m',
  source: { type: 'mp3', url: 'https://example.test/m.mp3' },
};

class FakePlayer implements YouTubePlayer {
  static instances: FakePlayer[] = [];
  videoId: string | null = null;
  calls: string[] = [];
  reportVideoId = true;
  urlOnly = false;
  url: string | undefined;
  iframe: HTMLIFrameElement;
  constructor(
    el: HTMLElement,
    public opts: YouTubePlayerOptions,
  ) {
    // Like the real API, replace the target element with an iframe.
    this.iframe = document.createElement('iframe');
    el.replaceWith(this.iframe);
    FakePlayer.instances.push(this);
  }
  cueVideoById(id: string) {
    this.calls.push(`cue:${id}`);
    this.videoId = id;
  }
  playVideo() {
    this.calls.push('play');
  }
  pauseVideo() {
    this.calls.push('pause');
  }
  stopVideo() {
    this.calls.push('stop');
  }
  destroy() {
    this.calls.push('destroy');
    this.iframe.remove();
  }
  getVideoData() {
    return this.reportVideoId && !this.urlOnly ? { video_id: this.videoId ?? '' } : undefined;
  }
  getVideoUrl() {
    if (this.url !== undefined) return this.url;
    return this.urlOnly && this.videoId ? `https://www.youtube.com/watch?v=${this.videoId}` : '';
  }
  // Test drivers.
  ready() {
    this.opts.events.onReady({ target: this });
  }
  state(data: number) {
    this.opts.events.onStateChange({ data, target: this });
  }
  error(data: number) {
    this.opts.events.onError({ data, target: this });
  }
}

function installYT() {
  g.YT = { Player: FakePlayer };
}

const flush = () => new Promise<void>((r) => setTimeout(r, 0));

let mod: Mod;

beforeEach(async () => {
  vi.resetModules();
  vi.useRealTimers();
  FakePlayer.instances = [];
  delete g.YT;
  delete g.onYouTubeIframeAPIReady;
  document.head.innerHTML = '';
  document.body.innerHTML = '';
  mod = await import('./youtube');
});

function player(i = 0): FakePlayer {
  const p = FakePlayer.instances[i];
  if (!p) throw new Error(`no player ${i}`);
  return p;
}

// Loads `t` on `a` with YT already present, driving the fake to ready + cued.
async function loadReady(a: PlayerAdapter, t: Track, i = 0): Promise<void> {
  const done = a.load(t);
  await flush();
  const p = player(i);
  if (p.calls.filter((c) => c.startsWith('cue')).length === 0) p.ready();
  await flush();
  p.state(5);
  await done;
}

describe('loadYouTubeIframeApi', () => {
  it('injects the script once and resolves every caller when the API is ready', async () => {
    const prev = vi.fn();
    g.onYouTubeIframeAPIReady = prev;
    const p1 = mod.loadYouTubeIframeApi();
    const p2 = mod.loadYouTubeIframeApi();
    expect(p1).toBe(p2);
    const scripts = document.querySelectorAll(`script[src="${SRC}"]`);
    expect(scripts).toHaveLength(1);
    expect((scripts[0] as HTMLScriptElement).async).toBe(true);
    installYT();
    g.onYouTubeIframeAPIReady?.();
    await expect(p1).resolves.toMatchObject({ Player: FakePlayer });
    expect(prev).toHaveBeenCalledOnce();
    // Once ready, later calls resolve straight from window.YT.
    await expect(mod.loadYouTubeIframeApi()).resolves.toMatchObject({ Player: FakePlayer });
    expect(document.querySelectorAll('script')).toHaveLength(1);
  });

  it('resolves immediately when YT.Player already exists', async () => {
    installYT();
    await expect(mod.loadYouTubeIframeApi()).resolves.toMatchObject({ Player: FakePlayer });
    expect(document.querySelector('script')).toBeNull();
  });

  it('reuses a script tag injected by someone else', async () => {
    const s = document.createElement('script');
    s.src = SRC;
    document.head.appendChild(s);
    const p = mod.loadYouTubeIframeApi();
    expect(document.querySelectorAll('script')).toHaveLength(1);
    installYT();
    g.onYouTubeIframeAPIReady?.();
    await expect(p).resolves.toBeDefined();
  });

  it('keeps a foreign script tag when it fails to load', async () => {
    const s = document.createElement('script');
    s.src = SRC;
    document.head.appendChild(s);
    const p = mod.loadYouTubeIframeApi();
    s.dispatchEvent(new Event('error'));
    await expect(p).rejects.toThrow('Failed to load the YouTube IFrame API script');
    expect(document.querySelector('script')).toBe(s);
  });

  it('rejects on script error, restores the global callback and allows a retry', async () => {
    const prev = vi.fn();
    g.onYouTubeIframeAPIReady = prev;
    const p = mod.loadYouTubeIframeApi();
    document.querySelector('script')!.dispatchEvent(new Event('error'));
    await expect(p).rejects.toThrow('Failed to load the YouTube IFrame API script');
    expect(document.querySelector('script')).toBeNull();
    expect(g.onYouTubeIframeAPIReady).toBe(prev);

    const retry = mod.loadYouTubeIframeApi();
    expect(retry).not.toBe(p);
    expect(document.querySelectorAll('script')).toHaveLength(1);
    installYT();
    g.onYouTubeIframeAPIReady?.();
    await expect(retry).resolves.toBeDefined();
  });

  it('rejects when the script times out', async () => {
    vi.useFakeTimers();
    const p = mod.loadYouTubeIframeApi(1000);
    const assertion = expect(p).rejects.toThrow(
      'Timed out loading the YouTube IFrame API after 1000 ms',
    );
    await vi.advanceTimersByTimeAsync(1000);
    await assertion;
    expect(document.querySelector('script')).toBeNull();
  });

  it('rejects when the ready callback fires without YT.Player', async () => {
    const p = mod.loadYouTubeIframeApi();
    g.YT = { loaded: 0 };
    g.onYouTubeIframeAPIReady?.();
    await expect(p).rejects.toThrow('loaded without YT.Player');
  });
});

describe('createYouTubeAdapter', () => {
  it('does not touch window or document until load()', () => {
    const spy = vi.spyOn(document, 'createElement');
    const a = mod.createYouTubeAdapter();
    a.play();
    a.pause();
    a.stop();
    expect(spy).not.toHaveBeenCalled();
    expect(document.querySelector('script')).toBeNull();
    a.destroy();
    spy.mockRestore();
  });

  it('loads the API script, mounts a compact player on body and resolves once cued', async () => {
    const a = mod.createYouTubeAdapter();
    let settled = false;
    const done = a.load(A).then(() => {
      settled = true;
    });
    expect(document.querySelector(`script[src="${SRC}"]`)).not.toBeNull();
    installYT();
    g.onYouTubeIframeAPIReady?.();
    await flush();
    const p = player();
    const host = document.body.querySelector<HTMLElement>('[data-youtube-player]');
    expect(host).not.toBeNull();
    expect(host!.style.position).toBe('fixed');
    expect(host!.contains(p.iframe)).toBe(true);
    expect(p.opts.playerVars).toMatchObject({ playsinline: 1 });
    expect(p.calls).toEqual([]);
    p.ready();
    await flush();
    expect(p.calls).toEqual([`cue:${VIDEO_A}`]);
    p.state(-1); // unstarted: not ready yet
    await flush();
    expect(settled).toBe(false);
    p.state(5);
    await done;
    expect(settled).toBe(true);
  });

  it('mounts inside the provided container', async () => {
    installYT();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const a = mod.createYouTubeAdapter({ container });
    await loadReady(a, A);
    const host = container.querySelector<HTMLElement>('[data-youtube-player]');
    expect(host).not.toBeNull();
    expect(host!.style.position).toBe('');
    a.destroy();
    expect(container.children).toHaveLength(0);
  });

  it('shares one script load between several adapters', async () => {
    const a1 = mod.createYouTubeAdapter();
    const a2 = mod.createYouTubeAdapter();
    const l1 = a1.load(A);
    const l2 = a2.load(B);
    expect(document.querySelectorAll('script')).toHaveLength(1);
    installYT();
    g.onYouTubeIframeAPIReady?.();
    await flush();
    expect(FakePlayer.instances).toHaveLength(2);
    player(0).ready();
    player(1).ready();
    await flush();
    player(0).state(5);
    player(1).state(5);
    await expect(Promise.all([l1, l2])).resolves.toBeDefined();
  });

  it('rejects an mp3 track with a clear TypeError and creates nothing', async () => {
    installYT();
    const a = mod.createYouTubeAdapter();
    const err = await a.load(MP3).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TypeError);
    expect((err as Error).message).toBe('YouTube adapter cannot play a mp3 track (track m)');
    expect(FakePlayer.instances).toHaveLength(0);
  });

  it('rejects load() when the API script fails, then succeeds on retry', async () => {
    const a = mod.createYouTubeAdapter();
    const first = a.load(A);
    document.querySelector('script')!.dispatchEvent(new Event('error'));
    await expect(first).rejects.toThrow('Failed to load the YouTube IFrame API script');
    expect(document.querySelector('[data-youtube-player]')).toBeNull();

    const second = a.load(A);
    installYT();
    g.onYouTubeIframeAPIReady?.();
    await flush();
    player().ready();
    await flush();
    player().state(5);
    await expect(second).resolves.toBeUndefined();
  });

  it('wraps a non-Error rejection from the loader', async () => {
    installYT();
    g.YT = {
      Player: function () {
        throw 'boom';
      },
    };
    const a = mod.createYouTubeAdapter();
    await expect(a.load(A)).rejects.toThrow('boom');
  });

  it('rejects load() with a YouTubePlayerError on a player error and maps codes', async () => {
    installYT();
    const a = mod.createYouTubeAdapter();
    const onError = vi.fn();
    a.onError(onError);
    const cases: Array<[number, string]> = [
      [2, 'invalid video ID'],
      [5, 'HTML5 player'],
      [100, 'not found'],
      [101, 'embedded playback'],
      [150, 'embedded playback'],
      [999, 'unknown error'],
    ];
    for (const [code, text] of cases) {
      const done = a.load(A);
      await flush();
      if (player().calls.length === 0) player().ready();
      await flush();
      player().error(code);
      const err = await done.catch((e: unknown) => e);
      expect(err).toBeInstanceOf(mod.YouTubePlayerError);
      expect((err as InstanceType<Mod['YouTubePlayerError']>).code).toBe(code);
      expect((err as Error).message).toContain(text);
    }
    // A pending-load error rejects the load only; onError is for loaded tracks.
    expect(onError).not.toHaveBeenCalled();
    expect(FakePlayer.instances).toHaveLength(1);
  });

  it('rejects load() on timeout when the player never becomes ready', async () => {
    vi.useFakeTimers();
    installYT();
    const a = mod.createYouTubeAdapter({ loadTimeoutMs: 500 });
    const done = a.load(A);
    const assertion = expect(done).rejects.toThrow(`Timed out loading YouTube video ${VIDEO_A}`);
    await vi.advanceTimersByTimeAsync(500);
    await assertion;
    // Late events after the timeout are ignored.
    player().ready();
    await vi.advanceTimersByTimeAsync(0);
    player().state(5);
    a.play();
    expect(player().calls).toEqual([`cue:${VIDEO_A}`]);
  });

  it('play/pause/stop drive the player only once a track is loaded', async () => {
    installYT();
    const a = mod.createYouTubeAdapter();
    const done = a.load(A);
    await flush();
    a.play(); // before ready: no-op
    player().ready();
    await flush();
    a.play(); // cued but not confirmed: no-op
    player().state(5);
    await done;
    a.play();
    a.pause();
    a.stop();
    expect(player().calls).toEqual([`cue:${VIDEO_A}`, 'play', 'pause', 'stop']);
  });

  it('fires onEnded on ENDED for the loaded video, and onError for later errors', async () => {
    installYT();
    const a = mod.createYouTubeAdapter();
    const onEnded = vi.fn();
    const onError = vi.fn();
    a.onEnded(onEnded);
    a.onError(onError);
    await loadReady(a, A);
    player().state(1); // playing: ignored
    player().state(2); // paused: ignored
    expect(onEnded).not.toHaveBeenCalled();
    player().state(0);
    expect(onEnded).toHaveBeenCalledOnce();
    player().error(150);
    expect(onError).toHaveBeenCalledOnce();
    expect(onEnded.mock.calls[0]).toEqual([]);
    expect(onError.mock.calls[0]).toEqual([]);
  });

  it('works without registered callbacks and replaces callbacks on re-registration', async () => {
    installYT();
    const a = mod.createYouTubeAdapter();
    await loadReady(a, A);
    expect(() => player().state(0)).not.toThrow();
    expect(() => player().error(5)).not.toThrow();
    const first = vi.fn();
    const second = vi.fn();
    a.onEnded(first);
    a.onEnded(second);
    player().state(0);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
  });

  it('ignores ENDED and errors when nothing is loaded yet', async () => {
    installYT();
    const a = mod.createYouTubeAdapter();
    const onEnded = vi.fn();
    const onError = vi.fn();
    a.onEnded(onEnded);
    a.onError(onError);
    const done = a.load(A);
    await flush();
    player().ready();
    await flush();
    player().state(0); // ENDED while loading: stale
    expect(onEnded).not.toHaveBeenCalled();
    player().error(5);
    await expect(done).rejects.toBeInstanceOf(mod.YouTubePlayerError);
    // After a failed load nothing is loaded: further events are ignored.
    player().state(0);
    player().error(5);
    expect(onEnded).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it('swaps videos on the same player without stale events', async () => {
    installYT();
    const a = mod.createYouTubeAdapter();
    const onEnded = vi.fn();
    a.onEnded(onEnded);
    await loadReady(a, A);

    const second = a.load(B);
    await flush();
    expect(player().calls).toEqual([`cue:${VIDEO_A}`, `cue:${VIDEO_B}`]);
    a.play(); // mid-swap: no-op
    player().state(0); // late ENDED from A while B is loading
    expect(onEnded).not.toHaveBeenCalled();
    player().state(5);
    await second;
    expect(FakePlayer.instances).toHaveLength(1);
    player().state(0);
    expect(onEnded).toHaveBeenCalledOnce();
  });

  it('aborts a superseded load and ignores its stale CUED', async () => {
    installYT();
    const a = mod.createYouTubeAdapter();
    const first = a.load(A);
    await flush();
    player().ready();
    await flush();
    const second = a.load(B);
    const err = await first.catch((e: unknown) => e);
    expect((err as Error).name).toBe('AbortError');
    await flush();
    // CUED for A arrives after B was cued: the player reports A, so it is ignored.
    player().videoId = VIDEO_A;
    let settled = false;
    void second.then(() => (settled = true));
    player().state(5);
    await flush();
    expect(settled).toBe(false);
    player().videoId = VIDEO_B;
    player().state(5);
    await expect(second).resolves.toBeUndefined();
  });

  it('aborts a load superseded before the player was ready and cues only the latest', async () => {
    installYT();
    const a = mod.createYouTubeAdapter();
    const first = a.load(A);
    const second = a.load(B);
    await expect(first).rejects.toMatchObject({ name: 'AbortError' });
    await flush();
    expect(FakePlayer.instances).toHaveLength(1);
    player().ready();
    await flush();
    expect(player().calls).toEqual([`cue:${VIDEO_B}`]);
    player().state(5);
    await second;
  });

  it('identifies the video from getVideoUrl when getVideoData is unavailable', async () => {
    installYT();
    const a = mod.createYouTubeAdapter();
    const onEnded = vi.fn();
    a.onEnded(onEnded);
    const done = a.load(A);
    await flush();
    const p = player();
    p.urlOnly = true;
    p.ready();
    await flush();
    p.state(5);
    await done;
    p.videoId = VIDEO_B; // URL now names another video: stale ENDED ignored
    p.state(0);
    expect(onEnded).not.toHaveBeenCalled();
    p.videoId = VIDEO_A;
    p.state(0);
    expect(onEnded).toHaveBeenCalledOnce();
    // A player exposing neither getVideoData nor getVideoUrl is trusted too.
    Object.assign(p, { getVideoData: undefined, getVideoUrl: undefined });
    p.state(0);
    expect(onEnded).toHaveBeenCalledTimes(2);
  });

  it('accepts events when the player cannot report its video', async () => {
    installYT();
    const a = mod.createYouTubeAdapter();
    const onEnded = vi.fn();
    a.onEnded(onEnded);
    const done = a.load(A);
    await flush();
    const p = player();
    p.reportVideoId = false;
    p.url = 'not a url';
    p.ready();
    await flush();
    p.state(5);
    await done;
    p.state(0);
    expect(onEnded).toHaveBeenCalledOnce();
  });

  it('destroy() tears down the player and DOM, aborts a pending load and silences events', async () => {
    installYT();
    const a = mod.createYouTubeAdapter();
    const onEnded = vi.fn();
    const onError = vi.fn();
    a.onEnded(onEnded);
    a.onError(onError);
    await loadReady(a, A);
    const pending = a.load(B);
    await flush();
    const p = player();
    a.destroy();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(p.calls).toContain('destroy');
    expect(document.querySelector('[data-youtube-player]')).toBeNull();
    expect(document.querySelector('iframe')).toBeNull();

    // Destroy-then-call: everything is inert and load() rejects clearly.
    p.state(5);
    p.state(0);
    p.error(5);
    a.play();
    a.pause();
    a.stop();
    a.destroy(); // idempotent
    expect(onEnded).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    expect(p.calls.filter((c) => c === 'destroy')).toHaveLength(1);
    expect(p.calls).not.toContain('play');
    await expect(a.load(A)).rejects.toThrow('YouTube adapter has been destroyed');
  });

  it('destroy() before the API loads creates no player', async () => {
    const a = mod.createYouTubeAdapter();
    const done = a.load(A);
    a.destroy();
    await expect(done).rejects.toMatchObject({ name: 'AbortError' });
    installYT();
    g.onYouTubeIframeAPIReady?.();
    await flush();
    expect(FakePlayer.instances).toHaveLength(0);
    expect(document.querySelector('[data-youtube-player]')).toBeNull();
  });

  it('destroy() survives a player whose destroy throws', async () => {
    installYT();
    const a = mod.createYouTubeAdapter();
    await loadReady(a, A);
    player().destroy = () => {
      throw new Error('gone');
    };
    expect(() => a.destroy()).not.toThrow();
    expect(document.querySelector('[data-youtube-player]')).toBeNull();
  });

  it('destroy() on an unused adapter is a no-op', () => {
    const a = mod.createYouTubeAdapter();
    expect(() => a.destroy()).not.toThrow();
  });
});

describe('without a browser', () => {
  it('rejects loading instead of touching window', async () => {
    vi.stubGlobal('window', undefined);
    try {
      await expect(mod.loadYouTubeIframeApi()).rejects.toThrow('can only load in a browser');
      const a = mod.createYouTubeAdapter();
      await expect(a.load(A)).rejects.toThrow('can only load tracks in a browser');
      a.destroy();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('imports without a window', async () => {
    vi.stubGlobal('window', undefined);
    vi.stubGlobal('document', undefined);
    try {
      vi.resetModules();
      const fresh = await import('./youtube');
      expect(typeof fresh.createYouTubeAdapter).toBe('function');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
