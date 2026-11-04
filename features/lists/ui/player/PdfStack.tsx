'use client';

import dynamic from 'next/dynamic';
import { Maximize2Icon, RotateCwIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { Resource } from '@/types/domain';

const PdfPages = dynamic(() => import('./PdfPages').then((m) => m.PdfPages), {
  ssr: false,
  loading: () => null,
});

/** Fit the player's width, but don't blow a chart up past this. */
const MAX_WIDTH = 1000;

export interface PdfStackProps {
  resource: Resource;
  label: string;
  /** Resolves a signed URL for the PDF (`getSignedResourceUrl`), or throws. */
  getPdfUrl(r: Resource): Promise<string>;
  /** Opens the zoomable page-by-page viewer. */
  onOpenViewer(r: Resource): void;
}

type Status = 'loading' | 'ready' | 'error';

/** A PDF chart rendered inline with its pages stacked, so the player can scroll through it. */
export function PdfStack({ resource, label, getPdfUrl, onOpenViewer }: PdfStackProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [attempt, setAttempt] = useState(0);
  const [width, setWidth] = useState(0);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    setStatus('loading');
    setUrl(null);
    getPdfUrl(resource).then(
      (u) => live && setUrl(u),
      () => live && setStatus('error'),
    );
    return () => {
      live = false;
    };
  }, [resource, getPdfUrl, attempt]);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const update = () => setWidth(Math.max(0, Math.min(MAX_WIDTH, el.clientWidth)));
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          className="min-h-tap"
          onClick={() => onOpenViewer(resource)}
        >
          <Maximize2Icon aria-hidden />
          Zoom
        </Button>
      </div>
      <div ref={box} className="relative w-full">
        {status === 'error' ? (
          <div role="alert" className="flex flex-col items-start gap-2 rounded-md border p-4">
            <p className="font-medium">Couldn’t load {label}.</p>
            <p className="text-sm text-muted-foreground">
              Check your connection. Charts you’ve opened before also work offline.
            </p>
            <Button
              variant="outline"
              className="min-h-tap"
              onClick={() => setAttempt((a) => a + 1)}
            >
              <RotateCwIcon aria-hidden />
              Try again
            </Button>
          </div>
        ) : (
          <>
            {status === 'loading' && (
              <div role="status" aria-label={`Loading ${label}`}>
                <Skeleton className="aspect-[8.5/11] w-full" />
              </div>
            )}
            {url && width > 0 && (
              <PdfPages
                key={`${url}-${attempt}`}
                url={url}
                title={label}
                width={width}
                onLoadSuccess={() => setStatus('ready')}
                onLoadError={() => setStatus('error')}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
