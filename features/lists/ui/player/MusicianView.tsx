'use client';

import { FileTextIcon, GuitarIcon, TriangleAlertIcon } from 'lucide-react';
import { useEffect, useState } from 'react';

import { CapoControl } from '@/components/song/CapoControl';
import { LyricsViewer } from '@/components/song/LyricsViewer';
import { chordsInText, readCapo, suggestCapo, writeCapo } from '@/lib/lyrics/capo';
import { Button } from '@/components/ui/button';
import { displayKey } from '@/components/song/KeyBadge';
import { MISSING_CHORD, SECTIONS } from '@/types/domain';
import type { ResolvedItem, Resource, SongChords, SongDetail } from '@/types/domain';

import { FirstChords } from '../ItemOverrideEditor';
import { chartOptions, hasLyrics, keyMismatch, type ChartOption } from './charts';
import { PdfStack } from './PdfStack';

export interface MusicianViewProps {
  resolved: ResolvedItem;
  detail: SongDetail | undefined;
  textSizePx: number;
  getPdfUrl(r: Resource): Promise<string>;
  onOpenViewer(r: Resource): void;
}

function optionLabel(o: ChartOption): string {
  return o.type === 'typed' ? `${o.label} (in ${displayKey(o.chords.key)})` : o.label;
}

/**
 * The musician's view of one song (LIST-11): first chords, then a chart. With more than one
 * chart (typed chords and/or PDFs), it asks which one every time the song comes up; render it
 * with `key={item id}` so the choice resets per song. No chart: the lyrics plus first chords.
 */
export function MusicianView({
  resolved,
  detail,
  textSizePx,
  getPdfUrl,
  onOpenViewer,
}: MusicianViewProps) {
  const options = chartOptions(resolved, detail);
  const [chosenId, setChosenId] = useState<string | null>(null);
  const chosen = options.length === 1 ? options[0]! : options.find((o) => o.id === chosenId);

  // Capo: remembered on this device for the song in this setlist key.
  const songId = resolved.song.id;
  const [capo, setCapo] = useState(() => readCapo(songId, resolved.key));
  useEffect(() => setCapo(readCapo(songId, resolved.key)), [songId, resolved.key]);
  const changeCapo = (next: number) => {
    setCapo(next);
    writeCapo(songId, resolved.key, next);
  };
  const typed = chosen?.type === 'typed' ? chosen.chords : null;
  // Typed chords are written in their own key; first chords are in the setlist's key.
  const soundingKey = typed?.key ?? resolved.key;
  const firstChordList = Object.values(resolved.firstChords).filter((c) => c !== MISSING_CHORD);
  const suggestion = suggestCapo(
    typed ? SECTIONS.flatMap((s) => chordsInText(typed.sections[s])) : firstChordList,
    soundingKey,
  );

  return (
    <div className="flex flex-col gap-4">
      <FirstChords
        chords={resolved.firstChords}
        capo={capo}
        soundingKey={resolved.key}
        className="rounded-md bg-muted/60 px-3 py-2"
      />
      <CapoControl
        capo={capo}
        onChange={changeCapo}
        soundingKey={soundingKey}
        suggestion={suggestion}
      />
      {capo > 0 && chosen?.type === 'pdf' && (
        <p className="text-sm text-muted-foreground">
          The capo changes typed chords and first chords; PDF charts stay as written.
        </p>
      )}
      {resolved.needsUpload && (
        <p className="text-sm text-muted-foreground">No files for this key.</p>
      )}

      {options.length === 0 ? (
        <NoChart resolved={resolved} detail={detail} textSizePx={textSizePx} />
      ) : !chosen ? (
        <section aria-labelledby="chart-choice" className="flex flex-col gap-3">
          <h3 id="chart-choice" className="text-lg font-semibold">
            Which chart?
          </h3>
          <ul className="flex flex-col gap-2">
            {options.map((o) => (
              <li key={o.id}>
                <Button
                  variant="outline"
                  className="min-h-tap w-full justify-start text-left text-base"
                  onClick={() => setChosenId(o.id)}
                >
                  {o.type === 'typed' ? <GuitarIcon aria-hidden /> : <FileTextIcon aria-hidden />}
                  {optionLabel(o)}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <section aria-label={optionLabel(chosen)} className="flex flex-col gap-3">
          {options.length > 1 && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">{optionLabel(chosen)}</p>
              <Button variant="ghost" className="min-h-tap" onClick={() => setChosenId(null)}>
                Choose another chart
              </Button>
            </div>
          )}
          {chosen.type === 'typed' ? (
            <TypedChords
              resolved={resolved}
              detail={detail!}
              chords={chosen.chords}
              capo={capo}
              textSizePx={textSizePx}
            />
          ) : (
            <PdfStack
              key={chosen.resource.id}
              resource={chosen.resource}
              label={chosen.label}
              getPdfUrl={getPdfUrl}
              onOpenViewer={onOpenViewer}
            />
          )}
        </section>
      )}
    </div>
  );
}

function TypedChords({
  resolved,
  detail,
  chords,
  capo,
  textSizePx,
}: {
  resolved: ResolvedItem;
  detail: SongDetail;
  chords: SongChords;
  capo: number;
  textSizePx: number;
}) {
  const warning = keyMismatch(chords.key, resolved.key);
  return (
    <>
      {warning && (
        <p
          role="note"
          className="flex items-start gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-sm"
        >
          <TriangleAlertIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-amber-600" />
          {warning}
        </p>
      )}
      <LyricsViewer
        lyrics={detail.lyrics}
        arrangement={detail.arrangement}
        chords={[chords]}
        capo={capo}
        textSizePx={textSizePx}
      />
    </>
  );
}

function NoChart({
  detail,
  textSizePx,
}: {
  resolved: ResolvedItem;
  detail: SongDetail | undefined;
  textSizePx: number;
}) {
  return (
    <>
      <p className="text-sm text-muted-foreground">No chord chart for this song.</p>
      {hasLyrics(detail) ? (
        <LyricsViewer
          lyrics={detail!.lyrics}
          arrangement={detail!.arrangement}
          textSizePx={textSizePx}
        />
      ) : (
        <p className="text-muted-foreground">Lyrics aren’t available for this song.</p>
      )}
    </>
  );
}
