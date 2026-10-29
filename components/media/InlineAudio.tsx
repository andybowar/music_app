'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { DownloadIcon, LoaderCircleIcon, PauseIcon, PlayIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { downloadName, formatTime } from './mediaMath';

export type InlineAudioProps = {
  url: string;
  title: string;
};

type Status = 'loading' | 'ready' | 'error';

/** Seconds moved by the arrow keys on the seek slider. */
const SEEK_STEP = 5;

/**
 * Minimal inline audio player (REQ-ROW-04): play/pause, a seek slider and elapsed / total time.
 * Built on a hidden `<audio preload="metadata">`; nothing downloads beyond metadata until play.
 * Only one `InlineAudio` plays at a time: starting one pauses the others on the page.
 */
export function InlineAudio({ url, title }: InlineAudioProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [playing, setPlaying] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [duration, setDuration] = useState(Number.NaN);
  const [current, setCurrent] = useState(0);
  const sliderId = useId();

  const hasUrl = url.trim().length > 0;

  // Reset on a new file, then sync with the element: the server-rendered <audio> starts loading
  // before hydration, so `error` / `loadedmetadata` may already have fired unseen by React.
  useEffect(() => {
    const audio = audioRef.current;
    setPlaying(false);
    setWaiting(false);
    setCurrent(0);
    if (audio?.error) {
      setStatus('error');
    } else if (audio && audio.readyState >= HTMLMediaElement.HAVE_METADATA) {
      setDuration(audio.duration);
      setStatus('ready');
    } else {
      setDuration(Number.NaN);
      setStatus('loading');
    }
  }, [url]);

  const toggle = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!audio.paused) {
      audio.pause();
      return;
    }
    // Pause any other inline player first.
    for (const el of document.querySelectorAll<HTMLAudioElement>('audio[data-inline-audio]')) {
      if (el !== audio && !el.paused) el.pause();
    }
    try {
      await audio.play();
    } catch (err) {
      // AbortError: a pause() raced the play() promise; not a failure.
      if (!(err instanceof DOMException && err.name === 'AbortError')) setStatus('error');
    }
  };

  const seek = (value: number) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(value)) return;
    audio.currentTime = value;
    setCurrent(value);
  };

  if (!hasUrl) {
    return <p className="text-sm text-muted-foreground">No audio for {title}.</p>;
  }

  const knownDuration = Number.isFinite(duration) && duration > 0;
  const busy = status === 'loading' || waiting;

  return (
    <div
      role="group"
      aria-label={`Audio: ${title}`}
      className="flex w-full max-w-md min-w-0 items-center gap-2 rounded-md border bg-background p-1"
    >
      <audio
        ref={audioRef}
        src={url}
        preload="metadata"
        data-inline-audio=""
        onLoadedMetadata={(e) => {
          setDuration(e.currentTarget.duration);
          setStatus('ready');
        }}
        onDurationChange={(e) => setDuration(e.currentTarget.duration)}
        onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onWaiting={() => setWaiting(true)}
        onPlaying={() => setWaiting(false)}
        onCanPlay={() => {
          setWaiting(false);
          setStatus((s) => (s === 'loading' ? 'ready' : s));
        }}
        onError={() => setStatus('error')}
      />

      {status === 'error' ? (
        <div role="alert" className="flex min-w-0 flex-1 items-center gap-2 px-2 text-sm">
          <span className="min-w-0 flex-1 truncate">Couldn’t play this audio.</span>
          <Button asChild variant="ghost" size="sm" className="min-h-tap">
            <a href={url} download={downloadName(url, title, 'mp3')}>
              <DownloadIcon aria-hidden />
              Download
            </a>
          </Button>
        </div>
      ) : (
        <>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-tap shrink-0"
            onClick={toggle}
            aria-label={playing ? `Pause ${title}` : `Play ${title}`}
            aria-busy={busy || undefined}
          >
            {busy && playing ? (
              <LoaderCircleIcon aria-hidden className="animate-spin" />
            ) : playing ? (
              <PauseIcon aria-hidden />
            ) : (
              <PlayIcon aria-hidden />
            )}
          </Button>
          <label htmlFor={sliderId} className="sr-only">
            Seek {title}
          </label>
          <input
            id={sliderId}
            type="range"
            min={0}
            max={knownDuration ? duration : 0}
            step="any"
            value={knownDuration ? Math.min(current, duration) : 0}
            disabled={!knownDuration}
            onChange={(e) => seek(e.currentTarget.valueAsNumber)}
            onKeyDown={(e) => {
              const delta =
                e.key === 'ArrowLeft' || e.key === 'ArrowDown'
                  ? -SEEK_STEP
                  : e.key === 'ArrowRight' || e.key === 'ArrowUp'
                    ? SEEK_STEP
                    : 0;
              if (!delta || !knownDuration) return;
              e.preventDefault();
              seek(Math.min(duration, Math.max(0, current + delta)));
            }}
            aria-valuetext={`${formatTime(current)} of ${formatTime(knownDuration ? duration : Number.NaN)}`}
            className="h-tap min-w-0 flex-1 cursor-pointer accent-primary disabled:cursor-default disabled:opacity-50"
          />
          <span className="shrink-0 pr-2 text-xs text-muted-foreground tabular-nums">
            {formatTime(current)} / {formatTime(knownDuration ? duration : Number.NaN)}
          </span>
        </>
      )}
    </div>
  );
}
