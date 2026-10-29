# CR LIB-14: Resources section props and `parseYouTubeId` stand-in

**Status:** proposed (no frozen file was edited)

## Problem

1. `contracts/ui.md` gives every form section the props `{ value, onChange, errors }`, but
   `SongFormValue` has no resources slice. Resources are not saved with the form: each upload,
   link save and delete is its own server action (LIB-06 / LIB-07) and takes effect immediately,
   and needs the saved song id and saved `song_keys` ids.
2. `lib/youtube.ts` (`parseYouTubeId`, LIB-07) is not on main yet.

## What LIB-14 did

`ResourcesSection` extends `SongFormSectionProps` with (the same pattern as `BasicInfoSection`'s
extra props):

```ts
songId: UUID | null;                 // null on /songs/new → "Save to add files"
initialResources: Resource[];        // SongDetail.resources; the section keeps its own copy
onResourcesChange?(resources: Resource[]): void;
requestUpload, finalizeUpload, deleteResource, getSignedResourceUrl, addLink, updateLink; // api.md signatures
putFile?: (uploadUrl, file, onProgress) => Promise<void>; // default: XHR PUT with progress
```

It reads `value.musical.keys` for the per-key blocks. A key without an `id` (not saved yet) shows
"Save the song to add files for this key." It never calls `onChange`.

`ResourcesSection.tsx` exports a local `parseYouTubeId` with the api.md signature.

## Proposed follow-ups

- **ui.md:** add a row for `ResourcesSection` with the props above.
- **LIB-07:** when `lib/youtube.ts` lands, replace the local `parseYouTubeId` with an import from
  `@/lib/youtube`. That's a one-line swap, and the tests in `ResourcesSection.test.tsx` cover the
  same cases.
- **LIB-17:** pass the server actions directly, `songId` from the saved song, and
  `initialResources={song.resources}`.

## Affects

LIB-17 (wiring), LIB-07 (the youtube helper swap). No schema or type changes.
