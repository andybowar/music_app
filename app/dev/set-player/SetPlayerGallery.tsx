'use client';

import { useMemo, useRef, useState } from 'react';

import { PdfViewer } from '@/components/media/PdfViewer';
import { samplePdfObjectUrl } from '@/components/media/sampleMedia';
import { Button } from '@/components/ui/button';
import { ROLE_LABEL, type PlayerRole } from '@/features/lists/ui/player/playerPrefs';
import { SetPlayer } from '@/features/lists/ui/player/SetPlayer';
import { StartEventDialog } from '@/features/lists/ui/player/StartEventDialog';
import { LIST_IDS, SONG_IDS, getSong } from '@/fixtures';
import { resolveItemDisplay } from '@/lib/lists/resolve';
import type { ListItem, Resource } from '@/types/domain';

/** Six songs, one per case the player has to handle. */
const CASES: Array<{ songId: string; overrideKey?: string; note: string }> = [
  { songId: SONG_IDS.amazingGrace, note: 'typed chords + 3 PDFs: asks which chart' },
  { songId: SONG_IDS.beExaltedOGod, note: 'no chart: lyrics + first chords' },
  { songId: SONG_IDS.holySpirit, overrideKey: 'E', note: 'key overridden to E: no files' },
  { songId: SONG_IDS.agnusDei, note: 'one chord chart: shown straight away' },
  { songId: SONG_IDS.atTheCross, note: 'details not loaded; projection slides' },
  { songId: SONG_IDS.amazingGrace, overrideKey: 'A', note: 'typed chords in G, set plays A' },
];

const items = CASES.map((c, i) => {
  const item: ListItem = {
    id: `90000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
    listId: LIST_IDS.bg41926,
    songId: c.songId,
    position: i,
    overrideKey: c.overrideKey ?? null,
    overrideBpm: null,
    overrideEnergy: null,
    resourceId: null,
    notes: null,
  };
  return resolveItemDisplay(getSong(c.songId), item);
});

/** At the Cross is left out, to show a song whose details failed to load. */
const songs = [...new Set(CASES.map((c) => c.songId))]
  .filter((id) => id !== SONG_IDS.atTheCross)
  .map(getSong);

/**
 * Body of `/dev/set-player` (LIST-11). PDFs are generated sample files: each chart is a few
 * pages so autoscroll and the page-turner keys have something to move through. Projection files
 * just report what would open.
 */
export function SetPlayerGallery() {
  const [asking, setAsking] = useState(false);
  const [play, setPlay] = useState<{ index: number; role: PlayerRole } | null>(null);
  const [start, setStart] = useState(0);
  const [pdf, setPdf] = useState<{ url: string; title: string } | null>(null);
  const [opened, setOpened] = useState('');
  const pdfUrls = useRef(new Map<string, string>());

  const getPdfUrl = useMemo(
    () => async (r: Resource) => {
      if (!pdfUrls.current.has(r.id)) pdfUrls.current.set(r.id, samplePdfObjectUrl(4));
      return pdfUrls.current.get(r.id)!;
    },
    [],
  );

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-4 py-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Set player</h1>
        <p className="text-sm text-muted-foreground">
          LIST-11 gallery. Start asks for a role every time; the role can be changed inside the
          player. Use ← / → or Page Up / Page Down like a page-turner pedal.
        </p>
      </header>

      <ol className="list-decimal space-y-1 pl-5 text-sm">
        {CASES.map((c, i) => (
          <li key={i}>
            <span className="font-medium">{getSong(c.songId).title}</span>: {c.note}
          </li>
        ))}
      </ol>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Start at song
          <select
            className="h-tap rounded-md border px-2"
            value={start}
            onChange={(e) => setStart(Number(e.target.value))}
          >
            {CASES.map((_, i) => (
              <option key={i} value={i}>
                {i + 1}
              </option>
            ))}
          </select>
        </label>
        <Button className="min-h-tap" onClick={() => setAsking(true)}>
          Play
        </Button>
      </div>
      {play && <p className="text-sm">Open as {ROLE_LABEL[play.role]}.</p>}
      {opened && (
        <p role="status" className="text-sm">
          {opened}
        </p>
      )}

      <StartEventDialog
        songTitle={items[start]?.song.title}
        open={asking}
        onOpenChange={setAsking}
        onStart={(role) => {
          setAsking(false);
          setPlay({ index: start, role });
        }}
      />
      {play && (
        <SetPlayer
          title="BG 4/19/26 (gallery)"
          items={items}
          songs={songs}
          index={play.index}
          onIndexChange={(index) => setPlay({ ...play, index })}
          role={play.role}
          onRoleChange={(role) => setPlay({ ...play, role })}
          getPdfUrl={getPdfUrl}
          onOpenResource={(r) => {
            if (r.format === 'pdf')
              void getPdfUrl(r).then((url) => setPdf({ url, title: r.label }));
            else setOpened(`Would open “${r.label}” (${r.format}).`);
          }}
          onClose={() => setPlay(null)}
        />
      )}
      {pdf && <PdfViewer url={pdf.url} title={pdf.title} onClose={() => setPdf(null)} />}
    </main>
  );
}
