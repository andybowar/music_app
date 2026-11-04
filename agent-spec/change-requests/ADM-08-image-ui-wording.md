# CR ADM-08 · Let ADM-06's image uploader and viewer name what they hold

**Status:** proposed (not blocking ADM-08).

## Problem

ADM-08 reuses ADM-06's screenshot flow (`features/admin/backlog/storage.ts`, the pending-id
ticket, `uploads.ts`, `UploadItem`, `ImageViewer`). Two of ADM-06's components hard-code the
word "wireframe" in user-facing and accessible text:

- `features/admin/backlog/ui/WireframeUploader.tsx`: the legend "Wireframes", the
  "Choose images" input's label "Choose wireframe images", the list label "Selected
  wireframes", thumbnail alt "Wireframe: {name}", and the 5-image limit message (via
  `checkImageFiles`) says "a request can have at most 5 images".
- `features/admin/backlog/ui/ImageViewer.tsx`: the full-size image's alt is
  "Wireframe: {name}".

ADM-08 doesn't own or touch those files, so on the bug report form it uses its own
`features/bugs/ui/ScreenshotUploader.tsx` (same markup and `UploadItem` stages, worded for
screenshots) and `checkScreenshotFiles`. It reuses `ImageViewer` as-is, so a bug report
screenshot opened full size has the alt text "Wireframe: screen.png".

## Proposed diff

Backward compatible; ADM-06's call sites don't change.

```ts
// WireframeUploader.tsx
export interface WireframeUploaderProps {
  // …
  /** Singular / plural noun for the images, default { one: 'wireframe', many: 'wireframes' }. */
  noun?: { one: string; many: string };
}

// ImageViewer.tsx
export interface ImageViewerProps {
  // …
  /** Prefix for the image's alt text, default 'Wireframe'. */
  altPrefix?: string;
}

// uploads.ts
export function checkImageFiles(files, used, owner = 'a request'): FileCheck;
```

Then ADM-08 (or a follow-up) can delete `ScreenshotUploader.tsx` and `checkScreenshotFiles`,
render `<WireframeUploader noun={{ one: 'screenshot', many: 'screenshots' }} …>` and pass
`altPrefix="Screenshot"` to `ImageViewer`.

## Affects

- ADM-06 (owner of `features/admin/backlog/ui/`): two optional props and one optional argument.
- ADM-08: follow-up to drop its own uploader.
