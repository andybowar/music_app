'use client';

// PLAY-05 · Wires the pure playback reducer (PLAY-01) to the MP3 (PLAY-02) and YouTube (PLAY-03)
// adapters (REQ-LIST-05). The reducer decides *what* should happen; this hook makes it happen:
//
//   status loading → load queue[index] on the adapter for its source, then TRACK_READY or
//                    TRACK_ERROR (so an unplayable track is skipped and the next one loads)
//   status playing → adapter.play()        status paused → adapter.pause()
//   status idle/ended → cancel any pending load and adapter.stop()
//   adapter onEnded → TRACK_ENDED (auto-advance)   adapter onError → TRACK_ERROR (skip)
//
// Adapter semantics follow agent-spec/change-requests/PLAY-03-adapter-factory-and-mount.md: a
// failed load() rejects without also calling onError, and a superseded load() rejects with an
// abort error that is not a track failure. Loads are additionally tagged with a generation, so a
// late result for a track the user already moved past is dropped.
//
// The queue comes from the caller (`tracks`) and may change while playing (the user picks another
// recording, reorders or removes a song). `syncQueue` folds the new tracks in without
// interrupting the current track when it is still there.

import { useCallback, useEffect, useReducer, useRef, type RefObject } from 'react';

import { createMp3Adapter } from '@/features/player/adapters/mp3';
import { createYouTubeAdapter } from '@/features/player/adapters/youtube';
import {
  createInitialPlayerState,
  playerReducer,
  type PlayerAdapter,
  type PlayerEvent,
  type PlayerState,
  type Track,
} from '@/features/player/engine';

export type PlayerAdapterFactories = {
  mp3(): PlayerAdapter;
  youtube(container: HTMLElement | undefined): PlayerAdapter;
};

export type UsePlayerOptions = {
  /**
   * Called right before a track loads, e.g. to swap in a fresh signed URL for a stored MP3.
   * A rejection counts as a track failure (the track is skipped).
   */
  resolveTrack?(track: Track): Promise<Track>;
  /** Test seam; defaults to the real MP3 and YouTube adapters. */
  adapters?: PlayerAdapterFactories;
};

export type UsePlayer = {
  state: PlayerState;
  dispatch(e: PlayerEvent): void;
  /** Start playing the queue from `index` (a position in `tracks`). */
  playFrom(index: number): void;
  /** Mount this on a visible element: the YouTube iframe goes inside it (YouTube's terms forbid hiding it). */
  youtubeContainerRef: RefObject<HTMLDivElement | null>;
};

const DEFAULT_ADAPTERS: PlayerAdapterFactories = {
  mp3: () => createMp3Adapter(),
  youtube: (container) => createYouTubeAdapter({ container }),
};

type HookEvent = PlayerEvent | { type: 'SYNC'; tracks: Track[] };

/** Identity of what a track plays, so a changed recording for the same song reloads it. */
export function trackKey(t: Track | undefined): string {
  if (!t) return '';
  return t.source.type === 'mp3'
    ? `${t.id}|mp3|${t.source.url}`
    : `${t.id}|youtube|${t.source.videoId}`;
}

function sameQueue(a: readonly Track[], b: readonly Track[]): boolean {
  return a.length === b.length && a.every((t, i) => trackKey(t) === trackKey(b[i]));
}

/**
 * Fold a new list of tracks into the player state.
 * - Not started (idle) or finished (ended): adopt the queue, keep the selected track if it is
 *   still there, never start playback.
 * - Active (loading/playing/paused) and the current track is still queued with the same source:
 *   keep it playing at its new position. With a different source (another recording was picked
 *   for that song) it reloads.
 * - Active and the current track is gone: move on to the track that took its place (paused
 *   stays stopped there), or finish when nothing follows.
 * Returns `s` itself when nothing changed.
 */
export function syncQueue(s: PlayerState, tracks: readonly Track[]): PlayerState {
  if (tracks.length === 0) {
    return s.queue.length === 0 && s.status === 'idle' ? s : createInitialPlayerState();
  }
  const current = s.queue[s.index];
  const j = current ? tracks.findIndex((t) => t.id === current.id) : -1;
  const last = tracks.length - 1;
  const queue = [...tracks];

  let next: PlayerState;
  if (s.queue.length === 0) {
    next = { queue, index: 0, status: 'idle' };
  } else if (s.status === 'idle' || s.status === 'ended') {
    const index = s.status === 'ended' ? last : j >= 0 ? j : Math.min(s.index, last);
    next = { queue, index, status: s.status };
  } else if (j >= 0) {
    // Another recording for the current song: play it if we were playing, else stop there.
    const changed = trackKey(tracks[j]) !== trackKey(current);
    const status = !changed ? s.status : s.status === 'paused' ? 'idle' : 'loading';
    next = { queue, index: j, status };
  } else if (s.index <= last) {
    next = { queue, index: s.index, status: s.status === 'paused' ? 'idle' : 'loading' };
  } else {
    next = { queue, index: last, status: 'ended' };
  }

  return next.index === s.index && next.status === s.status && sameQueue(s.queue, next.queue)
    ? s
    : next;
}

