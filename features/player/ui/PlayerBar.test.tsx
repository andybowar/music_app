import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createInitialPlayerState,
  type PlayerEvent,
  type PlayerState,
  type Track,
} from '@/features/player/engine';
import { PlayerBar, playerControls } from './PlayerBar';

const QUEUE: Track[] = [
  {
    id: 't1',
    title: 'Fixture song one',
    source: { type: 'mp3', url: 'https://fixtures.invalid/1.mp3' },
  },
  { id: 't2', title: 'Fixture song two', source: { type: 'youtube', videoId: 'fixtureVid02' } },
  {
    id: 't3',
    title: 'Fixture song three',
    source: { type: 'mp3', url: 'https://fixtures.invalid/3.mp3' },
  },
];

const at = (status: PlayerState['status'], index: number, queue = QUEUE): PlayerState => ({
  queue,
  index,
  status,
});

function setup(state: PlayerState) {
  const dispatch = vi.fn<(e: PlayerEvent) => void>();
  const utils = render(<PlayerBar state={state} dispatch={dispatch} />);
  const btn = (name: string | RegExp) => screen.getByRole('button', { name });
  return { dispatch, btn, ...utils };
}

const enabled = (el: HTMLElement) => el.getAttribute('aria-disabled') !== 'true';

afterEach(cleanup);

