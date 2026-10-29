'use client';

import { useEffect, type ComponentType, type ReactNode } from 'react';
import {
  LoaderCircle,
  Music,
  Pause,
  Play,
  RotateCcw,
  SkipBack,
  SkipForward,
  Square,
  MonitorPlay,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/utils';
import type { PlayerEvent, PlayerState, Track } from '@/features/player/engine';

// contracts/ui.md → PlayerBar (PLAY-04). Presentational: everything it shows comes from `state`,
// everything it does goes through `dispatch`. The adapters (PLAY-02/03) and the hook that wires
// the reducer to them (PLAY-05) live elsewhere.
//
// Placement: the bar is `sticky` to the bottom of its scroll container. On mobile it sits above
// the app's bottom tab bar via `--bottom-nav-height` (falls back to 0 when the shell doesn't set
// it). The shell should set it to 0 at breakpoints where there is no tab bar.

export type PlayerBarProps = {
  state: PlayerState;
  dispatch(e: PlayerEvent): void;
};

type Controls = {
  canPrev: boolean;
  canNext: boolean;
  canStop: boolean;
  /** The primary toggle: what it does, and whether it can do it right now. */
  primary: { event: PlayerEvent | null; label: string; icon: 'play' | 'pause' | 'replay' | 'busy' };
};

/** What each control can do for a given state — mirrors `playerReducer` so no click is a no-op. */
export function playerControls(s: PlayerState): Controls {
  const hasQueue = s.queue.length > 0;
  const last = s.queue.length - 1;
  const active = s.status === 'playing' || s.status === 'paused';
  return {
    // PREV goes back a track, or restarts the first one; restarting only makes sense mid-track.
    canPrev: hasQueue && (s.index > 0 || active || s.status === 'ended'),
    // NEXT past the last track just ends the list, so it's only offered when a next track exists.
    canNext: hasQueue && s.status !== 'ended' && s.index < last,
    canStop: hasQueue && (active || s.status === 'loading'),
    primary: !hasQueue
      ? { event: null, label: 'Play', icon: 'play' }
      : s.status === 'playing'
        ? { event: { type: 'PAUSE' }, label: 'Pause', icon: 'pause' }
        : s.status === 'loading'
          ? { event: null, label: 'Loading track', icon: 'busy' }
          : s.status === 'ended'
            ? { event: { type: 'PLAY' }, label: 'Play again from the start', icon: 'replay' }
            : { event: { type: 'PLAY' }, label: 'Play', icon: 'play' },
  };
}

function statusText(s: PlayerState, track: Track | undefined): string {
  if (!track) return 'Nothing queued';
  switch (s.status) {
    case 'loading':
      return 'Loading…';
    case 'playing':
      return 'Now playing';
    case 'paused':
      return 'Paused';
    case 'ended':
      return 'Finished';
    case 'idle':
      return 'Ready to play';
  }
}

const PRIMARY_ICONS = {
  play: Play,
  pause: Pause,
  replay: RotateCcw,
  busy: LoaderCircle,
} satisfies Record<Controls['primary']['icon'], ComponentType<{ className?: string }>>;

/**
 * A control that stays focusable when unavailable (`aria-disabled`, not `disabled`), so pressing
 * Next onto the last track doesn't drop keyboard focus to the page.
 */
function ControlButton({
  label,
  enabled,
  onPress,
  primary = false,
  children,
}: {
  label: string;
  enabled: boolean;
  onPress(): void;
  primary?: boolean;
  children: ReactNode;
}) {
  return (
    <Button
      type="button"
      variant={primary ? 'default' : 'ghost'}
      size={primary ? 'icon-lg' : 'icon'}
      aria-label={label}
      title={label}
      aria-disabled={!enabled || undefined}
      onClick={() => {
        if (enabled) onPress();
      }}
      className={cn(
        'aria-disabled:cursor-not-allowed aria-disabled:opacity-50',
        primary && 'rounded-full',
      )}
    >
      {children}
    </Button>
  );
}

/** Lock-screen / headset controls (Media Session API), kept in step with the bar's own buttons. */
function useMediaSession(state: PlayerState, dispatch: PlayerBarProps['dispatch']) {
  const track = state.queue[state.index];
  const { canPrev, canNext, canStop } = playerControls(state);
  const title = track?.title;

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    const session = navigator.mediaSession;
    session.metadata =
      title !== undefined && typeof MediaMetadata !== 'undefined'
        ? new MediaMetadata({ title, artist: 'People of Praise', album: 'Playlist' })
        : null;
  }, [title]);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    navigator.mediaSession.playbackState =
      state.status === 'playing' ? 'playing' : state.status === 'paused' ? 'paused' : 'none';
  }, [state.status]);

  const hasQueue = state.queue.length > 0;
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    const session = navigator.mediaSession;
    const handlers: Array<[MediaSessionAction, (() => void) | null]> = [
      ['play', hasQueue ? () => dispatch({ type: 'PLAY' }) : null],
      ['pause', hasQueue ? () => dispatch({ type: 'PAUSE' }) : null],
      ['stop', canStop ? () => dispatch({ type: 'STOP' }) : null],
      ['previoustrack', canPrev ? () => dispatch({ type: 'PREV' }) : null],
      ['nexttrack', canNext ? () => dispatch({ type: 'NEXT' }) : null],
    ];
    const set = (action: MediaSessionAction, handler: (() => void) | null) => {
      try {
        session.setActionHandler(action, handler);
      } catch {
        // Browsers throw for actions they don't support; the on-screen control still works.
      }
    };
    for (const [action, handler] of handlers) set(action, handler);
    return () => {
      for (const [action] of handlers) set(action, null);
    };
  }, [dispatch, hasQueue, canPrev, canNext, canStop]);

  useEffect(
    () => () => {
      if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
      navigator.mediaSession.metadata = null;
      navigator.mediaSession.playbackState = 'none';
    },
    [],
  );
}

