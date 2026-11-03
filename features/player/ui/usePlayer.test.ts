import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createInitialPlayerState,
  type PlayerAdapter,
  type PlayerState,
  type Track,
} from '../engine';
import { syncQueue, trackKey, usePlayer, type PlayerAdapterFactories } from './usePlayer';

const mp3 = (id: string, url = `https://cdn.test/${id}.mp3`): Track => ({
  id,
  title: `Song ${id}`,
  source: { type: 'mp3', url },
});
const yt = (id: string, videoId = 'abcdefghijk'): Track => ({
  id,
  title: `Video ${id}`,
  source: { type: 'youtube', videoId },
});

const a = mp3('a');
const b = mp3('b');
const c = yt('c');

const state = (queue: Track[], index: number, status: PlayerState['status']): PlayerState => ({
  queue,
  index,
  status,
});

describe('trackKey', () => {
  it('distinguishes sources for the same track id', () => {
    expect(trackKey(undefined)).toBe('');
    expect(trackKey(a)).not.toBe(trackKey(mp3('a', 'https://cdn.test/other.mp3')));
    expect(trackKey(c)).not.toBe(trackKey(yt('c', 'zyxwvutsrqp')));
  });
});

describe('syncQueue', () => {
  it('empties the player when no tracks remain', () => {
    const empty = createInitialPlayerState();
    expect(syncQueue(empty, [])).toBe(empty);
    expect(syncQueue(state([a], 0, 'playing'), [])).toEqual(empty);
  });

  it('adopts a first queue without starting playback', () => {
    expect(syncQueue(createInitialPlayerState(), [a, b])).toEqual(state([a, b], 0, 'idle'));
  });

  it('returns the same state when nothing changed', () => {
    const s = state([a, b], 1, 'playing');
    expect(syncQueue(s, [mp3('a'), mp3('b')])).toBe(s);
  });

  it('keeps the selected track while idle, or clamps the index', () => {
    expect(syncQueue(state([a, b], 1, 'idle'), [b, a])).toEqual(state([b, a], 0, 'idle'));
    expect(syncQueue(state([a, b, c], 2, 'idle'), [a])).toEqual(state([a], 0, 'idle'));
  });

  it('stays finished at the last track', () => {
    expect(syncQueue(state([a, b], 1, 'ended'), [a, b, c])).toEqual(state([a, b, c], 2, 'ended'));
  });

  it('follows the current track to its new position without reloading', () => {
    expect(syncQueue(state([a, b], 1, 'playing'), [b, a])).toEqual(state([b, a], 0, 'playing'));
    expect(syncQueue(state([a, b], 0, 'paused'), [c, a])).toEqual(state([c, a], 1, 'paused'));
  });

  it('reloads the current song when another recording is picked', () => {
    const other = mp3('a', 'https://cdn.test/live.mp3');
    expect(syncQueue(state([a, b], 0, 'playing'), [other, b])).toEqual(
      state([other, b], 0, 'loading'),
    );
    expect(syncQueue(state([a, b], 0, 'paused'), [other, b])).toEqual(state([other, b], 0, 'idle'));
  });

  it('moves on when the current track is removed', () => {
    expect(syncQueue(state([a, b, c], 1, 'playing'), [a, c])).toEqual(state([a, c], 1, 'loading'));
    expect(syncQueue(state([a, b, c], 1, 'paused'), [a, c])).toEqual(state([a, c], 1, 'idle'));
    expect(syncQueue(state([a, b], 1, 'playing'), [a])).toEqual(state([a], 0, 'ended'));
  });
});

// ----- Hook ------------------------------------------------------------------------------

type FakeAdapter = PlayerAdapter & {
  kind: 'mp3' | 'youtube';
  loads: Track[];
  calls: string[];
  ended(): void;
  failLater(): void;
  /** Settle the latest load. */
  resolveLoad(): void;
  rejectLoad(err?: Error): void;
};

