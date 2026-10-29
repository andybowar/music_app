import {
  createInitialPlayerState,
  playerReducer,
  type PlayerEvent,
  type PlayerState,
  type Track,
} from './engine';

type Status = PlayerState['status'];
type EventType = PlayerEvent['type'];

const STATUSES: readonly Status[] = ['idle', 'loading', 'playing', 'paused', 'ended'];

function track(id: string): Track {
  return {
    id,
    title: `Song ${id}`,
    source: { type: 'mp3', url: `https://example.test/${id}.mp3` },
  };
}

const A = track('a');
const B: Track = { id: 'b', title: 'Song b', source: { type: 'youtube', videoId: 'dQw4w9WgXcQ' } };
const C = track('c');
const QUEUE = [A, B, C];
const LAST = QUEUE.length - 1;

// Recursively freeze so any mutation inside the reducer throws (ESM test files are strict mode).
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

function at(status: Status, index: number, queue: Track[] = QUEUE): PlayerState {
  return deepFreeze({ queue, index, status });
}

function event(type: EventType): PlayerEvent {
  return type === 'LOAD' ? { type, queue: QUEUE, startIndex: 2 } : { type };
}

// Runs the reducer on a frozen input and checks it against an expected outcome:
// 'same' means a no-op that returns the identical reference.
type Outcome = 'same' | { index: number; status: Status };

function expectOutcome(from: PlayerState, e: PlayerEvent, outcome: Outcome) {
  const snapshot = structuredClone(from);
  const next = playerReducer(from, e);
  expect(from).toEqual(snapshot);
  if (outcome === 'same') {
    expect(next).toBe(from);
  } else {
    expect(next).not.toBe(from);
    expect(next).toEqual({ queue: e.type === 'LOAD' ? e.queue : from.queue, ...outcome });
  }
}

const same = 'same' as const;
const go = (index: number, status: Status) => ({ index, status });

