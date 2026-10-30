'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { InlineAudio } from '@/components/media/InlineAudio';
import { PdfViewer } from '@/components/media/PdfViewer';
import { samplePdfObjectUrl, sampleToneObjectUrl } from '@/components/media/sampleMedia';
import { ResponsivePanel } from '@/components/ResponsivePanel';
import { LyricsViewer, LyricsViewerSkeleton } from '@/components/song/LyricsViewer';
import {
  ResourcesPanel,
  ResourcesPanelSkeleton,
  resourceAction,
} from '@/components/song/panels/ResourcesPanel';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { SONG_IDS, getSong, songs } from '@/fixtures';
import { SECTIONS, type Resource, type SongDetail } from '@/types/domain';

const full = getSong(SONG_IDS.thousandHallelujahs);
const noFiles = getSong(SONG_IDS.beExaltedOGod);
const noLyrics: SongDetail = {
  ...getSong(SONG_IDS.reviveThisLand),
  lyrics: Object.fromEntries(SECTIONS.map((s) => [s, null])) as SongDetail['lyrics'],
  arrangement: [],
};
/** A file whose upload never finished: nothing to open. */
const brokenResource: Resource = {
  ...full.resources[0]!,
  id: 'dev-broken',
  label: 'Missing chart',
  storagePath: null,
  url: null,
};

const hasLyrics = (s: SongDetail) => SECTIONS.some((sec) => !!s.lyrics[sec]?.trim());

function Frame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="w-[360px] max-w-full rounded-md border bg-popover p-3 text-popover-foreground">
        {children}
      </div>
    </section>
  );
}

type Opened = { kind: 'pdf' | 'audio'; resource: Resource } | null;

/**
 * Body of `/dev/resources`: ResourcesPanel and LyricsViewer with fixture songs. Opening a file
 * shows how a caller (LIB-18) wires it: PDFs in PdfViewer, audio in InlineAudio, links and
 * projection files are reported (no real files; sample media is generated).
 */
export function ResourcesGallery() {
  const [songId, setSongId] = useState<string>(full.id);
  const [contributor, setContributor] = useState(true);
  const [opened, setOpened] = useState<Opened>(null);
  const [lyricsFor, setLyricsFor] = useState<SongDetail | null>(null);
  const [lastAction, setLastAction] = useState('Nothing opened yet');
  const [media, setMedia] = useState<{ pdf: string; tone: string } | null>(null);

  useEffect(() => {
    const pdf = samplePdfObjectUrl(2);
    const tone = sampleToneObjectUrl(4);
    setMedia({ pdf, tone });
    return () => {
      URL.revokeObjectURL(pdf);
      URL.revokeObjectURL(tone);
    };
  }, []);

  const song = getSong(songId);

  const open = (r: Resource) => {
    const action = resourceAction(r);
    setLastAction(`${action}: ${r.label} (${r.format})`);
    if (action === 'view') setOpened({ kind: 'pdf', resource: r });
    else if (action === 'play') setOpened({ kind: 'audio', resource: r });
  };

  const addFiles = (s: SongDetail) =>
    contributor ? (
      <a href={`/songs/${s.id}/edit`} className="font-medium underline underline-offset-4">
        Add files
      </a>
    ) : undefined;

  const panel = (s: SongDetail, extra: Resource[] = []) => (
    <ResourcesPanel
      resources={[...s.resources, ...extra]}
      keys={s.keys}
      onOpen={open}
      onShowLyrics={() => setLyricsFor(s)}
      hasLyrics={hasLyrics(s)}
      addFilesSlot={addFiles(s)}
    />
  );

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 p-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Resources and lyrics</h1>
        <p className="text-sm text-muted-foreground">
          UI-07 · ResourcesPanel and LyricsViewer with fixture songs. Frames are 360px wide.
        </p>
      </header>

      <section className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1 text-sm">
          Song
          <select
            className="min-h-tap rounded-md border bg-background px-2"
            value={songId}
            onChange={(e) => setSongId(e.target.value)}
          >
            {songs.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title} ({s.resources.length} files)
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-h-tap items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={contributor}
            onChange={(e) => setContributor(e.target.checked)}
          />
          Viewer is a contributor (shows the add-files slot)
        </label>
      </section>

      <p className="text-sm" data-testid="last-action" aria-live="polite">
        Last opened: {lastAction}
      </p>

      <Frame title={`ResourcesPanel · ${song.title}`}>{panel(song)}</Frame>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">In a ResponsivePanel</h2>
        <p className="text-sm text-muted-foreground">
          Popover from 768px, bottom sheet below, as the song row opens it.
        </p>
        <ResponsivePanel
          title="Resources"
          trigger={
            <Button variant="outline" className="w-fit">
              Resources
            </Button>
          }
        >
          {panel(song)}
        </ResponsivePanel>
      </section>

      <Frame title="Empty · no files">{panel(noFiles)}</Frame>
      <Frame title="No lyrics, one unavailable file">{panel(noLyrics, [brokenResource])}</Frame>
      <Frame title="Loading">
        <ResourcesPanelSkeleton />
      </Frame>

      <Frame title={`LyricsViewer · as sung · ${full.title}`}>
        <LyricsViewer lyrics={full.lyrics} arrangement={full.arrangement} />
      </Frame>
      <Frame title="LyricsViewer · by section">
        <LyricsViewer lyrics={full.lyrics} arrangement={full.arrangement} mode="sections" />
      </Frame>
      <Frame title="LyricsViewer · no arrangement">
        <LyricsViewer lyrics={full.lyrics} arrangement={[]} />
      </Frame>
      <Frame title="LyricsViewer · empty">
        <LyricsViewer lyrics={noLyrics.lyrics} arrangement={[]} />
      </Frame>
      <Frame title="LyricsViewer · loading">
        <LyricsViewerSkeleton />
      </Frame>

      <Dialog open={lyricsFor !== null} onOpenChange={(o) => !o && setLyricsFor(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogTitle>{lyricsFor?.title ?? 'Lyrics'}</DialogTitle>
          {lyricsFor ? (
            <LyricsViewer lyrics={lyricsFor.lyrics} arrangement={lyricsFor.arrangement} />
          ) : null}
        </DialogContent>
      </Dialog>

      {opened?.kind === 'pdf' && media ? (
        <PdfViewer
          url={media.pdf}
          title={`${song.title} · ${opened.resource.label}`}
          onClose={() => setOpened(null)}
        />
      ) : null}
      {opened?.kind === 'audio' && media ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">Playing</h2>
          <InlineAudio url={media.tone} title={`${song.title} · ${opened.resource.label}`} />
        </section>
      ) : null}
    </main>
  );
}
