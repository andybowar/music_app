// contracts/api.md "Pure modules" → features/player/engine.ts (PLAY-01).
// Deterministic, side-effect-free playback state machine (REQ-LIST-05).
//
// Statuses:
//   idle    — nothing playing; `index` is the track PLAY will start.
//   loading — the adapter is loading `queue[index]`; it plays as soon as TRACK_READY arrives.
//   playing — `queue[index]` is audible.
//   paused  — `queue[index]` is loaded and paused mid-track.
//   ended   — the queue ran out; `index` points at the last track.
//
// The reducer never mutates its input and returns the same reference when an event is a no-op,
// so callers can cheaply skip effects. Adapter events (TRACK_*) that arrive in a status where they
// cannot apply (e.g. a late TRACK_ENDED after STOP) are ignored rather than restarting playback.

export type Track = {
  id: string;
  title: string;
  source: { type: 'mp3'; url: string } | { type: 'youtube'; videoId: string };
};

export type PlayerState = {
  queue: Track[];
  index: number;
  status: 'idle' | 'loading' | 'playing' | 'paused' | 'ended';
};

export type PlayerEvent =
  | { type: 'LOAD'; queue: Track[]; startIndex?: number }
  | { type: 'PLAY' }
  | { type: 'PAUSE' }
  | { type: 'STOP' }
  | { type: 'NEXT' }
  | { type: 'PREV' }
  | { type: 'TRACK_ENDED' }
  | { type: 'TRACK_READY' }
  | { type: 'TRACK_ERROR' };

// Effect boundary driven from the reducer's output (PLAY-02/03 implement it); declared here only.
export interface PlayerAdapter {
  load(t: Track): Promise<void>;
  play(): void;
  pause(): void;
  stop(): void;
  onEnded(cb: () => void): void;
  onError(cb: () => void): void;
  destroy(): void;
}

export function createInitialPlayerState(): PlayerState {
  return { queue: [], index: 0, status: 'idle' };
}

function startIndexFor(queueLength: number, startIndex: number | undefined): number {
  const i = startIndex !== undefined && Number.isFinite(startIndex) ? Math.trunc(startIndex) : 0;
  return Math.min(Math.max(i, 0), queueLength - 1);
}

function withStatus(s: PlayerState, status: PlayerState['status'], index = s.index): PlayerState {
  return s.status === status && s.index === index ? s : { ...s, index, status };
}

// Skip / auto-advance: load the next track, or end after the last one.
function advance(s: PlayerState): PlayerState {
  const last = s.queue.length - 1;
  return s.index < last ? withStatus(s, 'loading', s.index + 1) : withStatus(s, 'ended', last);
}

export function playerReducer(s: PlayerState, e: PlayerEvent): PlayerState {
  if (e.type === 'LOAD') {
    if (e.queue.length === 0) return createInitialPlayerState();
    return {
      queue: [...e.queue],
      index: startIndexFor(e.queue.length, e.startIndex),
      status: 'loading',
    };
  }
  if (e.type === 'STOP') return withStatus(s, 'idle');
  // Nothing below can apply without a track to act on.
  if (s.queue.length === 0) return s;

  switch (e.type) {
    case 'PLAY':
      if (s.status === 'paused') return withStatus(s, 'playing');
      if (s.status === 'idle') return withStatus(s, 'loading');
      if (s.status === 'ended') return withStatus(s, 'loading', 0); // replay from the top
      return s; // loading (already headed to playing) or playing
    case 'PAUSE':
      return s.status === 'playing' ? withStatus(s, 'paused') : s;
    case 'NEXT':
      return s.status === 'ended' ? s : advance(s);
    case 'PREV':
      // `ended` sits just past the last track, so PREV reloads the last track; at the first
      // track PREV restarts it. Always a fresh object so a restart is observable by reference.
      if (s.status === 'ended' || s.index === 0) return { ...s, status: 'loading' };
      return { ...s, index: s.index - 1, status: 'loading' };
    case 'TRACK_READY':
      return s.status === 'loading' ? withStatus(s, 'playing') : s;
    case 'TRACK_ENDED':
      return s.status === 'playing' ? advance(s) : s;
    case 'TRACK_ERROR':
      return s.status === 'idle' || s.status === 'ended' ? s : advance(s);
  }
}