function reducer(s: PlayerState, e: HookEvent): PlayerState {
  return e.type === 'SYNC' ? syncQueue(s, e.tracks) : playerReducer(s, e);
}

function isAbort(err: unknown): boolean {
  const name = typeof err === 'object' && err !== null ? (err as { name?: unknown }).name : null;
  return name === 'AbortError' || name === 'Mp3LoadAbortedError';
}

export function usePlayer(tracks: readonly Track[], options: UsePlayerOptions = {}): UsePlayer {
  const [state, send] = useReducer(reducer, tracks, (t) =>
    syncQueue(createInitialPlayerState(), t),
  );
  const youtubeContainerRef = useRef<HTMLDivElement | null>(null);

  // Latest options without re-running effects when the caller passes new closures.
  const resolveRef = useRef(options.resolveTrack);
  const factoriesRef = useRef(options.adapters ?? DEFAULT_ADAPTERS);
  useEffect(() => {
    resolveRef.current = options.resolveTrack;
  });

  const adapters = useRef<{ mp3: PlayerAdapter | null; youtube: PlayerAdapter | null }>({
    mp3: null,
    youtube: null,
  });
  const active = useRef<PlayerAdapter | null>(null);
  const generation = useRef(0);
  const prev = useRef<PlayerState | null>(null);

  const adapterFor = useCallback((t: Track): PlayerAdapter => {
    const kind = t.source.type;
    const existing = adapters.current[kind];
    if (existing) return existing;
    const created =
      kind === 'mp3'
        ? factoriesRef.current.mp3()
        : factoriesRef.current.youtube(youtubeContainerRef.current ?? undefined);
    // Only the adapter that holds the current track may move the player on.
    created.onEnded(() => {
      if (active.current === created) send({ type: 'TRACK_ENDED' });
    });
    created.onError(() => {
      if (active.current === created) send({ type: 'TRACK_ERROR' });
    });
    adapters.current[kind] = created;
    return created;
  }, []);

  // New tracks from the caller (picker change, reorder, remove).
  useEffect(() => {
    send({ type: 'SYNC', tracks: [...tracks] });
  }, [tracks]);

  // Drive the adapters from state transitions.
  useEffect(() => {
    const before = prev.current;
    prev.current = state;
    if (before === state) return;
    const track = state.queue[state.index];
    const beforeTrack = before ? before.queue[before.index] : undefined;

    switch (state.status) {
      case 'loading': {
        if (!track) return;
        if (before?.status === 'loading' && trackKey(beforeTrack) === trackKey(track)) return;
        const gen = ++generation.current;
        const adapter = adapterFor(track);
        if (active.current && active.current !== adapter) active.current.stop();
        active.current = adapter;
        const resolve = resolveRef.current;
        void (async () => {
          try {
            const ready = resolve ? await resolve(track) : track;
            if (gen !== generation.current) return;
            await adapter.load(ready);
            if (gen === generation.current) send({ type: 'TRACK_READY' });
          } catch (err) {
            if (gen === generation.current && !isAbort(err)) send({ type: 'TRACK_ERROR' });
          }
        })();
        return;
      }
      case 'playing':
        if (before?.status !== 'playing') active.current?.play();
        return;
      case 'paused':
        active.current?.pause();
        return;
      case 'idle':
      case 'ended':
        generation.current++;
        active.current?.stop();
        return;
    }
  }, [state, adapterFor]);

  // Tear the adapters down with the view.
  useEffect(() => {
    const owned = adapters.current;
    const gen = generation;
    const current = active;
    const last = prev;
    return () => {
      gen.current++; // drop the result of any load still in flight
      owned.mp3?.destroy();
      owned.youtube?.destroy();
      owned.mp3 = null;
      owned.youtube = null;
      current.current = null;
      last.current = null;
    };
  }, []);

  const dispatch = useCallback((e: PlayerEvent) => send(e), []);
  const playFrom = useCallback(
    (index: number) => send({ type: 'LOAD', queue: [...tracks], startIndex: index }),
    [tracks],
  );

  return { state, dispatch, playFrom, youtubeContainerRef };
}
