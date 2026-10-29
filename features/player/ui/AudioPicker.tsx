'use client';

import * as React from 'react';
import { ChevronDownIcon } from 'lucide-react';
import { cn } from '@/components/ui/utils';
import type { Resource, UUID } from '@/types/domain';

export interface AudioPickerProps {
  /** The song's resources (any kinds); only playable audio/video items are offered. */
  resources: Resource[];
  /** The chosen resource id, or null for no recording. */
  value: UUID | null;
  /** Called with the chosen resource id, or null when cleared. */
  onChange(id: UUID | null): void;
  /** Accessible name for the select. Defaults to "Recording". */
  label?: string;
  className?: string;
}

const NONE = '';
const YOUTUBE_HOSTS = new Set(['youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be']);

/** True when the URL points at YouTube. */
export function isYouTubeUrl(url: string | null): boolean {
  if (!url) return false;
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
    return YOUTUBE_HOSTS.has(host);
  } catch {
    return false;
  }
}

/** Resources a playlist entry can play: audio files/links and video links. */
export function playableResources(resources: Resource[]): Resource[] {
  return resources.filter((r) => r.kind === 'audio' || r.kind === 'video_link');
}

/** Option text, e.g. "Nova recording 3/15/24" or "YouTube: Hillsong 7/5/22". */
export function audioOptionLabel(resource: Resource): string {
  const label = resource.label.trim();
  const youTube = isYouTubeUrl(resource.url);
  if (!label) {
    if (youTube) return 'YouTube video';
    if (resource.format === 'url') return 'Audio link';
    return `${resource.format.toUpperCase()} recording`;
  }
  if (youTube && !/^youtube\b/i.test(label)) return `YouTube: ${label}`;
  return label;
}

export function AudioPicker({
  resources,
  value,
  onChange,
  label = 'Recording',
  className,
}: AudioPickerProps) {
  const id = React.useId();
  const hintId = `${id}-hint`;
  const options = React.useMemo(() => playableResources(resources), [resources]);
  const files = options.filter((r) => r.format !== 'url');
  const links = options.filter((r) => r.format === 'url');
  const empty = options.length === 0;
  const selected = value !== null && options.some((r) => r.id === value) ? value : NONE;

  return (
    <div className={cn('flex w-full min-w-0 flex-col gap-1', className)}>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <div className="relative w-full min-w-0">
        <select
          id={id}
          value={selected}
          disabled={empty}
          aria-describedby={empty ? hintId : undefined}
          onChange={(e) => onChange(e.target.value === NONE ? null : e.target.value)}
          className={cn(
            'min-h-tap w-full min-w-0 appearance-none truncate rounded-md border border-input bg-background py-2 pr-9 pl-3 text-sm shadow-xs outline-none',
            'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
            'disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30',
          )}
        >
          <option value={NONE}>{empty ? 'No audio' : 'No recording'}</option>
          {files.length > 0 && (
            <optgroup label="Recordings">
              {files.map((r) => (
                <option key={r.id} value={r.id}>
                  {audioOptionLabel(r)}
                </option>
              ))}
            </optgroup>
          )}
          {links.length > 0 && (
            <optgroup label="Links">
              {links.map((r) => (
                <option key={r.id} value={r.id}>
                  {audioOptionLabel(r)}
                </option>
              ))}
            </optgroup>
          )}
        </select>
        <ChevronDownIcon
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 opacity-50"
        />
      </div>
      {empty && (
        <p id={hintId} className="text-xs text-muted-foreground">
          This song has no audio yet. Add an MP3 or YouTube link to the song to play it here.
        </p>
      )}
    </div>
  );
}