function fakeAdapter(kind: 'mp3' | 'youtube', auto: boolean): FakeAdapter {
  let endedCb: (() => void) | null = null;
  let errorCb: (() => void) | null = null;
  let pending: { resolve(): void; reject(e: Error): void } | null = null;
  const self: FakeAdapter = {
    kind,
    loads: [],
    calls: [],
    load(t) {
      self.loads.push(t);
      self.calls.push(`load:${t.id}`);
      if (pending) {
        const err = new Error('superseded');
        err.name = 'AbortError';
        pending.reject(err);
      }
      return new Promise<void>((resolve, reject) => {
        pending = { resolve, reject };
        if (auto) queueMicrotask(() => self.resolveLoad());
      });
    },
    play: () => self.calls.push('play'),
    pause: () => self.calls.push('pause'),
    stop: () => self.calls.push('stop'),
    onEnded: (cb) => (endedCb = cb),
    onError: (cb) => (errorCb = cb),
    destroy: () => self.calls.push('destroy'),
    ended: () => endedCb?.(),
    failLater: () => errorCb?.(),
    resolveLoad() {
      const p = pending;
      pending = null;
      p?.resolve();
    },
    rejectLoad(err = new Error('broken')) {
      const p = pending;
      pending = null;
      p?.reject(err);
    },
  };
  return self;
}

function setup(
  tracks: Track[],
  opts: { auto?: boolean; resolveTrack?(t: Track): Promise<Track> } = {},
) {
  const made: { mp3?: FakeAdapter; youtube?: FakeAdapter; container?: HTMLElement } = {};
  const adapters: PlayerAdapterFactories = {
    mp3: () => (made.mp3 = fakeAdapter('mp3', opts.auto ?? true)),
    youtube: (container) => {
      made.container = container;
      return (made.youtube = fakeAdapter('youtube', opts.auto ?? true));
    },
  };
  const hook = renderHook(
    ({ t }: { t: Track[] }) => usePlayer(t, { adapters, resolveTrack: opts.resolveTrack }),
    { initialProps: { t: tracks } },
  );
  return { hook, made };
}

afterEach(() => vi.restoreAllMocks());

