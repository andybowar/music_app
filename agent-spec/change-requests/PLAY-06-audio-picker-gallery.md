# CR PLAY-06 · Gallery page for AudioPicker

**Status:** proposed.

## Problem

AGENTS.md §5 asks every new component to have a `/dev/<name>` page with fixtures, but PLAY-06 owns only `features/player/ui/AudioPicker.tsx`. It can't add `app/dev/audio-picker/` without editing a path it doesn't own.

Until then, `features/player/ui/AudioPicker.test.tsx` covers the states a gallery would show: a song with MP3 + YouTube audio, a current selection, choosing and clearing, and a song with no audio (disabled with a hint).

## Proposed change

`agent-spec/tasks/PLAY-06.md` frontmatter (and `tasks.json`):

```diff
-owns: ["features/player/ui/AudioPicker.tsx"]
+owns: ["features/player/ui/AudioPicker.tsx", "features/player/ui/AudioPicker.test.tsx", "app/dev/audio-picker/"]
```

Then add, in a PLAY-06 follow-up:

- `app/dev/audio-picker/page.tsx`: the same shape as `app/dev/atoms/page.tsx` (`if (!isDevGalleryEnabled()) notFound();`).
- `app/dev/audio-picker/AudioPickerGallery.tsx` (client): three controlled pickers in a 360px-wide column, fed by `fixtures` songs:
  1. Song `…0001` (MP3 + YouTube audio), starting with no selection.
  2. The same song, starting on "YouTube: Hillsong 7/5/22".
  3. A song with no `audio`/`video_link` resources, showing the disabled state and hint.

## Contract note (no diff needed)

`contracts/ui.md` gives `onChange(id): void`. The component types it as `onChange(id: UUID | null): void`, where `null` means the recording was cleared. That fits `ListItem.resourceId: UUID | null`. It also adds two optional props, `label?` (accessible name, default "Recording") and `className?`. Both are additive and don't change the contract.

## Affects

PLAY-06 only. PLAY-05 (PlaylistView) consumes the component and isn't affected.
