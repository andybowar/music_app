import type { Track } from '../engine';
import { createMp3Adapter, isMp3LoadAborted, Mp3LoadAbortedError } from './mp3';

// jsdom does not play media, so the adapter is driven through a minimal fake element that
// records listeners and lets each test fire media events by hand.
class FakeAudio {
  src = '';
  preload = '';
  currentTime = 0;
  paused = true;
  playResult: Promise<void> | undefined = Promise.resolve();
  readonly load = vi.fn();
  readonly pause = vi.fn(() => {
    this.paused = true;
  });
  readonly play = vi.fn(() => {
    this.paused = false;
    return this.playResult;
  });
  readonly removeAttribute = vi.fn((name: string) => {
    if (name === 'src') this.src = '';
  });
  private readonly listeners = new Map<string, Set<() => void>>();

  addEventListener(type: string, fn: () => void) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)?.add(fn);
  }
  removeEventListener(type: string, fn: () => void) {
    this.listeners.get(type)?.delete(fn);
  }
  emit(type: string) {
    for (const fn of [...(this.listeners.get(type) ?? [])]) fn();
  }
  listenerCount(): number {
    let n = 0;
    for (const set of this.listeners.values()) n += set.size;
    return n;
  }
}

function mp3(id: string, url = `https://example.test/${id}.mp3`): Track {
  return { id, title: id, source: { type: 'mp3', url } };
}

const youtube: Track = { id: 'yt', title: 'yt', source: { type: 'youtube', videoId: 'abc' } };

function setup() {
  const fake = new FakeAudio();
  const createAudio = vi.fn(() => fake as unknown as HTMLAudioElement);
  const adapter = createMp3Adapter(createAudio);
  return { fake, createAudio, adapter };
}

// Let promise callbacks (e.g. play() rejections) run.
const flush = () => new Promise<void>((r) => setTimeout(r, 0));

async function loaded() {
  const s = setup();
  const p = s.adapter.load(mp3('a'));
  s.fake.emit('canplay');
  await p;
  return s;
}

