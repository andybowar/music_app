'use client';

import { useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';

// Same worker setup as components/media/PdfDocument.tsx: it must sit in the module that renders
// <Document>.
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

export interface PdfPagesProps {
  url: string;
  title: string;
  /** Rendered page width in CSS pixels. */
  width: number;
  onLoadSuccess(numPages: number): void;
  onLoadError(error: Error): void;
}

/**
 * Every page of a PDF, one under another, for the set player's scrolling chart (LIST-11).
 * Loaded with `next/dynamic` and `ssr: false` (pdf.js needs browser APIs at import time).
 */
export function PdfPages({ url, title, width, onLoadSuccess, onLoadError }: PdfPagesProps) {
  const [numPages, setNumPages] = useState(0);
  return (
    <Document
      file={url}
      suspense={false}
      loading={null}
      error={null}
      noData={null}
      onLoadSuccess={(pdf) => {
        setNumPages(pdf.numPages);
        onLoadSuccess(pdf.numPages);
      }}
      onLoadError={onLoadError}
      onSourceError={onLoadError}
      className="flex flex-col items-center gap-3"
    >
      {Array.from({ length: numPages }, (_, i) => (
        // react-pdf drops aria props on <Page>, so the label sits on a wrapper.
        <div key={i + 1} role="img" aria-label={`${title}, page ${i + 1} of ${numPages}`}>
          <Page
            pageNumber={i + 1}
            width={width}
            renderTextLayer={false}
            renderAnnotationLayer={false}
            loading={null}
            className="shadow-sm"
            canvasBackground="white"
          />
        </div>
      ))}
    </Document>
  );
}
