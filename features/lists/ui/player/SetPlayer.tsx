'use client';

import { ChevronLeftIcon, ChevronRightIcon, MinusIcon, PlusIcon, XIcon } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';

import { EnergyChip } from '@/components/song/EnergyChip';
import { KeyBadge } from '@/components/song/KeyBadge';
import { TimeSigBadge } from '@/components/song/TimeSigBadge';
import { Button } from '@/components/ui/button';
import type { ResolvedItem, Resource, SongDetail } from '@/types/domain';

import { AutoscrollControls } from './AutoscrollControls';
import { MusicianView } from './MusicianView';
import { TEXT_SIZES, readTextStep, writeTextStep } from './playerPrefs';
import { pageStep, scrollBox } from './scrolling';
import { useScreenWakeLock } from './wakeLock';

export interface SetPlayerProps {
  /** The setlist's name. */
  title: string;
  items: ResolvedItem[];
  /** Details of the list's songs (lyrics, chords, arrangement), as `SetlistView` gets them. */
  songs?: SongDetail[];
  /** 0-based. */
  index: number;
  onIndexChange(index: number): void;
  /** A signed URL for a PDF, for charts shown inline (`getSignedResourceUrl`); throws on failure. */
  getPdfUrl(r: Resource): Promise<string>;
  /** Opens a resource the way the setlist does: PDFs in the zoomable viewer, files download. */
  onOpenResource(r: Resource): void;
  onClose(): void;
}

/** Keys that page through the set (most Bluetooth page turners send one of these pairs). */
const NEXT_KEYS = new Set(['ArrowRight', 'PageDown']);
const PREV_KEYS = new Set(['ArrowLeft', 'PageUp']);
/** A swipe must travel this far, and be mostly sideways. */
const SWIPE_MIN = 60;
/** How long a smooth page turn is assumed to take. */
const TURN_MS = 600;

/** Elements whose own arrow keys must not turn the page (the speed slider, menus). */
function ownsArrowKeys(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    !!target.closest('input, textarea, select, [role="menu"], [role="menuitemradio"]')
  );
}

/**
 * Full-screen set player (LIST-11, REQ-LIST-09): one song at a time, with its first chords and a
 * chart (typed chords or PDF), or the lyrics when it has no chart. Previous/next by button,
 * swipe, or arrow and Page Up/Down keys; a page-turner press scrolls a screen first and moves
 * on at the end. The screen stays awake while it's open. (Roles were removed on 2026-11-05.)
 */
