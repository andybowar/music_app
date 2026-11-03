'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useRef, type KeyboardEvent } from 'react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';

import type { FeatureRequestImage } from '../types';

export interface ImageViewerProps {
  images: FeatureRequestImage[];
  /** Index of the open image, or null when closed. */
  index: number | null;
  onIndexChange(index: number | null): void;
}

/**
 * Full-size wireframe dialog. ArrowLeft / ArrowRight move between images (wrapping), Escape
 * closes (Radix), and focus returns to the thumbnail that opened it.
 */
export function ImageViewer({ images, index, onIndexChange }: ImageViewerProps) {
  const image = index === null ? undefined : images[index];
  // No DialogTrigger here, so Radix can't return focus by itself: remember the opener.
  const opener = useRef<HTMLElement | null>(null);
  const n = images.length;
  const go = (delta: number) => {
    if (index === null || n === 0) return;
    onIndexChange((index + delta + n) % n);
  };

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      go(1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      go(-1);
    }
  }

  return (
    <Dialog open={image !== undefined} onOpenChange={(open) => !open && onIndexChange(null)}>
      <DialogContent
        className="grid max-h-[95dvh] w-full max-w-[calc(100%-1rem)] grid-rows-[auto_minmax(0,1fr)_auto] gap-3 p-3 sm:max-w-4xl sm:p-4"
        onKeyDown={onKeyDown}
        onOpenAutoFocus={() => {
          opener.current = document.activeElement as HTMLElement | null;
        }}
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          opener.current?.focus();
        }}
      >
        {image ? (
          <>
            <div className="min-w-0 pr-10">
              <DialogTitle className="truncate text-base">{image.fileName}</DialogTitle>
              <DialogDescription>
                Image {(index ?? 0) + 1} of {n}
                {n > 1 ? '. Use the left and right arrow keys to move between images.' : ''}
              </DialogDescription>
            </div>
            <div className="flex min-h-0 items-center justify-center overflow-auto">
              {/* reason: short-lived signed URLs can't go through next/image. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={image.url}
                alt={`Wireframe: ${image.fileName}`}
                className="max-h-[75dvh] max-w-full object-contain"
              />
            </div>
            {n > 1 ? (
              <div className="flex justify-between gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-tap"
                  onClick={() => go(-1)}
                >
                  <ChevronLeft aria-hidden /> Previous
                </Button>
                <Button type="button" variant="outline" className="min-h-tap" onClick={() => go(1)}>
                  Next <ChevronRight aria-hidden />
                </Button>
              </div>
            ) : null}
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