describe('createMp3Adapter', () => {
  describe('load', () => {
    it('creates the element lazily, once, with preload=auto', async () => {
      const { fake, createAudio, adapter } = setup();
      expect(createAudio).not.toHaveBeenCalled();
      const p = adapter.load(mp3('a'));
      expect(createAudio).toHaveBeenCalledTimes(1);
      expect(fake.preload).toBe('auto');
      fake.emit('canplay');
      await p;
      const q = adapter.load(mp3('b'));
      fake.emit('canplay');
      await q;
      expect(createAudio).toHaveBeenCalledTimes(1);
    });

    it('sets src, calls load() and resolves on canplay', async () => {
      const { fake, adapter } = setup();
      const p = adapter.load(mp3('a', 'https://example.test/x.mp3'));
      expect(fake.src).toBe('https://example.test/x.mp3');
      expect(fake.load).toHaveBeenCalledTimes(1);
      fake.emit('canplay');
      await expect(p).resolves.toBeUndefined();
    });

    it('resolves on loadedmetadata and ignores a later canplay', async () => {
      const { fake, adapter } = setup();
      const p = adapter.load(mp3('a'));
      const before = fake.listenerCount();
      fake.emit('loadedmetadata');
      await expect(p).resolves.toBeUndefined();
      expect(fake.listenerCount()).toBe(before - 3); // per-load listeners removed
      fake.emit('canplay'); // no throw, nothing pending
    });

    it('rejects on an element error without calling onError', async () => {
      const { fake, adapter } = setup();
      const onError = vi.fn();
      adapter.onError(onError);
      const p = adapter.load(mp3('broken'));
      fake.emit('error');
      await expect(p).rejects.toThrow('MP3 failed to load: broken');
      expect(onError).not.toHaveBeenCalled();
      // The failed track is not "ready", so play is a no-op and later events stay silent.
      adapter.play();
      expect(fake.play).not.toHaveBeenCalled();
      fake.emit('error');
      expect(onError).not.toHaveBeenCalled();
    });

    it('rejects a youtube track with a clear TypeError and leaves the element untouched', async () => {
      const { createAudio, adapter } = setup();
      await expect(adapter.load(youtube)).rejects.toThrow(
        new TypeError("MP3 adapter cannot load a 'youtube' track (yt)"),
      );
      expect(createAudio).not.toHaveBeenCalled();
    });
  });

  describe('swapping tracks', () => {
    it('aborts a pending load when a new one starts; stale events do not settle the new one', async () => {
      const { fake, adapter } = setup();
      const first = adapter.load(mp3('a'));
      const second = adapter.load(mp3('b'));
      const firstErr: unknown = await first.catch((e: unknown) => e);
      expect(firstErr).toBeInstanceOf(Mp3LoadAbortedError);
      expect(isMp3LoadAborted(firstErr)).toBe(true);
      expect(fake.src).toBe('https://example.test/b.mp3');

      let settled = false;
      void second.then(() => (settled = true));
      await flush();
      expect(settled).toBe(false);
      fake.emit('canplay');
      await second;
      expect(settled).toBe(true);
    });

    it('does not fire onEnded/onError while the next track is loading', async () => {
      const { fake, adapter } = await loaded();
      const onEnded = vi.fn();
      const onError = vi.fn();
      adapter.onEnded(onEnded);
      adapter.onError(onError);
      const next = adapter.load(mp3('b'));
      fake.emit('ended'); // late event from the previous track
      expect(onEnded).not.toHaveBeenCalled();
      fake.emit('canplay');
      await next;
      fake.emit('ended');
      expect(onEnded).toHaveBeenCalledTimes(1);
      expect(onError).not.toHaveBeenCalled();
    });

    it('keeps listener count stable across many loads', async () => {
      const { fake, adapter } = await loaded();
      const baseline = fake.listenerCount();
      for (const id of ['b', 'c', 'd']) {
        const p = adapter.load(mp3(id));
        fake.emit('canplay');
        await p;
      }
      void adapter.load(mp3('e')).catch(() => undefined);
      void adapter.load(mp3('f')).catch(() => undefined);
      fake.emit('canplay');
      expect(fake.listenerCount()).toBe(baseline);
    });
  });

  describe('play / pause / stop', () => {
    it('play is a no-op before any track is ready', () => {
      const { fake, adapter } = setup();
      adapter.play();
      void adapter.load(mp3('a'));
      adapter.play();
      expect(fake.play).not.toHaveBeenCalled();
    });

    it('play, pause and stop drive the element', async () => {
      const { fake, adapter } = await loaded();
      adapter.play();
      expect(fake.play).toHaveBeenCalledTimes(1);
      expect(fake.paused).toBe(false);
      fake.currentTime = 42;
      adapter.pause();
      expect(fake.paused).toBe(true);
      expect(fake.currentTime).toBe(42);
      adapter.play();
      adapter.stop();
      expect(fake.paused).toBe(true);
      expect(fake.currentTime).toBe(0);
      // After stop the track is still loaded and replays from the start.
      adapter.play();
      expect(fake.play).toHaveBeenCalledTimes(3);
    });

    it('pause and stop are safe before the element exists', () => {
      const { createAudio, adapter } = setup();
      adapter.pause();
      adapter.stop();
      expect(createAudio).not.toHaveBeenCalled();
    });

    it('stop aborts a pending load', async () => {
      const { fake, adapter } = setup();
      const p = adapter.load(mp3('a'));
      adapter.stop();
      await expect(p).rejects.toBeInstanceOf(Mp3LoadAbortedError);
      fake.emit('canplay'); // stale, nothing listening
      adapter.play();
      expect(fake.play).not.toHaveBeenCalled();
    });

    it('a rejected play() fires onError', async () => {
      const { fake, adapter } = await loaded();
      const onError = vi.fn();
      adapter.onError(onError);
      fake.playResult = Promise.reject(new DOMException('bad stream', 'NotSupportedError'));
      adapter.play();
      await flush();
      expect(onError).toHaveBeenCalledTimes(1);
    });

    it('a non-Error play() rejection still fires onError', async () => {
      const { fake, adapter } = await loaded();
      const onError = vi.fn();
      adapter.onError(onError);
      fake.playResult = Promise.reject('nope');
      adapter.play();
      await flush();
      expect(onError).toHaveBeenCalledTimes(1);
    });

    it('an AbortError from play() (interrupted by pause/load) is ignored', async () => {
      const { fake, adapter } = await loaded();
      const onError = vi.fn();
      adapter.onError(onError);
      fake.playResult = Promise.reject(new DOMException('interrupted', 'AbortError'));
      adapter.play();
      await flush();
      expect(onError).not.toHaveBeenCalled();
    });

    it('a play() rejection that lands after a track swap or destroy is ignored', async () => {
      const { fake, adapter } = await loaded();
      const onError = vi.fn();
      adapter.onError(onError);
      let rejectPlay: (e: Error) => void = () => undefined;
      fake.playResult = new Promise<void>((_, rej) => (rejectPlay = rej));
      adapter.play();
      void adapter.load(mp3('b')).catch(() => undefined);
      rejectPlay(new Error('late'));
      await flush();
      expect(onError).not.toHaveBeenCalled();

      const s = await loaded();
      const onError2 = vi.fn();
      s.adapter.onError(onError2);
      s.fake.playResult = new Promise<void>((_, rej) => (rejectPlay = rej));
      s.adapter.play();
      s.adapter.destroy();
      rejectPlay(new Error('late'));
      await flush();
      expect(onError2).not.toHaveBeenCalled();
    });

    it('tolerates engines where play() returns undefined', async () => {
      const { fake, adapter } = await loaded();
      fake.playResult = undefined;
      expect(() => adapter.play()).not.toThrow();
    });
  });

  describe('callbacks', () => {
    it('onEnded fires when the loaded track ends', async () => {
      const { fake, adapter } = await loaded();
      const onEnded = vi.fn();
      adapter.onEnded(onEnded);
      fake.emit('ended');
      expect(onEnded).toHaveBeenCalledTimes(1);
    });

    it('onError fires for a playback error after load', async () => {
      const { fake, adapter } = await loaded();
      const onError = vi.fn();
      adapter.onError(onError);
      fake.emit('error');
      expect(onError).toHaveBeenCalledTimes(1);
    });

    it('re-registering replaces the previous callback', async () => {
      const { fake, adapter } = await loaded();
      const a = vi.fn();
      const b = vi.fn();
      adapter.onEnded(a);
      adapter.onEnded(b);
      adapter.onError(a);
      adapter.onError(b);
      fake.emit('ended');
      fake.emit('error');
      expect(a).not.toHaveBeenCalled();
      expect(b).toHaveBeenCalledTimes(2);
    });

    it('events with no registered callback are harmless', async () => {
      const { fake } = await loaded();
      expect(() => {
        fake.emit('ended');
        fake.emit('error');
      }).not.toThrow();
    });
  });

  describe('destroy', () => {
    it('releases listeners and src, and pauses', async () => {
      const { fake, adapter } = await loaded();
      adapter.play();
      adapter.destroy();
      expect(fake.listenerCount()).toBe(0);
      expect(fake.paused).toBe(true);
      expect(fake.removeAttribute).toHaveBeenCalledWith('src');
      expect(fake.src).toBe('');
      expect(fake.load).toHaveBeenCalledTimes(2); // initial load + release
    });

    it('rejects a pending load as aborted', async () => {
      const { fake, adapter } = setup();
      const p = adapter.load(mp3('a'));
      adapter.destroy();
      await expect(p).rejects.toBeInstanceOf(Mp3LoadAbortedError);
      expect(fake.listenerCount()).toBe(0);
    });

    it('makes every method inert afterwards and is idempotent', async () => {
      const { fake, createAudio, adapter } = await loaded();
      const onEnded = vi.fn();
      adapter.onEnded(onEnded);
      adapter.destroy();
      adapter.destroy();
      expect(fake.removeAttribute).toHaveBeenCalledTimes(1);

      await expect(adapter.load(mp3('b'))).rejects.toThrow('MP3 adapter has been destroyed');
      adapter.play();
      adapter.pause();
      adapter.stop();
      const late = vi.fn();
      adapter.onEnded(late);
      adapter.onError(late);
      fake.emit('ended');
      fake.emit('error');
      expect(fake.play).toHaveBeenCalledTimes(0);
      expect(fake.pause).toHaveBeenCalledTimes(1); // only destroy's own pause
      expect(onEnded).not.toHaveBeenCalled();
      expect(late).not.toHaveBeenCalled();
      expect(createAudio).toHaveBeenCalledTimes(1);
    });

    it('works before any element was created', () => {
      const { createAudio, adapter } = setup();
      adapter.destroy();
      expect(createAudio).not.toHaveBeenCalled();
    });
  });

  it('defaults to a real HTMLAudioElement', async () => {
    // jsdom does not implement media loading; stub it and read the element from the spy's `this`.
    const loadSpy = vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
    const pauseSpy = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    try {
      const adapter = createMp3Adapter();
      const p = adapter.load(mp3('a'));
      const el = loadSpy.mock.contexts[0] as HTMLMediaElement | undefined;
      expect(el).toBeInstanceOf(HTMLAudioElement);
      el?.dispatchEvent(new Event('loadedmetadata'));
      await expect(p).resolves.toBeUndefined();
      adapter.destroy();
      expect(el?.hasAttribute('src')).toBe(false);
    } finally {
      loadSpy.mockRestore();
      pauseSpy.mockRestore();
    }
  });
});
