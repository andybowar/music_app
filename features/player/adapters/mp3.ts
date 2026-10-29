// contracts/api.md `PlayerAdapter` → features/player/adapters/mp3.ts (PLAY-02).
// HTML5 Audio implementation for `{ type: 'mp3' }` tracks (REQ-LIST-05).
//
// Behaviour the player driver (PLAY-05) can rely on:
// - `load(t)` resolves on the first `canplay` or `loadedmetadata` and rejects if the element errors
//   first. A load failure is reported only through the rejected promise — `onError` is NOT also
//   called, so the driver dispatches TRACK_ERROR once.
// - Calling `load` again before the previous load settles rejects the previous promise with an
//   `Mp3LoadAbortedError` (check `isMp3LoadAborted`), which is not a track failure and should not
//   be dispatched as TRACK_ERROR. Events from a superseded track never reach the callbacks.
// - `onEnded` / `onError` fire only for the current, successfully loaded track. Each call replaces
//   the previously registered callback (one listener per slot, so re-registering cannot leak).
// - A rejected `audio.play()` (e.g. corrupt stream) is reported through `onError`, except for
//   `AbortError`, which the browser raises when a pause/stop/load legitimately interrupts it.
// - `stop()` pauses and rewinds to 0. `destroy()` detaches every listener, drops callbacks,
//   releases the media resource (`src`), and turns the adapter inert: later `load` calls reject
//   and the other methods are no-ops.
// - The audio element is created lazily on first `load`, so constructing the adapter is SSR-safe.
//
// YouTube tracks are a programming error here; `load` rejects with a TypeError naming the type.

import type { PlayerAdapter, Track } from '../engine';

export class Mp3LoadAbortedError extends Error {
  constructor(message = 'MP3 load superseded by a newer load, stop or destroy') {
    super(message);
    this.name = 'Mp3LoadAbortedError';
  }
}

export function isMp3LoadAborted(err: unknown): err is Mp3LoadAbortedError {
  return err instanceof Mp3LoadAbortedError;
}

type PendingLoad = { reject: (err: Error) => void; cleanup: () => void };

export function createMp3Adapter(
  createAudio: () => HTMLAudioElement = () => new Audio(),
): PlayerAdapter {
  let audio: HTMLAudioElement | null = null;
  let destroyed = false;
  let ready = false; // the current track finished loading and has not been superseded
  let pending: PendingLoad | null = null;
  let endedCb: (() => void) | null = null;
  let errorCb: (() => void) | null = null;

  const handleEnded = () => {
    if (ready) endedCb?.();
  };
  const handleError = () => {
    // During a load the per-load listener rejects the promise instead.
    if (ready) errorCb?.();
  };

  function element(): HTMLAudioElement {
    if (!audio) {
      audio = createAudio();
      audio.preload = 'auto';
      audio.addEventListener('ended', handleEnded);
      audio.addEventListener('error', handleError);
    }
    return audio;
  }

  function abortPending() {
    if (!pending) return;
    const p = pending;
    pending = null;
    p.cleanup();
    p.reject(new Mp3LoadAbortedError());
  }

  return {
    load(t: Track): Promise<void> {
      if (destroyed) return Promise.reject(new Error('MP3 adapter has been destroyed'));
      if (t.source.type !== 'mp3') {
        return Promise.reject(
          new TypeError(`MP3 adapter cannot load a '${t.source.type}' track (${t.id})`),
        );
      }
      abortPending();
      ready = false;
      const el = element();
      const url = t.source.url;

      return new Promise<void>((resolve, reject) => {
        const onReady = () => {
          cleanup();
          pending = null;
          ready = true;
          resolve();
        };
        const onFail = () => {
          cleanup();
          pending = null;
          reject(new Error(`MP3 failed to load: ${t.id}`));
        };
        const cleanup = () => {
          el.removeEventListener('canplay', onReady);
          el.removeEventListener('loadedmetadata', onReady);
          el.removeEventListener('error', onFail);
        };
        pending = { reject, cleanup };
        el.addEventListener('canplay', onReady);
        el.addEventListener('loadedmetadata', onReady);
        el.addEventListener('error', onFail);
        el.src = url;
        el.load();
      });
    },

    play() {
      if (destroyed || !audio || !ready) return;
      const result = audio.play();
      // Older engines return undefined rather than a promise.
      if (result && typeof result.catch === 'function') {
        result.catch((err: unknown) => {
          // DOMException is not an `instanceof Error` in every engine, so check the name only.
          const aborted =
            typeof err === 'object' &&
            err !== null &&
            (err as { name?: unknown }).name === 'AbortError';
          if (!aborted && ready && !destroyed) errorCb?.();
        });
      }
    },

    pause() {
      if (destroyed || !audio) return;
      audio.pause();
    },

    stop() {
      if (destroyed || !audio) return;
      abortPending();
      audio.pause();
      audio.currentTime = 0;
    },

    onEnded(cb: () => void) {
      if (!destroyed) endedCb = cb;
    },

    onError(cb: () => void) {
      if (!destroyed) errorCb = cb;
    },

    destroy() {
      if (destroyed) return;
      destroyed = true;
      ready = false;
      abortPending();
      endedCb = null;
      errorCb = null;
      if (audio) {
        const el = audio;
        audio = null;
        el.removeEventListener('ended', handleEnded);
        el.removeEventListener('error', handleError);
        el.pause();
        el.removeAttribute('src');
        el.load(); // releases the network/decoder resource per the HTML spec
      }
    },
  };
}
