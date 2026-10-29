'use client';

import { useCallback, useEffect, useReducer, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import {
  createInitialPlayerState,
  playerReducer,
  type PlayerEvent,
  type PlayerState,
  type Track,
} from '@/features/player/engine';
import { PlayerBar } from '@/features/player/ui/PlayerBar';
import { listItems, lists, resources, songs } from '@/fixtures';
import type { Resource } from '@/types/domain';

/** Fixture resource → engine track. Fixture URLs and video IDs are fake by construction. */
function toTrack(title: string, r: Resource): Track | null {
  if (r.kind === 'audio' && r.storagePath) {
    return {
      id: r.id,
      title,
      source: { type: 'mp3', url: `https://fixtures.invalid/${r.storagePath}` },
    };
  }
  const videoId = r.kind === 'video_link' && r.url ? new URL(r.url).searchParams.get('v') : null;
  return videoId ? { id: r.id, title, source: { type: 'youtube', videoId } } : null;
}

function songTitle(songId: string): string {
  return songs.find((s) => s.id === songId)?.title ?? 'Untitled';
}

/** The fixture playlist's items, in order, using each item's chosen resource when it has one. */
function fixturePlaylistTracks(): Track[] {
  const playlist = lists.find((l) => l.type === 'playlist');
  const items = listItems
    .filter((i) => i.listId === playlist?.id)
    .sort((a, b) => a.position - b.position);
  const tracks = items.flatMap((item) => {
    const chosen = resources.find((r) => r.id === item.resourceId);
    const candidates = chosen ? [chosen] : resources.filter((r) => r.songId === item.songId);
    const track = candidates.map((r) => toTrack(songTitle(item.songId), r)).find((t) => t !== null);
    return track ? [{ ...track, id: item.id }] : [];
  });
  // Pad with any other playable fixture resource so the demo always has a real queue to skip through.
  if (tracks.length >= 3) return tracks;
  const extra = resources
    .map((r) => toTrack(songTitle(r.songId), r))
    .filter((t): t is Track => t !== null && !tracks.some((x) => x.title === t.title));
  return [...tracks, ...extra].slice(0, 4);
}

const TRACKS = fixturePlaylistTracks();
const LONG_TITLE: Track = {
  id: 'fixture-long',
  title: 'A deliberately long fixture title that has to truncate at 360 pixels wide',
  source: { type: 'youtube', videoId: 'fixtureLong' },
};

const at = (status: PlayerState['status'], index: number, queue = TRACKS): PlayerState => ({
  queue,
  index,
  status,
});

const SNAPSHOTS: Array<{ name: string; state: PlayerState }> = [
  { name: 'Empty (nothing queued)', state: createInitialPlayerState() },
  { name: 'Idle, first track', state: at('idle', 0) },
  { name: 'Loading', state: at('loading', 1) },
  { name: 'Playing, middle track', state: at('playing', 1) },
  { name: 'Paused, last track', state: at('paused', TRACKS.length - 1) },
  { name: 'Ended', state: at('ended', TRACKS.length - 1) },
  { name: 'Single track, playing', state: at('playing', 0, TRACKS.slice(0, 1)) },
  { name: 'Long title', state: at('playing', 0, [LONG_TITLE]) },
];

const LOAD_DELAY_MS = 700;

/**
 * Fake adapter: `playerReducer` plus timers standing in for the MP3/YouTube adapters (PLAY-02/03).
 * Loading resolves after a short delay; "track end" and "error" are buttons.
 */
function useFakePlayer() {
  const [log, setLog] = useState<string[]>([]);
  const [state, rawDispatch] = useReducer(playerReducer, undefined, createInitialPlayerState);
  const [failNextLoad, setFailNextLoad] = useState(false);

  const dispatch = useCallback((e: PlayerEvent) => {
    setLog((l) => [e.type, ...l].slice(0, 12));
    rawDispatch(e);
  }, []);

  useEffect(() => {
    if (state.status !== 'loading') return;
    const t = setTimeout(() => {
      if (failNextLoad) {
        setFailNextLoad(false);
        dispatch({ type: 'TRACK_ERROR' });
      } else {
        dispatch({ type: 'TRACK_READY' });
      }
    }, LOAD_DELAY_MS);
    return () => clearTimeout(t);
    // Re-arm on every new load, including PREV restarting the same index (new state object).
  }, [state, failNextLoad, dispatch]);

  return { state, dispatch, log, failNextLoad, setFailNextLoad };
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

const noop = () => {};

export function PlayerGallery() {
  const { state, dispatch, log, failNextLoad, setFailNextLoad } = useFakePlayer();

  return (
    <div className="min-h-dvh">
      <main className="mx-auto max-w-3xl space-y-10 px-4 py-8">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold">PlayerBar</h1>
          <p className="text-sm text-muted-foreground">
            Fixture playlist driven by the real <code>playerReducer</code> and a fake adapter. The
            live bar is stuck to the bottom of this page.
          </p>
        </header>

        <Section title="Simulate the adapter">
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => dispatch({ type: 'LOAD', queue: TRACKS })}>
              Load fixture playlist
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => dispatch({ type: 'LOAD', queue: TRACKS, startIndex: 2 })}
            >
              Load from track 3
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => dispatch({ type: 'TRACK_ENDED' })}
            >
              Track ends
            </Button>
            <Button
              type="button"
              variant="outline"
              aria-pressed={failNextLoad}
              onClick={() => setFailNextLoad(!failNextLoad)}
            >
              {failNextLoad ? 'Next load will fail' : 'Fail next load'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => dispatch({ type: 'LOAD', queue: [] })}
            >
              Clear queue
            </Button>
          </div>
          <p className="text-sm">
            Status: <code data-testid="live-status">{state.status}</code>, index{' '}
            <code>{state.index}</code>
          </p>
          <ol aria-label="Event log" className="font-mono text-xs text-muted-foreground">
            {log.map((e, i) => (
              <li key={`${i}-${e}`}>{e}</li>
            ))}
          </ol>
        </Section>

        <Section title="Every state at 360px">
          <div className="space-y-4">
            {SNAPSHOTS.map(({ name, state: s }) => (
              <figure key={name} className="space-y-1">
                <figcaption className="text-xs text-muted-foreground">{name}</figcaption>
                <div className="w-[360px] max-w-full overflow-hidden rounded-md border">
                  <PlayerBar state={s} dispatch={noop} />
                </div>
              </figure>
            ))}
          </div>
        </Section>

        <Section title="Above a mobile bottom tab bar">
          <p className="text-sm text-muted-foreground">
            The shell sets <code>--bottom-nav-height</code> to its tab bar&apos;s height (0 where
            there is none), so the bar sits on top of the tab bar instead of under it.
          </p>
          <div
            className="relative h-48 w-[360px] max-w-full overflow-auto rounded-md border"
            style={{ ['--bottom-nav-height' as string]: '3.5rem' }}
          >
            <div className="h-64 p-3 text-sm text-muted-foreground">Page content scrolls here.</div>
            <PlayerBar state={at('playing', 0)} dispatch={noop} />
            <div className="sticky bottom-0 flex h-14 items-center justify-around border-t bg-muted text-xs">
              <span>Library</span>
              <span>Lists</span>
              <span>Quick</span>
              <span>More</span>
            </div>
          </div>
        </Section>
      </main>

      <PlayerBar state={state} dispatch={dispatch} />
    </div>
  );
}
