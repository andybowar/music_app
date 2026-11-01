'use client';

import { useEffect, useRef, useState } from 'react';
import { samplePdfObjectUrl, sampleToneObjectUrl } from '@/components/media/sampleMedia';
import { Toaster } from '@/components/ui/sonner';
import {
  SongPage,
  SongPageError,
  SongPageSkeleton,
  type SignedUrlResult,
} from '@/features/songs/ui/SongPage';
import { SONG_IDS, getSong, songs } from '@/fixtures';
import { SIGNED_URL_TTL_SECONDS, type UUID } from '@/types/domain';

type View = 'song' | 'loading' | 'error';

/**
 * Body of `/dev/song-page`: SongPage with fixture songs. Signed URLs are faked with generated
 * sample media (a PDF and a tone), so opening files works without storage.
 */
export function SongPageGallery() {
  const [songId, setSongId] = useState<string>(SONG_IDS.thousandHallelujahs);
  const [canEdit, setCanEdit] = useState(true);
  const [canViewHistory, setCanViewHistory] = useState(true);
  const [failSigning, setFailSigning] = useState(false);
  const [view, setView] = useState<View>('song');
  const media = useRef<{ pdf: string; tone: string } | null>(null);

  useEffect(() => {
    const pdf = samplePdfObjectUrl(2);
    const tone = sampleToneObjectUrl(4);
    media.current = { pdf, tone };
    return () => {
      URL.revokeObjectURL(pdf);
      URL.revokeObjectURL(tone);
      media.current = null;
    };
  }, []);

  const song = getSong(songId);

  const fakeSign = async (id: UUID): Promise<SignedUrlResult> => {
    await new Promise((r) => setTimeout(r, 300));
    const resource = song.resources.find((r) => r.id === id);
    if (failSigning || !resource || !media.current) {
      return { ok: false, error: { code: 'NOT_FOUND', message: 'File not found.' } };
    }
    const url = resource.format === 'pdf' ? media.current.pdf : media.current.tone;
    const expiresAt = new Date(Date.now() + SIGNED_URL_TTL_SECONDS * 1000).toISOString();
    return { ok: true, data: { url, expiresAt } };
  };

  return (
    <div className="flex flex-col gap-4">
      <header className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 pt-4">
        <h1 className="text-sm font-medium text-muted-foreground">
          LIB-18 · SongPage with fixture songs
        </h1>
        <div className="flex flex-wrap items-end gap-4 text-sm">
          <label className="flex flex-col gap-1">
            Song
            <select
              className="min-h-tap rounded-md border bg-background px-2"
              value={songId}
              onChange={(e) => setSongId(e.target.value)}
            >
              {songs.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            State
            <select
              className="min-h-tap rounded-md border bg-background px-2"
              value={view}
              onChange={(e) => setView(e.target.value as View)}
            >
              <option value="song">Loaded</option>
              <option value="loading">Loading</option>
              <option value="error">Error</option>
            </select>
          </label>
          <label className="flex min-h-tap items-center gap-2">
            <input
              type="checkbox"
              checked={canEdit}
              onChange={(e) => setCanEdit(e.target.checked)}
            />
            Can edit (contributor)
          </label>
          <label className="flex min-h-tap items-center gap-2">
            <input
              type="checkbox"
              checked={canViewHistory}
              onChange={(e) => setCanViewHistory(e.target.checked)}
            />
            Can view history
          </label>
          <label className="flex min-h-tap items-center gap-2">
            <input
              type="checkbox"
              checked={failSigning}
              onChange={(e) => setFailSigning(e.target.checked)}
            />
            Opening files fails
          </label>
        </div>
      </header>

      {view === 'loading' ? <SongPageSkeleton /> : null}
      {view === 'error' ? <SongPageError retryHref="/dev/song-page" /> : null}
      {view === 'song' ? (
        <SongPage
          key={song.id}
          song={song}
          canEdit={canEdit}
          canViewHistory={canViewHistory}
          getSignedResourceUrl={fakeSign}
        />
      ) : null}
      <Toaster />
    </div>
  );
}