describe('PlayerBar statuses', () => {
  it('empty queue: empty state, every control unavailable', async () => {
    const { btn, dispatch } = setup(createInitialPlayerState());
    expect(screen.getByRole('region', { name: 'Player' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Nothing queued');
    expect(screen.getByText('Choose a playlist to start playing')).toBeInTheDocument();
    for (const name of ['Previous track', 'Play', 'Next track', 'Stop']) {
      expect(btn(name)).toHaveAttribute('aria-disabled', 'true');
      await userEvent.click(btn(name));
    }
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('idle: shows the track and position, Play dispatches PLAY', async () => {
    const { btn, dispatch } = setup(at('idle', 0));
    expect(screen.getByRole('status')).toHaveTextContent('Fixture song one');
    expect(screen.getByRole('status')).toHaveTextContent('Ready to play');
    expect(screen.getByRole('status')).toHaveTextContent('Track 1 of 3');
    expect(screen.getByRole('status')).toHaveTextContent('MP3');
    expect(enabled(btn('Stop'))).toBe(false);
    await userEvent.click(btn('Play'));
    expect(dispatch).toHaveBeenCalledWith({ type: 'PLAY' });
  });

  it('loading: busy toggle that does nothing, Stop available', async () => {
    const { btn, dispatch } = setup(at('loading', 1));
    expect(screen.getByRole('status')).toHaveTextContent('Loading…');
    expect(screen.getByRole('status')).toHaveTextContent('YouTube');
    expect(btn('Loading track')).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(btn('Loading track'));
    expect(dispatch).not.toHaveBeenCalled();
    await userEvent.click(btn('Stop'));
    expect(dispatch).toHaveBeenCalledWith({ type: 'STOP' });
  });

  it('playing: Pause dispatches PAUSE', async () => {
    const { btn, dispatch } = setup(at('playing', 1));
    expect(screen.getByRole('status')).toHaveTextContent('Now playing');
    expect(screen.getByRole('status')).toHaveTextContent('Track 2 of 3');
    expect(screen.queryByRole('button', { name: 'Play' })).toBeNull();
    await userEvent.click(btn('Pause'));
    expect(dispatch).toHaveBeenCalledWith({ type: 'PAUSE' });
  });

  it('paused: Play resumes, Stop dispatches STOP', async () => {
    const { btn, dispatch } = setup(at('paused', 2));
    expect(screen.getByRole('status')).toHaveTextContent('Paused');
    await userEvent.click(btn('Play'));
    await userEvent.click(btn('Stop'));
    expect(dispatch.mock.calls).toEqual([[{ type: 'PLAY' }], [{ type: 'STOP' }]]);
  });

  it('ended: replay from the start, Previous reloads the last track, Next/Stop unavailable', async () => {
    const { btn, dispatch } = setup(at('ended', 2));
    expect(screen.getByRole('status')).toHaveTextContent('Finished');
    expect(enabled(btn('Next track'))).toBe(false);
    expect(enabled(btn('Stop'))).toBe(false);
    await userEvent.click(btn('Play again from the start'));
    await userEvent.click(btn('Previous track'));
    expect(dispatch.mock.calls).toEqual([[{ type: 'PLAY' }], [{ type: 'PREV' }]]);
  });

  it('exposes the status on the region for styling hooks', () => {
    setup(at('paused', 0));
    expect(screen.getByRole('region', { name: 'Player' })).toHaveAttribute('data-status', 'paused');
  });
});

describe('PlayerBar queue boundaries', () => {
  it('first track, idle: Previous unavailable, Next available', async () => {
    const { btn, dispatch } = setup(at('idle', 0));
    expect(enabled(btn('Previous track'))).toBe(false);
    await userEvent.click(btn('Previous track'));
    await userEvent.click(btn('Next track'));
    expect(dispatch.mock.calls).toEqual([[{ type: 'NEXT' }]]);
  });

  it('first track, playing: Previous restarts the track', async () => {
    const { btn, dispatch } = setup(at('playing', 0));
    await userEvent.click(btn('Previous track'));
    expect(dispatch).toHaveBeenCalledWith({ type: 'PREV' });
  });

  it('last track: Next unavailable, Previous available', async () => {
    const { btn, dispatch } = setup(at('playing', 2));
    expect(enabled(btn('Next track'))).toBe(false);
    await userEvent.click(btn('Next track'));
    await userEvent.click(btn('Previous track'));
    expect(dispatch.mock.calls).toEqual([[{ type: 'PREV' }]]);
  });

  it('single-track queue: no Next, Previous only once started', () => {
    const one = QUEUE.slice(0, 1);
    expect(playerControls(at('idle', 0, one))).toMatchObject({ canPrev: false, canNext: false });
    expect(playerControls(at('loading', 0, one))).toMatchObject({ canPrev: false, canStop: true });
    expect(playerControls(at('paused', 0, one))).toMatchObject({ canPrev: true, canNext: false });
  });

  it('middle track: both skips available', () => {
    expect(playerControls(at('paused', 1))).toMatchObject({ canPrev: true, canNext: true });
  });
});

describe('PlayerBar accessibility', () => {
  it('controls are a labelled group of named buttons that stay focusable when unavailable', () => {
    const { btn } = setup(at('idle', 0));
    expect(screen.getByRole('group', { name: 'Playback controls' })).toBeInTheDocument();
    expect(btn('Previous track')).not.toBeDisabled(); // aria-disabled, so focus isn't dropped
    expect(btn('Previous track')).toHaveAttribute('title', 'Previous track');
  });

  it('is keyboard operable in a sensible tab order', async () => {
    const user = userEvent.setup();
    const { dispatch } = setup(at('playing', 1));
    await user.tab();
    expect(screen.getByRole('button', { name: 'Previous track' })).toHaveFocus();
    await user.keyboard('{Enter}');
    await user.tab();
    expect(screen.getByRole('button', { name: 'Pause' })).toHaveFocus();
    await user.keyboard(' ');
    await user.tab();
    await user.keyboard('{Enter}');
    await user.tab();
    expect(screen.getByRole('button', { name: 'Stop' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(dispatch.mock.calls.map(([e]) => e.type)).toEqual(['PREV', 'PAUSE', 'NEXT', 'STOP']);
  });

  it('keeps focus on Next when skipping onto the last track', async () => {
    const user = userEvent.setup();
    const dispatch = vi.fn();
    const { rerender } = render(<PlayerBar state={at('playing', 1)} dispatch={dispatch} />);
    const next = screen.getByRole('button', { name: 'Next track' });
    next.focus();
    await user.keyboard('{Enter}');
    rerender(<PlayerBar state={at('loading', 2)} dispatch={dispatch} />);
    expect(next).toHaveFocus();
    expect(next).toHaveAttribute('aria-disabled', 'true');
  });

  it('truncates long titles so the bar fits 360px, with the full title on hover', () => {
    const long = { ...QUEUE[0]!, title: 'A very long fixture title '.repeat(5).trim() };
    setup(at('playing', 0, [long]));
    const title = screen.getByText(long.title);
    expect(title).toHaveClass('truncate');
    expect(title).toHaveAttribute('title', long.title);
    expect(screen.getByRole('group', { name: 'Playback controls' })).toHaveClass('shrink-0');
  });
});

describe('PlayerBar Media Session', () => {
  type Handler = (() => void) | null;
  let handlers: Map<string, Handler>;
  let session: {
    metadata: unknown;
    playbackState: string;
    setActionHandler: (a: string, h: Handler) => void;
  };

  class FakeMediaMetadata {
    constructor(public init: { title: string; artist?: string; album?: string }) {}
    get title() {
      return this.init.title;
    }
  }

  beforeEach(() => {
    handlers = new Map();
    session = {
      metadata: null,
      playbackState: 'none',
      setActionHandler: vi.fn((a: string, h: Handler) => {
        if (a === 'stop' && h && session.playbackState === 'unsupported-stop') throw new Error();
        handlers.set(a, h);
      }),
    };
    Object.defineProperty(navigator, 'mediaSession', { value: session, configurable: true });
    vi.stubGlobal('MediaMetadata', FakeMediaMetadata);
  });

  afterEach(() => {
    // @ts-expect-error reason: removing the test-only stub installed above
    delete navigator.mediaSession;
    vi.unstubAllGlobals();
  });

  it('sets lock-screen metadata and playback state from the current track', () => {
    const { rerender } = render(<PlayerBar state={at('playing', 1)} dispatch={vi.fn()} />);
    expect((session.metadata as FakeMediaMetadata).title).toBe('Fixture song two');
    expect(session.playbackState).toBe('playing');
    rerender(<PlayerBar state={at('paused', 1)} dispatch={vi.fn()} />);
    expect(session.playbackState).toBe('paused');
    rerender(<PlayerBar state={at('loading', 2)} dispatch={vi.fn()} />);
    expect((session.metadata as FakeMediaMetadata).title).toBe('Fixture song three');
    expect(session.playbackState).toBe('none');
  });

  it('wires lock-screen actions to dispatch, respecting queue boundaries', () => {
    const dispatch = vi.fn();
    render(<PlayerBar state={at('playing', 0)} dispatch={dispatch} />);
    handlers.get('play')?.();
    handlers.get('pause')?.();
    handlers.get('stop')?.();
    handlers.get('nexttrack')?.();
    handlers.get('previoustrack')?.();
    expect(dispatch.mock.calls.map(([e]) => e.type)).toEqual([
      'PLAY',
      'PAUSE',
      'STOP',
      'NEXT',
      'PREV',
    ]);
  });

  it('clears handlers that are unavailable and everything on unmount', () => {
    const { unmount, rerender } = render(<PlayerBar state={at('idle', 0)} dispatch={vi.fn()} />);
    expect(handlers.get('previoustrack')).toBeNull();
    expect(handlers.get('stop')).toBeNull();
    expect(handlers.get('nexttrack')).toBeInstanceOf(Function);
    rerender(<PlayerBar state={createInitialPlayerState()} dispatch={vi.fn()} />);
    expect(session.metadata).toBeNull();
    expect(handlers.get('play')).toBeNull();
    rerender(<PlayerBar state={at('playing', 1)} dispatch={vi.fn()} />);
    unmount();
    expect([...handlers.values()].every((h) => h === null)).toBe(true);
    expect(session.metadata).toBeNull();
    expect(session.playbackState).toBe('none');
  });

  it('tolerates browsers that reject an action', () => {
    session.playbackState = 'unsupported-stop';
    expect(() => render(<PlayerBar state={at('playing', 0)} dispatch={vi.fn()} />)).not.toThrow();
  });

  it('renders without the Media Session API', () => {
    // @ts-expect-error reason: simulate a browser without navigator.mediaSession
    delete navigator.mediaSession;
    expect(() => render(<PlayerBar state={at('playing', 0)} dispatch={vi.fn()} />)).not.toThrow();
  });
});