export function PlayerBar({ state, dispatch }: PlayerBarProps) {
  useMediaSession(state, dispatch);

  const track = state.queue[state.index];
  const controls = playerControls(state);
  const PrimaryIcon = PRIMARY_ICONS[controls.primary.icon];
  const SourceIcon = track?.source.type === 'youtube' ? MonitorPlay : Music;
  const position = track ? `Track ${state.index + 1} of ${state.queue.length}` : null;

  return (
    <section
      aria-label="Player"
      data-status={state.status}
      className={cn(
        'sticky bottom-[var(--bottom-nav-height,0px)] z-30 w-full border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80',
        'pb-[env(safe-area-inset-bottom)]',
      )}
    >
      <div className="mx-auto flex max-w-screen-lg items-center gap-2 px-3 py-2 sm:gap-4 sm:px-4">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <SourceIcon
            aria-hidden="true"
            className={cn('size-5 shrink-0 text-muted-foreground', !track && 'opacity-50')}
          />
          {/* Polite live region: announces track changes and status without stealing focus. */}
          <div role="status" aria-live="polite" className="min-w-0">
            <p className="truncate text-sm font-medium" title={track?.title}>
              {track ? track.title : 'Nothing queued'}
            </p>
            <p className="flex min-w-0 text-xs text-muted-foreground">
              {track ? (
                <>
                  <span className="truncate">{statusText(state, track)}</span>
                  <span aria-hidden="true" className="shrink-0 whitespace-pre">
                    {' · '}
                  </span>
                  {/* Compact "2/5" on phones; the full "Track 2 of 5" is always read out. */}
                  <span aria-hidden="true" className="shrink-0 tabular-nums sm:hidden">
                    {state.index + 1}/{state.queue.length}
                  </span>
                  <span className="sr-only shrink-0 sm:not-sr-only">{position}</span>
                  <span className="sr-only">
                    , {track.source.type === 'youtube' ? 'YouTube' : 'MP3'}
                  </span>
                </>
              ) : (
                <span className="truncate">Choose a playlist to start playing</span>
              )}
            </p>
          </div>
        </div>

        <div role="group" aria-label="Playback controls" className="flex shrink-0 items-center">
          <ControlButton
            label="Previous track"
            enabled={controls.canPrev}
            onPress={() => dispatch({ type: 'PREV' })}
          >
            <SkipBack aria-hidden="true" />
          </ControlButton>
          <ControlButton
            primary
            label={controls.primary.label}
            enabled={controls.primary.event !== null}
            onPress={() => {
              if (controls.primary.event) dispatch(controls.primary.event);
            }}
          >
            <PrimaryIcon
              aria-hidden="true"
              className={cn('size-5', controls.primary.icon === 'busy' && 'animate-spin')}
            />
          </ControlButton>
          <ControlButton
            label="Next track"
            enabled={controls.canNext}
            onPress={() => dispatch({ type: 'NEXT' })}
          >
            <SkipForward aria-hidden="true" />
          </ControlButton>
          <ControlButton
            label="Stop"
            enabled={controls.canStop}
            onPress={() => dispatch({ type: 'STOP' })}
          >
            <Square aria-hidden="true" />
          </ControlButton>
        </div>
      </div>
    </section>
  );
}
