'use client';

import dynamic from 'next/dynamic';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  XIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/components/ui/utils';
import {
  MAX_SCALE,
  MIN_SCALE,
  clampPage,
  clampScale,
  downloadName,
  pinchScale,
  pointerDistance,
  stepScale,
} from './mediaMath';

export type PdfViewerProps = {
  url: string;
  title: string;
  onClose(): void;
};

const PdfDocument = dynamic(() => import('./PdfDocument').then((m) => m.PdfDocument), {
  ssr: false,
  loading: () => null,
});

/** Page width at 100% zoom: fit the viewport, but don't blow sheet music up past this. */
const MAX_FIT_WIDTH = 900;
const GUTTER = 16;

type Status = 'loading' | 'ready' | 'error';
type Point = { x: number; y: number };

/**
 * In-app PDF viewer (REQ-ROW-04): a full-screen dialog on mobile and a large modal from `sm` up.
 * Page nav (buttons, ←/→, PageUp/PageDown, Home/End), zoom (buttons, +/−/0, pinch, ctrl+wheel /
 * trackpad pinch) and a download link. Render it to open; `onClose` fires on Escape, the close
 * button or an outside click.
 */
export function PdfViewer({ url, title, onClose }: PdfViewerProps) {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [scale, setScale] = useState(1);
  const [status, setStatus] = useState<Status>('loading');
  const [attempt, setAttempt] = useState(0);
  const [fitWidth, setFitWidth] = useState(0);
  /** Live pinch ratio, applied as a CSS transform until the gesture ends (avoids re-rendering). */
  const [pinchRatio, setPinchRatio] = useState(1);

  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
  const pointers = useRef(new Map<number, Point>());
  const pinchStart = useRef<number | null>(null);

  const hasUrl = url.trim().length > 0;

  // The dialog has no Radix trigger (callers render it to open), so return focus to whatever
  // opened it when it unmounts. Captured during the first render, before focus moves inside.
  const [opener] = useState(() =>
    typeof document !== 'undefined' && document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null,
  );
  useEffect(
    () => () => {
      if (opener?.isConnected) opener.focus();
    },
    [opener],
  );

  // Reset when a different file is shown.
  useEffect(() => {
    setNumPages(null);
    setPage(1);
    setScale(1);
    setStatus('loading');
  }, [url]);

  // Fit-to-width at 100% zoom, tracking the scroll area's width. The dialog content mounts in a
  // portal, so the element arrives via a callback ref (state) rather than on first render.
  useEffect(() => {
    if (!scrollEl) return;
    const update = () =>
      setFitWidth(Math.max(0, Math.min(MAX_FIT_WIDTH, scrollEl.clientWidth - GUTTER * 2)));
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(update);
    ro.observe(scrollEl);
    return () => ro.disconnect();
  }, [scrollEl]);

  // Trackpad pinch and ctrl+wheel. Needs a non-passive listener to stop the browser zooming the page.
  useEffect(() => {
    if (!scrollEl) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      setScale((s) => clampScale(s * Math.exp(-e.deltaY * 0.01)));
    };
    scrollEl.addEventListener('wheel', onWheel, { passive: false });
    return () => scrollEl.removeEventListener('wheel', onWheel);
  }, [scrollEl]);

  const goTo = useCallback((p: number) => setPage(clampPage(p, numPages)), [numPages]);
  const zoom = useCallback((direction: 1 | -1) => setScale((s) => stepScale(s, direction)), []);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.altKey || e.metaKey || e.ctrlKey || status !== 'ready') return;
    const handled = (() => {
      switch (e.key) {
        case 'ArrowLeft':
        case 'PageUp':
          goTo(page - 1);
          return true;
        case 'ArrowRight':
        case 'PageDown':
          goTo(page + 1);
          return true;
        case 'Home':
          goTo(1);
          return true;
        case 'End':
          goTo(numPages ?? 1);
          return true;
        case '+':
        case '=':
          zoom(1);
          return true;
        case '-':
        case '_':
          zoom(-1);
          return true;
        case '0':
          setScale(1);
          return true;
        default:
          return false;
      }
    })();
    if (handled) e.preventDefault();
  };

  // Two-finger pinch on touch screens. `touch-action: pan-x pan-y` leaves scrolling to the browser.
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'touch') return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()] as [Point, Point];
      pinchStart.current = pointerDistance(a, b);
    }
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2 && pinchStart.current) {
      const [a, b] = [...pointers.current.values()] as [Point, Point];
      setPinchRatio(pinchScale(scale, pinchStart.current, pointerDistance(a, b)) / scale);
    }
  };
  const endPointer = (e: PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.delete(e.pointerId)) return;
    if (pinchStart.current && pointers.current.size < 2) {
      pinchStart.current = null;
      setScale((s) => clampScale(s * pinchRatio));
      setPinchRatio(1);
    }
  };

  const retry = () => {
    setStatus('loading');
    setAttempt((n) => n + 1);
  };

  const ready = status === 'ready';
  const pageWidth = Math.round(fitWidth * scale);
  const pageLabel = numPages ? `Page ${page} of ${numPages}` : 'Page – of –';

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        onKeyDown={onKeyDown}
        data-testid="pdf-viewer"
        className={cn(
          'flex flex-col gap-0 overflow-hidden p-0',
          // Mobile: full screen. `sm` and up: a large centred modal.
          'top-0 left-0 h-dvh w-full max-w-full translate-x-0 translate-y-0 rounded-none border-0',
          'sm:top-[50%] sm:left-[50%] sm:h-[90dvh] sm:w-[calc(100%-2rem)] sm:max-w-5xl sm:translate-x-[-50%] sm:translate-y-[-50%] sm:rounded-lg sm:border',
        )}
      >
        <header className="flex items-center gap-1 border-b px-2 py-1 pt-[max(0.25rem,env(safe-area-inset-top))]">
          <DialogTitle className="min-w-0 flex-1 truncate px-2 text-base">{title}</DialogTitle>
          <DialogDescription className="sr-only">
            PDF viewer. Use the arrow keys to change page and plus or minus to zoom.
          </DialogDescription>
          {hasUrl && (
            <Button asChild variant="ghost" size="icon" className="size-tap">
              <a href={url} download={downloadName(url, title)} aria-label={`Download ${title}`}>
                <DownloadIcon aria-hidden />
              </a>
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="size-tap"
            onClick={onClose}
            aria-label="Close"
          >
            <XIcon aria-hidden />
          </Button>
        </header>

        <div
          ref={setScrollEl}
          data-testid="pdf-scroll"
          className="relative min-h-0 flex-1 touch-pan-x touch-pan-y overflow-auto bg-muted"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endPointer}
          onPointerCancel={endPointer}
        >
          {!hasUrl ? (
            <p className="p-6 text-center text-sm text-muted-foreground">No PDF to show.</p>
          ) : status === 'error' ? (
            <div role="alert" className="flex flex-col items-center gap-3 p-6 text-center text-sm">
              <p>Couldn’t open this PDF.</p>
              <div className="flex flex-wrap justify-center gap-2">
                <Button variant="outline" onClick={retry}>
                  Try again
                </Button>
                <Button asChild variant="ghost">
                  <a href={url} download={downloadName(url, title)}>
                    Download instead
                  </a>
                </Button>
              </div>
            </div>
          ) : (
            <>
              {status === 'loading' && (
                <div
                  role="status"
                  aria-label="Loading PDF"
                  className="absolute inset-x-0 top-0 flex justify-center p-4"
                >
                  <Skeleton className="aspect-[8.5/11] w-full max-w-[min(900px,100%)]" />
                </div>
              )}
              <div
                className="mx-auto w-max p-4"
                style={
                  pinchRatio === 1
                    ? undefined
                    : { transform: `scale(${pinchRatio})`, transformOrigin: 'top center' }
                }
              >
                {fitWidth > 0 && (
                  <PdfDocument
                    key={attempt}
                    url={url}
                    title={title}
                    pageNumber={page}
                    width={pageWidth}
                    onLoadSuccess={(n) => {
                      setNumPages(n);
                      setPage((p) => clampPage(p, n));
                      setStatus('ready');
                    }}
                    onLoadError={() => setStatus('error')}
                  />
                )}
              </div>
            </>
          )}
        </div>

        {hasUrl && status !== 'error' && (
          <footer className="flex items-center justify-between gap-1 border-t px-2 py-1 pb-[max(0.25rem,env(safe-area-inset-bottom))]">
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="size-tap"
                onClick={() => goTo(page - 1)}
                disabled={!ready || page <= 1}
                aria-label="Previous page"
              >
                <ChevronLeftIcon aria-hidden />
              </Button>
              <span aria-live="polite" className="min-w-24 text-center text-sm tabular-nums">
                {pageLabel}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="size-tap"
                onClick={() => goTo(page + 1)}
                disabled={!ready || numPages === null || page >= numPages}
                aria-label="Next page"
              >
                <ChevronRightIcon aria-hidden />
              </Button>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="size-tap"
                onClick={() => zoom(-1)}
                disabled={!ready || scale <= MIN_SCALE}
                aria-label="Zoom out"
              >
                <ZoomOutIcon aria-hidden />
              </Button>
              <Button
                variant="ghost"
                className="min-h-tap min-w-14 px-2 text-sm tabular-nums"
                onClick={() => setScale(1)}
                disabled={!ready}
                aria-label={`Zoom ${Math.round(scale * 100)}%, reset to fit width`}
              >
                {Math.round(scale * 100)}%
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-tap"
                onClick={() => zoom(1)}
                disabled={!ready || scale >= MAX_SCALE}
                aria-label="Zoom in"
              >
                <ZoomInIcon aria-hidden />
              </Button>
            </div>
          </footer>
        )}
      </DialogContent>
    </Dialog>
  );
}
