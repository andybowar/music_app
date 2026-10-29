---
id: PLAY-02
title: "MP3 adapter"
phase: 3
wave: 4
stream: frontend
size: S
status: done
human_required: false
depends_on: ["PLAY-01"]
blocks: ["PLAY-05"]
owns: ["features/player/adapters/mp3.ts"]
touches: []
requirements: []
---

# PLAY-02 · MP3 adapter


**Goal.** PlayerAdapter over HTML5 Audio.

## Read first
- `agent-spec/AGENTS.md`
- `agent-spec/SPEC.md`
- `agent-spec/contracts/ui.md`
- `agent-spec/contracts/types.md`
- Output of `PLAY-01` (merged on main)

## Deliverables
- [x] Adapter + tests with a fake HTMLAudioElement

## Acceptance criteria
- [x] Emits ended/error correctly
- [x] Definition of Done in `AGENTS.md` §5 is satisfied

## Boundaries
- **Owns** (create/modify freely): `features/player/adapters/mp3.ts`
- Anything else: do not edit. Open a change request (`AGENTS.md` §6).

## Notes
- `features/player/adapters/mp3.test.ts` (sibling unit test, AGENTS.md §5) is added alongside the owned file.
- Load failures reject `load()` only (no `onError`), so the driver dispatches TRACK_ERROR once; a superseded/stopped/destroyed load rejects with `Mp3LoadAbortedError` (`isMp3LoadAborted`), which the driver should ignore. See the header comment in `mp3.ts` for the full behaviour contract PLAY-05 can rely on.
- DoD items for UI, server actions and `pnpm test:int` do not apply (pure client module, no server/DB code).