describe('usePlayer', () => {
  it('starts idle with the queue and creates no adapter until played', () => {
    const { hook, made } = setup([a, b]);
    expect(hook.result.current.state).toEqual(state([a, b], 0, 'idle'));
    expect(made.mp3).toBeUndefined();
  });

  it('plays, then auto-advances to the next track when one ends', async () => {
    const { hook, made } = setup([a, b]);
    act(() => hook.result.current.dispatch({ type: 'PLAY' }));
    await waitFor(() => expect(hook.result.current.state.status).toBe('playing'));
    expect(made.mp3!.calls).toEqual(['load:a', 'play']);

    act(() => made.mp3!.ended());
    await waitFor(() =>
      expect(hook.result.current.state).toMatchObject({ index: 1, status: 'playing' }),
    );
    expect(made.mp3!.calls).toEqual(['load:a', 'play', 'load:b', 'play']);

    act(() => made.mp3!.ended());
    expect(hook.result.current.state.status).toBe('ended');
    expect(made.mp3!.calls.at(-1)).toBe('stop');
  });

  it('pauses, resumes and stops the adapter', async () => {
    const { hook, made } = setup([a]);
    act(() => hook.result.current.playFrom(0));
    await waitFor(() => expect(hook.result.current.state.status).toBe('playing'));
    act(() => hook.result.current.dispatch({ type: 'PAUSE' }));
    act(() => hook.result.current.dispatch({ type: 'PLAY' }));
    act(() => hook.result.current.dispatch({ type: 'STOP' }));
    expect(made.mp3!.calls).toEqual(['load:a', 'play', 'pause', 'play', 'stop']);
  });

  it('skips a track that fails to load, without counting a superseded load as a failure', async () => {
    const { hook, made } = setup([a, b, mp3('d')], { auto: false });
    act(() => hook.result.current.playFrom(0));
    act(() => hook.result.current.dispatch({ type: 'NEXT' })); // supersedes the load of a
    await waitFor(() => expect(made.mp3!.loads.map((t) => t.id)).toEqual(['a', 'b']));
    expect(hook.result.current.state).toMatchObject({ index: 1, status: 'loading' });

    await act(async () => made.mp3!.rejectLoad());
    expect(hook.result.current.state).toMatchObject({ index: 2, status: 'loading' });
    await act(async () => made.mp3!.resolveLoad());
    expect(hook.result.current.state).toMatchObject({ index: 2, status: 'playing' });
  });

  it('skips on a playback error reported after load', async () => {
    const { hook, made } = setup([a, b]);
    act(() => hook.result.current.playFrom(0));
    await waitFor(() => expect(hook.result.current.state.status).toBe('playing'));
    act(() => made.mp3!.failLater());
    await waitFor(() =>
      expect(hook.result.current.state).toMatchObject({ index: 1, status: 'playing' }),
    );
  });

  it('switches adapters by source and mounts YouTube in the container', async () => {
    const { hook, made } = setup([a, c]);
    const box = document.createElement('div');
    hook.result.current.youtubeContainerRef.current = box as HTMLDivElement;
    act(() => hook.result.current.playFrom(0));
    await waitFor(() => expect(hook.result.current.state.status).toBe('playing'));
    act(() => made.mp3!.ended());
    await waitFor(() =>
      expect(hook.result.current.state).toMatchObject({ index: 1, status: 'playing' }),
    );
    expect(made.container).toBe(box);
    expect(made.mp3!.calls.at(-1)).toBe('stop');
    expect(made.youtube!.calls).toEqual(['load:c', 'play']);

    // Late events from the adapter that no longer holds the track are ignored.
    act(() => made.mp3!.ended());
    expect(hook.result.current.state).toMatchObject({ index: 1, status: 'playing' });
  });

  it('resolves a track (e.g. a signed URL) before loading it, and skips it when that fails', async () => {
    const resolveTrack = vi.fn(async (t: Track): Promise<Track> => {
      if (t.id === 'a') throw new Error('no url');
      return { ...t, source: { type: 'mp3', url: 'https://signed.test/b.mp3' } };
    });
    const { hook, made } = setup([mp3('a', ''), mp3('b', '')], { resolveTrack });
    act(() => hook.result.current.playFrom(0));
    await waitFor(() =>
      expect(hook.result.current.state).toMatchObject({ index: 1, status: 'playing' }),
    );
    expect(made.mp3!.loads).toEqual([
      { ...b, source: { type: 'mp3', url: 'https://signed.test/b.mp3' } },
    ]);
  });

  it('keeps playing when the queue is reordered, and reloads when the recording changes', async () => {
    const { hook, made } = setup([a, b]);
    act(() => hook.result.current.playFrom(1));
    await waitFor(() => expect(hook.result.current.state.status).toBe('playing'));
    hook.rerender({ t: [b, a] });
    expect(hook.result.current.state).toMatchObject({ index: 0, status: 'playing' });
    expect(made.mp3!.calls).toEqual(['load:b', 'play']);

    hook.rerender({ t: [mp3('b', 'https://cdn.test/live.mp3'), a] });
    await waitFor(() => expect(made.mp3!.calls).toEqual(['load:b', 'play', 'load:b', 'play']));
  });

  it('destroys its adapters on unmount and ignores late results', async () => {
    const { hook, made } = setup([a], { auto: false });
    act(() => hook.result.current.playFrom(0));
    await waitFor(() => expect(made.mp3).toBeDefined());
    hook.unmount();
    expect(made.mp3!.calls).toContain('destroy');
    await act(async () => made.mp3!.resolveLoad());
  });
});
