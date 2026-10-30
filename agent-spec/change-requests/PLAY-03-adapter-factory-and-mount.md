# CR PLAY-03 · YouTube adapter factory, mount point and adapter semantics

**Status:** approved by project owner 2026-10-30. `contracts/api.md` updated. PLAY-02 must align its callback and rejection semantics.

## Problem

`contracts/api.md` defines the `PlayerAdapter` interface but not:

1. how an adapter is constructed, or where the YouTube iframe mounts (the IFrame API needs a DOM
   element, and YouTube's terms forbid hiding the player, so a truly hidden element is not an option);
2. whether `onEnded(cb)` / `onError(cb)` add listeners or replace the previous callback;
3. whether a failed `load()` also fires `onError` (double-dispatching `TRACK_ERROR` would skip two
   tracks), and what a `load()` superseded by a newer `load()` does.

PLAY-02 (MP3) and PLAY-05 (wiring) need the same answers so both adapters behave alike.

## Proposed contract diff (`contracts/api.md`)

```diff
 export interface PlayerAdapter { load(t: Track): Promise<void>; play(): void; pause(): void; stop(): void; onEnded(cb: () => void): void; onError(cb: () => void): void; destroy(): void }
+// Adapter semantics (all adapters):
+// - onEnded/onError set a single callback; a later call replaces the earlier one.
+// - load() rejects on failure and does NOT also call onError; onError is for failures after load resolved.
+// - A load() superseded by a newer load() or by destroy() rejects with an Error named 'AbortError'
+//   (callers ignore it; it is not a TRACK_ERROR).
+// - After destroy(), load() rejects and the other methods are no-ops.
+
+// features/player/adapters/youtube.ts  (PLAY-03)
+export function createYouTubeAdapter(opts?: {
+  container?: HTMLElement;   // where the iframe mounts; default: compact 200×200 fixed box on document.body
+  loadTimeoutMs?: number;    // default 20 000
+  scriptTimeoutMs?: number;  // default 15 000
+}): PlayerAdapter;
```

PLAY-03 ships exactly this. PLAY-04/05 should pass a `container` inside the player bar.

## Affects

PLAY-02 (align callback and rejection semantics), PLAY-04 (provides the container), PLAY-05 (wiring).
