# CR UI-08 · Let UI-08 own its gallery page and the sample PDF

**Status:** proposed.

## Problem

UI-08 owns only `components/media/`, but its deliverables need two files outside it:

- The acceptance criterion says the viewer "Renders a multi-page sample PDF from `/public/dev/sample.pdf`".
- AGENTS.md §5 asks for a `/dev/<name>` gallery page for new components, which lives under `app/dev/`.

What UI-08 did instead:

- The whole gallery body is `components/media/MediaGallery.tsx`. It covers every PdfViewer and InlineAudio state: sample.pdf, an in-memory generated 4-page PDF, a broken URL (error), no URL (empty), a generated WAV tone, two players (starting one pauses the other), broken audio and no audio. The placeholder media are generated (`components/media/sampleMedia.ts`), so there's no real sheet music or audio.
- `buildSamplePdf()` in `components/media/sampleMedia.ts` produces the sample PDF: 3 pages, plain ASCII, about 1.5 KB. Unit tests check its xref offsets and stream lengths.
- To verify, I added both files below temporarily and didn't commit them. Chromium at 360px and 1280px, under both `next dev --turbopack` and `next build && next start`, showed: `/dev/sample.pdf` renders "Page 1 of 3"; → goes to page 2; zoom works; Escape closes the viewer and returns focus to the opener; the broken URL shows the error state; the generated PDF shows "Page 1 of 4"; audio plays and seeks; there's no horizontal scroll at 360px.

## Proposed change

`agent-spec/tasks/UI-08.md` frontmatter (and `tasks.json`):

```diff
-owns: ["components/media/"]
+owns: ["components/media/", "app/dev/media/", "public/dev/sample.pdf"]
```

Then add the following, in a UI-08 follow-up or directly from this CR.

`app/dev/media/page.tsx`:

```tsx
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { MediaGallery } from '@/components/media/MediaGallery';
import { isDevGalleryEnabled } from '@/lib/devGallery';

export const metadata: Metadata = { title: 'Dev · media' };

export default function MediaDevPage() {
  if (!isDevGalleryEnabled()) notFound();
  return <MediaGallery />;
}
```

`public/dev/sample.pdf`, generated from the repo root (Node ≥ 22.6 for `--experimental-strip-types`):

```bash
mkdir -p public/dev
node --experimental-strip-types -e "import('./components/media/sampleMedia.ts').then(m => process.stdout.write(m.buildSamplePdf()))" > public/dev/sample.pdf
```

Note: `public/dev/sample.pdf` is served in production too. It's a harmless placeholder. If that's unwanted, the gallery's "Open generated PDF" case covers the same ground without a static file.

## Affects

UI-08 only. No contract change.