export function SetPlayer({
  title,
  items,
  songs,
  index,
  onIndexChange,
  getPdfUrl,
  onOpenResource,
  onClose,
}: SetPlayerProps) {
  const titleId = useId();
  const scrollRef = useRef<HTMLDivElement>(null);
  const swipe = useRef<{ x: number; y: number } | null>(null);
  /** Where the last page turn was heading, so quick presses during its smooth scroll add up. */
  const turning = useRef<{ to: number; at: number } | null>(null);
  const details = useMemo(() => new Map((songs ?? []).map((s) => [s.id, s])), [songs]);

  const total = items.length;
  const at = Math.min(Math.max(index, 0), Math.max(total - 1, 0));
  const resolved = items[at];
  const detail = resolved ? details.get(resolved.song.id) : undefined;
  const next = items[at + 1];
  const songId = resolved?.song.id ?? '';

  const [textStep, setTextStep] = useState(0);

  useScreenWakeLock(true);
  useEffect(() => setTextStep(readTextStep()), []);

  // Each song starts at the top (AutoscrollControls turns autoscroll off and loads its speed).
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [songId, at]);

  // Full screen where the browser allows it (not iPhone Safari); the fixed overlay is enough there.
  useEffect(() => {
    const root = document.documentElement;
    if (root.requestFullscreen && !document.fullscreenElement) {
      root.requestFullscreen().catch(() => {});
    }
    return () => {
      if (document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
    };
  }, []);

  const go = useCallback(
    (to: number) => {
      if (to >= 0 && to < total && to !== at) onIndexChange(to);
    },
    [at, total, onIndexChange],
  );

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.altKey || e.ctrlKey || e.metaKey || ownsArrowKeys(e.target)) return;
    const forward = NEXT_KEYS.has(e.key);
    if (!forward && !PREV_KEYS.has(e.key)) return;
    e.preventDefault();
    const el = scrollRef.current;
    if (el) {
      const box = scrollBox(el);
      const pending = turning.current;
      if (pending && e.timeStamp - pending.at < TURN_MS) box.top = pending.to;
      const step = pageStep(box, forward ? 'down' : 'up');
      if (step.type === 'scroll') {
        turning.current = { to: step.to, at: e.timeStamp };
        el.scrollTo({ top: step.to, behavior: 'smooth' });
        return;
      }
      turning.current = null;
    }
    go(forward ? at + 1 : at - 1);
  };

  const onPointerDown = (e: PointerEvent) => {
    swipe.current = { x: e.clientX, y: e.clientY };
  };
  const onPointerUp = (e: PointerEvent) => {
    const start = swipe.current;
    swipe.current = null;
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.abs(dx) < SWIPE_MIN || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    if (window.getSelection?.()?.toString()) return;
    go(dx < 0 ? at + 1 : at - 1);
  };

  const textSizePx = TEXT_SIZES[textStep]!;
  const setText = (step: number) => {
    setTextStep(step);
    writeTextStep(step);
  };

  return (
    <DialogPrimitive.Root open onOpenChange={(open) => !open && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Content
          aria-labelledby={titleId}
          aria-describedby={undefined}
          onKeyDown={onKeyDown}
          className="fixed inset-0 z-50 flex flex-col bg-background text-foreground outline-none"
        >
          <header className="flex flex-col gap-1 bg-row px-3 py-2 text-row-foreground">
            <div className="flex items-center gap-2">
              <DialogPrimitive.Title
                id={titleId}
                className="min-w-0 flex-1 truncate text-sm opacity-80"
              >
                {title}
                {resolved && (
                  <span className="tabular-nums">
                    {' · '}Song {at + 1} of {total}
                  </span>
                )}
              </DialogPrimitive.Title>
              <DialogPrimitive.Close asChild>
                <Button
                  variant="ghost"
                  size="icon-lg"
                  className="text-row-foreground hover:bg-white/10 hover:text-row-foreground"
                  aria-label="Close the player"
                >
                  <XIcon aria-hidden />
                </Button>
              </DialogPrimitive.Close>
            </div>
            {resolved && (
              <p className="text-xl leading-tight font-semibold break-words">
                {resolved.song.title}
              </p>
            )}
            {resolved && (
              <div className="flex flex-wrap items-center gap-2">
                <KeyBadge value={resolved.key} overridden={resolved.isOverridden.key} />
                <EnergyChip
                  energy={resolved.energy}
                  bpm={resolved.bpm}
                  overridden={resolved.isOverridden.bpm || resolved.isOverridden.energy}
                />
                <TimeSigBadge value={resolved.song.timeSignature} />
              </div>
            )}
          </header>

          {resolved && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-3 py-2">
              <div className="flex items-center gap-1" role="group" aria-label="Text size">
                <Button
                  variant="outline"
                  size="icon-lg"
                  aria-label="Smaller text"
                  disabled={textStep === 0}
                  onClick={() => setText(textStep - 1)}
                >
                  <MinusIcon aria-hidden />
                </Button>
                <span aria-hidden className="px-1 text-sm">
                  A
                </span>
                <Button
                  variant="outline"
                  size="icon-lg"
                  aria-label="Larger text"
                  disabled={textStep === TEXT_SIZES.length - 1}
                  onClick={() => setText(textStep + 1)}
                >
                  <PlusIcon aria-hidden />
                </Button>
              </div>
              <AutoscrollControls
                songId={songId}
                target={scrollRef}
                resetKey={String(at)}
                className="contents"
              />
            </div>
          )}

          <div
            ref={scrollRef}
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4 sm:px-6"
            onPointerDown={onPointerDown}
            onPointerUp={onPointerUp}
            onPointerCancel={() => (swipe.current = null)}
            data-testid="player-scroll"
          >
            <div className="mx-auto w-full max-w-3xl">
              {!resolved ? (
                <p className="text-muted-foreground">This setlist has no songs.</p>
              ) : (
                <MusicianView
                  key={resolved.item.id}
                  resolved={resolved}
                  detail={detail}
                  textSizePx={textSizePx}
                  getPdfUrl={getPdfUrl}
                  onOpenViewer={onOpenResource}
                />
              )}
            </div>
          </div>

          <footer className="flex items-center gap-2 border-t px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
            <Button
              variant="outline"
              className="min-h-tap"
              disabled={at === 0}
              onClick={() => go(at - 1)}
            >
              <ChevronLeftIcon aria-hidden />
              Previous
            </Button>
            <p className="min-w-0 flex-1 truncate text-center text-sm text-muted-foreground">
              {next ? `Next: ${next.song.title}` : 'Last song'}
            </p>
            <Button className="min-h-tap" disabled={at >= total - 1} onClick={() => go(at + 1)}>
              Next
              <ChevronRightIcon aria-hidden />
            </Button>
          </footer>

          <p aria-live="polite" className="sr-only">
            {resolved ? `Song ${at + 1} of ${total}: ${resolved.song.title}` : ''}
          </p>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
