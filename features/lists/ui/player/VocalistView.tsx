'use client';

import { LyricsViewer } from '@/components/song/LyricsViewer';
import type { SongDetail } from '@/types/domain';

import { hasLyrics } from './charts';

/** The vocalist's view of one song (LIST-11): lyrics only, as sung. */
export function VocalistView({
  detail,
  textSizePx,
}: {
  detail: SongDetail | undefined;
  textSizePx: number;
}) {
  if (!hasLyrics(detail)) {
    return <p className="text-muted-foreground">Lyrics aren’t available for this song.</p>;
  }
  return (
    <LyricsViewer
      lyrics={detail!.lyrics}
      arrangement={detail!.arrangement}
      textSizePx={textSizePx}
    />
  );
}
