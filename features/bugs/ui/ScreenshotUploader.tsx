'use client';

import { AlertCircle, Check, ImageIcon, ImagePlus, RotateCw, X } from 'lucide-react';
import { useId, useRef, useState, type DragEvent } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/utils';
import { formatBytes, imageFilesFrom } from '@/features/admin/backlog/ui/uploads';
import type { UploadItem, UploadStage } from '@/features/admin/backlog/ui/WireframeUploader';

import { IMAGE_MIME_TYPES, MAX_IMAGES_PER_BUG } from '../types';

export type { UploadItem } from '@/features/admin/backlog/ui/WireframeUploader';

export interface ScreenshotUploaderProps {
  items: UploadItem[];
  /** Messages for files refused before upload. */
  rejections: string[];
  disabled?: boolean;
  /** False once the report is saved: only Retry and Remove are left. */
  allowAdd?: boolean;
  onAddFiles(files: File[]): void;
  onRemoveItem(key: string): void;
  onRetryItem(key: string): void;
}

const STAGE_TEXT: Record<UploadStage, string> = {
  queued: 'Ready to send',
  uploading: 'Uploading',
  finalizing: 'Saving',
  done: 'Sent',
  failed: 'Upload failed',
};

/**
 * Screenshots for a bug report: pick, drag and drop, or paste (the form forwards paste
 * events). The same flow and upload items as ADM-06's wireframe uploader, worded for
 * screenshots, with per-image progress, Retry and Remove.
 */
export function ScreenshotUploader({
  items,
  rejections,
  disabled,
  allowAdd = true,
  onAddFiles,
  onRemoveItem,
  onRetryItem,
}: ScreenshotUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const hintId = useId();
  const full = items.length >= MAX_IMAGES_PER_BUG;

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (disabled || !allowAdd) return;
    const files = imageFilesFrom(e.dataTransfer);
    if (files.length > 0) onAddFiles(files);
  }

  return (
    <fieldset className="grid min-w-0 gap-2">
      <legend className="text-sm font-medium">Screenshots (optional)</legend>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled && allowAdd) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          'flex flex-col items-center gap-2 rounded-lg border-2 border-dashed p-4 text-center text-sm',
          dragging ? 'border-primary bg-accent' : 'border-input',
        )}
        data-testid="screenshot-dropzone"
      >
        <ImagePlus aria-hidden className="size-6 text-muted-foreground" />
        <p id={hintId} className="text-muted-foreground">
          Drag screenshots here, paste from the clipboard, or choose files. Up to{' '}
          {MAX_IMAGES_PER_BUG} PNG, JPEG, WebP or GIF images, 10 MB each.
        </p>
        <Button
          type="button"
          variant="outline"
          className="min-h-tap"
          disabled={disabled || full || !allowAdd}
          aria-describedby={hintId}
          onClick={() => inputRef.current?.click()}
        >
          Choose screenshots
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept={IMAGE_MIME_TYPES.join(',')}
          multiple
          hidden
          aria-label="Choose screenshots"
          data-testid="screenshot-input"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = '';
            if (files.length > 0) onAddFiles(files);
          }}
        />
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {items.length} of {MAX_IMAGES_PER_BUG} screenshots
        </p>
      </div>

      {rejections.length > 0 ? (
        <div role="alert">
          <ul className="grid gap-1 text-sm text-destructive">
            {rejections.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {items.length > 0 ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3" aria-label="Selected screenshots">
          {items.map((item) => (
            <ItemCard
              key={item.key}
              item={item}
              disabled={disabled}
              onRemove={() => onRemoveItem(item.key)}
              onRetry={() => onRetryItem(item.key)}
            />
          ))}
        </ul>
      ) : null}
    </fieldset>
  );
}

function ItemCard({
  item,
  disabled,
  onRemove,
  onRetry,
}: {
  item: UploadItem;
  disabled?: boolean;
  onRemove(): void;
  onRetry(): void;
}) {
  const name = item.file.name || 'Pasted image';
  const busy = item.stage === 'uploading' || item.stage === 'finalizing';
  return (
    <li
      className={cn(
        'grid min-w-0 gap-1 rounded-md border p-2',
        item.stage === 'failed' && 'border-destructive',
      )}
      data-stage={item.stage}
    >
      <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded bg-muted">
        {item.previewUrl ? (
          // reason: object URLs can't go through next/image.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.previewUrl}
            alt={`Screenshot: ${name}`}
            className="size-full object-contain"
          />
        ) : (
          <ImageIcon aria-hidden className="size-6 text-muted-foreground" />
        )}
      </div>
      <span className="truncate text-xs" title={name}>
        {name}
      </span>
      <span
        className={cn(
          'flex items-center gap-1 text-xs',
          item.stage === 'failed' ? 'text-destructive' : 'text-muted-foreground',
        )}
      >
        {item.stage === 'done' ? <Check aria-hidden className="size-3.5" /> : null}
        {item.stage === 'failed' ? <AlertCircle aria-hidden className="size-3.5" /> : null}
        {STAGE_TEXT[item.stage]}
        {item.stage === 'queued' ? ` · ${formatBytes(item.file.size)}` : null}
      </span>
      {busy ? (
        <progress
          className="h-1.5 w-full"
          max={1}
          value={item.stage === 'finalizing' ? 1 : item.progress}
          aria-label={`Uploading ${name}`}
        />
      ) : null}
      {item.stage === 'failed' && item.error ? (
        <span className="text-xs break-words text-destructive">{item.error}</span>
      ) : null}
      <span className="flex flex-wrap gap-1">
        {item.stage === 'failed' ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-tap"
            disabled={disabled}
            onClick={onRetry}
            aria-label={`Retry ${name}`}
          >
            <RotateCw aria-hidden /> Retry
          </Button>
        ) : null}
        {item.stage !== 'done' ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="min-h-tap"
            disabled={disabled || busy}
            onClick={onRemove}
            aria-label={`Remove ${name}`}
          >
            <X aria-hidden /> Remove
          </Button>
        ) : null}
      </span>
    </li>
  );
}
