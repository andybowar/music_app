'use client';

import { Document, Page, pdfjs } from 'react-pdf';

// Must live in the same module that renders <Document> (react-pdf README). `pdfjs-dist` is a direct
// dependency pinned to react-pdf's version so this resolves under pnpm without hoisting.
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

export type PdfDocumentProps = {
  url: string;
  title: string;
  pageNumber: number;
  /** Rendered page width in CSS pixels. */
  width: number;
  onLoadSuccess(numPages: number): void;
  onLoadError(error: Error): void;
};

/**
 * The react-pdf part of `PdfViewer`. Loaded with `next/dynamic` and `ssr: false` because pdf.js
 * needs browser APIs at import time. Loading and error UI belong to `PdfViewer`.
 * Text and annotation layers are off: sheet music needs neither, and it saves their CSS.
 */
export function PdfDocument({
  url,
  title,
  pageNumber,
  width,
  onLoadSuccess,
  onLoadError,
}: PdfDocumentProps) {
  return (
    <Document
      file={url}
      suspense={false}
      loading={null}
      error={null}
      noData={null}
      onLoadSuccess={(pdf) => onLoadSuccess(pdf.numPages)}
      onLoadError={onLoadError}
      onSourceError={onLoadError}
    >
      <Page
        pageNumber={pageNumber}
        width={width}
        renderTextLayer={false}
        renderAnnotationLayer={false}
        loading={null}
        className="shadow-sm"
        canvasBackground="white"
        aria-label={`${title}, page ${pageNumber}`}
      />
    </Document>
  );
}
