'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { resources, songs } from '@/fixtures';
import { InlineAudio } from './InlineAudio';
import { PdfViewer } from './PdfViewer';
import { samplePdfObjectUrl, sampleToneObjectUrl } from './sampleMedia';

/** Multi-page placeholder served from `public/dev/sample.pdf`. */
export const SAMPLE_PDF_URL = '/dev/sample.pdf';

const song = songs[0]!;
const pdfResource = resources.find((r) => r.format === 'pdf');
const audioResource = resources.find((r) => r.format === 'mp3');
const pdfTitle = `${song.title} · ${pdfResource?.label ?? 'Full score'}`;
const audioTitle = `${song.title} · ${audioResource?.label ?? 'MP3'}`;

type Open = { url: string; title: string } | null;

/**
 * Body of the `/dev/media` gallery: every state of `PdfViewer` and `InlineAudio`, using fixture
 * titles and generated placeholder files (no real sheet music or recordings).
 */
export function MediaGallery() {
  const [open, setOpen] = useState<Open>(null);
  const [generatedPdf, setGeneratedPdf] = useState<string | null>(null);
  const [tone, setTone] = useState<string | null>(null);

  // Object URLs only exist in the browser.
  useEffect(() => {
    const pdf = samplePdfObjectUrl(4);
    const wav = sampleToneObjectUrl(6);
    setGeneratedPdf(pdf);
    setTone(wav);
    return () => {
      URL.revokeObjectURL(pdf);
      URL.revokeObjectURL(wav);
    };
  }, []);

  const pdfCases: Array<{ label: string; url: string | null }> = [
    { label: 'Open sample.pdf', url: SAMPLE_PDF_URL },
    { label: 'Open generated PDF', url: generatedPdf },
    { label: 'Open broken PDF (error)', url: '/dev/does-not-exist.pdf' },
    { label: 'Open with no URL (empty)', url: '' },
  ];

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 p-4">
      <h1 className="text-xl font-semibold">Media</h1>

      <section className="flex flex-col gap-3" aria-labelledby="pdf-heading">
        <h2 id="pdf-heading" className="text-lg font-medium">
          PdfViewer
        </h2>
        <p className="text-sm text-muted-foreground">
          Arrow keys or PageUp/PageDown change page; plus, minus and 0 zoom; pinch or ctrl+scroll to
          zoom. Full screen below 640px.
        </p>
        <div className="flex flex-wrap gap-2">
          {pdfCases.map((c) => (
            <Button
              key={c.label}
              variant="outline"
              disabled={c.url === null}
              onClick={() => c.url !== null && setOpen({ url: c.url, title: pdfTitle })}
            >
              {c.label}
            </Button>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="audio-heading">
        <h2 id="audio-heading" className="text-lg font-medium">
          InlineAudio
        </h2>
        <h3 className="text-sm font-medium">Generated tone</h3>
        {tone ? <InlineAudio url={tone} title={audioTitle} /> : null}
        <h3 className="text-sm font-medium">Second player (starting one pauses the other)</h3>
        {tone ? <InlineAudio url={tone} title={`${audioTitle} (copy)`} /> : null}
        <h3 className="text-sm font-medium">Broken URL (error)</h3>
        <InlineAudio url="/dev/does-not-exist.mp3" title={audioTitle} />
        <h3 className="text-sm font-medium">No URL (empty)</h3>
        <InlineAudio url="" title={audioTitle} />
      </section>

      {open && <PdfViewer url={open.url} title={open.title} onClose={() => setOpen(null)} />}
    </main>
  );
}
