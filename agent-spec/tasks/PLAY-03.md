---
id: PLAY-03
title: "YouTube adapter"
phase: 3
wave: 4
stream: frontend
size: S
status: done
human_required: false
depends_on: ["PLAY-01"]
blocks: ["PLAY-05"]
owns: ["features/player/adapters/youtube.ts"]
touches: []
requirements: []
---

# PLAY-03 · YouTube adapter


**Goal.** PlayerAdapter over YouTube IFrame API.

## Read first
- `agent-spec/AGENTS.md`
- `agent-spec/SPEC.md`
- `agent-spec/contracts/ui.md`
- `agent-spec/contracts/types.md`
- Output of `PLAY-01` (merged on main)

## Deliverables
- [x] Lazy script loader (once), hidden/compact player element, state mapping

## Acceptance criteria
- [x] Tests with mocked YT global
- [x] Definition of Done in `AGENTS.md` §5 is satisfied

## Boundaries
- **Owns** (create/modify freely): `features/player/adapters/youtube.ts`
- Anything else: do not edit. Open a change request (`AGENTS.md` §6).

## Notes

- Factory `createYouTubeAdapter({ container?, loadTimeoutMs?, scriptTimeoutMs? })` and adapter
  semantics (single callback per `onX`, failed `load()` rejects without `onError`, superseded load
  rejects with `AbortError`) are proposed in `change-requests/PLAY-03-adapter-factory-and-mount.md`.
- Default mount is a compact visible 200x200 fixed box, not a hidden one: YouTube's terms forbid
  hiding the player. PLAY-04/05 should pass a `container`.
- No `/dev` gallery page: this task adds no UI component.