describe('playerReducer', () => {
  // Every event in every status. Rows start mid-queue (index 1 of 3) except `ended`, whose index
  // is always the last track. LOAD is dispatched with a fresh 3-track queue and startIndex 2.
  describe('transition matrix (3-track queue)', () => {
    const MATRIX: Record<Status, { index: number; expect: Record<EventType, Outcome> }> = {
      idle: {
        index: 1,
        expect: {
          LOAD: go(2, 'loading'),
          PLAY: go(1, 'loading'),
          PAUSE: same,
          STOP: same,
          NEXT: go(2, 'loading'),
          PREV: go(0, 'loading'),
          TRACK_ENDED: same,
          TRACK_READY: same,
          TRACK_ERROR: same,
        },
      },
      loading: {
        index: 1,
        expect: {
          LOAD: go(2, 'loading'),
          PLAY: same,
          PAUSE: same,
          STOP: go(1, 'idle'),
          NEXT: go(2, 'loading'),
          PREV: go(0, 'loading'),
          TRACK_ENDED: same,
          TRACK_READY: go(1, 'playing'),
          TRACK_ERROR: go(2, 'loading'),
        },
      },
      playing: {
        index: 1,
        expect: {
          LOAD: go(2, 'loading'),
          PLAY: same,
          PAUSE: go(1, 'paused'),
          STOP: go(1, 'idle'),
          NEXT: go(2, 'loading'),
          PREV: go(0, 'loading'),
          TRACK_ENDED: go(2, 'loading'),
          TRACK_READY: same,
          TRACK_ERROR: go(2, 'loading'),
        },
      },
      paused: {
        index: 1,
        expect: {
          LOAD: go(2, 'loading'),
          PLAY: go(1, 'playing'),
          PAUSE: same,
          STOP: go(1, 'idle'),
          NEXT: go(2, 'loading'),
          PREV: go(0, 'loading'),
          TRACK_ENDED: same,
          TRACK_READY: same,
          TRACK_ERROR: go(2, 'loading'),
        },
      },
      ended: {
        index: LAST,
        expect: {
          LOAD: go(2, 'loading'),
          PLAY: go(0, 'loading'),
          PAUSE: same,
          STOP: go(LAST, 'idle'),
          NEXT: same,
          PREV: go(LAST, 'loading'),
          TRACK_ENDED: same,
          TRACK_READY: same,
          TRACK_ERROR: same,
        },
      },
    };

    const cases = STATUSES.flatMap((status) =>
      Object.entries(MATRIX[status].expect).map(
        ([type, outcome]) => [status, type as EventType, MATRIX[status].index, outcome] as const,
      ),
    );

    it('covers all 5 statuses × 9 events', () => {
      expect(cases).toHaveLength(45);
    });

    it.each(cases)('%s + %s (index %i)', (status, type, index, outcome) => {
      expectOutcome(at(status, index), event(type), outcome);
    });
  });

  describe('at the last track', () => {
    it.each([
      ['NEXT', 'idle', go(LAST, 'ended')],
      ['NEXT', 'loading', go(LAST, 'ended')],
      ['NEXT', 'playing', go(LAST, 'ended')],
      ['NEXT', 'paused', go(LAST, 'ended')],
      ['TRACK_ENDED', 'playing', go(LAST, 'ended')],
      ['TRACK_ERROR', 'loading', go(LAST, 'ended')],
      ['TRACK_ERROR', 'playing', go(LAST, 'ended')],
      ['TRACK_ERROR', 'paused', go(LAST, 'ended')],
      ['PREV', 'playing', go(LAST - 1, 'loading')],
    ] as const)('%s from %s → %o', (type, status, outcome) => {
      expectOutcome(at(status, LAST), event(type), outcome);
    });
  });

  describe('PREV at the first track restarts it', () => {
    it.each(['idle', 'loading', 'playing', 'paused'] as const)('from %s', (status) => {
      // A fresh object even when already loading, so the restart is observable by reference.
      expectOutcome(at(status, 0), event('PREV'), go(0, 'loading'));
    });
  });

  describe('TRACK_ERROR skips to the next track', () => {
    it.each(['loading', 'playing', 'paused'] as const)('from %s at the first track', (status) => {
      expectOutcome(at(status, 0), event('TRACK_ERROR'), go(1, 'loading'));
    });

    it('skips several broken tracks in a row, then ends', () => {
      let s = playerReducer(createInitialPlayerState(), { type: 'LOAD', queue: QUEUE });
      s = playerReducer(deepFreeze(s), { type: 'TRACK_ERROR' });
      expect(s).toMatchObject({ index: 1, status: 'loading' });
      s = playerReducer(deepFreeze(s), { type: 'TRACK_ERROR' });
      expect(s).toMatchObject({ index: 2, status: 'loading' });
      s = playerReducer(deepFreeze(s), { type: 'TRACK_ERROR' });
      expect(s).toMatchObject({ index: 2, status: 'ended' });
    });
  });

  describe('empty queue', () => {
    const NON_LOAD: EventType[] = [
      'PLAY',
      'PAUSE',
      'NEXT',
      'PREV',
      'TRACK_ENDED',
      'TRACK_READY',
      'TRACK_ERROR',
    ];
    const cases = STATUSES.flatMap((status) => NON_LOAD.map((type) => [type, status] as const));

    it.each(cases)('%s from %s is a no-op', (type, status) => {
      expectOutcome(at(status, 0, []), event(type), same);
    });

    it.each(STATUSES)('STOP from %s goes idle', (status) => {
      const outcome = status === 'idle' ? same : go(0, 'idle');
      expectOutcome(at(status, 0, []), event('STOP'), outcome);
    });

    it.each(STATUSES)('LOAD of an empty queue from %s resets to the initial state', (status) => {
      const next = playerReducer(at(status, 2), { type: 'LOAD', queue: [] });
      expect(next).toEqual(createInitialPlayerState());
    });
  });

  describe('single track', () => {
    const ONE = [A];
    it.each([
      ['PLAY', 'idle', go(0, 'loading')],
      ['TRACK_READY', 'loading', go(0, 'playing')],
      ['NEXT', 'playing', go(0, 'ended')],
      ['TRACK_ENDED', 'playing', go(0, 'ended')],
      ['TRACK_ERROR', 'loading', go(0, 'ended')],
      ['PREV', 'playing', go(0, 'loading')],
      ['PREV', 'ended', go(0, 'loading')],
      ['PLAY', 'ended', go(0, 'loading')],
      ['STOP', 'playing', go(0, 'idle')],
    ] as const)('%s from %s → %o', (type, status, outcome) => {
      expectOutcome(at(status, 0, ONE), event(type), outcome);
    });
  });

  describe('LOAD', () => {
    it.each([
      [undefined, 0],
      [0, 0],
      [1, 1],
      [2, 2],
      [99, 2],
      [-5, 0],
      [1.7, 1],
      [Number.NaN, 0],
      [Number.POSITIVE_INFINITY, 0],
    ])('startIndex %s → index %i', (startIndex, index) => {
      const e: PlayerEvent =
        startIndex === undefined
          ? { type: 'LOAD', queue: QUEUE }
          : { type: 'LOAD', queue: QUEUE, startIndex };
      expect(playerReducer(createInitialPlayerState(), deepFreeze(e))).toEqual({
        queue: QUEUE,
        index,
        status: 'loading',
      });
    });

    it('copies the queue so later caller mutations cannot leak in', () => {
      const queue = [A, B];
      const next = playerReducer(createInitialPlayerState(), { type: 'LOAD', queue });
      queue.push(C);
      expect(next.queue).toEqual([A, B]);
      expect(next.queue).not.toBe(queue);
    });
  });

  describe('scenarios', () => {
    function run(from: PlayerState, events: PlayerEvent[]): PlayerState {
      return events.reduce((s, e) => playerReducer(deepFreeze(s), e), from);
    }

    it('auto-advances through the whole playlist and ends', () => {
      const s = run(createInitialPlayerState(), [
        { type: 'LOAD', queue: QUEUE },
        { type: 'TRACK_READY' },
        { type: 'TRACK_ENDED' },
        { type: 'TRACK_READY' },
        { type: 'TRACK_ENDED' },
        { type: 'TRACK_READY' },
      ]);
      expect(s).toEqual({ queue: QUEUE, index: 2, status: 'playing' });
      expect(playerReducer(deepFreeze(s), { type: 'TRACK_ENDED' })).toEqual({
        queue: QUEUE,
        index: 2,
        status: 'ended',
      });
    });

    it('stop resets position: PLAY afterwards reloads the track instead of resuming', () => {
      const playing = run(createInitialPlayerState(), [
        { type: 'LOAD', queue: QUEUE, startIndex: 1 },
        { type: 'TRACK_READY' },
      ]);
      const paused = playerReducer(deepFreeze(playing), { type: 'PAUSE' });
      // Pause keeps the position: PLAY resumes straight to playing.
      expect(playerReducer(deepFreeze(paused), { type: 'PLAY' }).status).toBe('playing');

      const stopped = playerReducer(deepFreeze(playing), { type: 'STOP' });
      expect(stopped).toEqual({ queue: QUEUE, index: 1, status: 'idle' });
      // Stop discards the position: PLAY reloads the track from the start.
      expect(playerReducer(deepFreeze(stopped), { type: 'PLAY' })).toEqual({
        queue: QUEUE,
        index: 1,
        status: 'loading',
      });
    });

    it('ignores a late TRACK_ENDED / TRACK_ERROR after STOP', () => {
      const stopped = run(createInitialPlayerState(), [
        { type: 'LOAD', queue: QUEUE },
        { type: 'TRACK_READY' },
        { type: 'STOP' },
      ]);
      expect(run(stopped, [{ type: 'TRACK_ENDED' }, { type: 'TRACK_ERROR' }])).toBe(stopped);
    });

    it('replays from the top after the playlist ended', () => {
      const s = run(at('ended', LAST), [{ type: 'PLAY' }, { type: 'TRACK_READY' }]);
      expect(s).toEqual({ queue: QUEUE, index: 0, status: 'playing' });
    });
  });

  describe('createInitialPlayerState', () => {
    it('returns an idle, empty state and a fresh object each call', () => {
      const a = createInitialPlayerState();
      expect(a).toEqual({ queue: [], index: 0, status: 'idle' });
      expect(createInitialPlayerState()).not.toBe(a);
      expect(createInitialPlayerState().queue).not.toBe(a.queue);
    });
  });
});
