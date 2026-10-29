---
id: AUTH-05
title: "Permissions helper"
phase: 0
wave: 3
stream: security
size: S
status: review
human_required: false
depends_on: ["F-03"]
blocks: ["ADM-01", "DB-05", "LIB-01", "LIB-02", "LIB-03", "LIB-04", "LIB-05", "LIB-06", "LIB-07", "LIST-01", "LIST-02", "SHR-01"]
owns: ["lib/permissions.ts"]
touches: []
requirements: ["REQ-AUTH-07"]
---

# AUTH-05 · Permissions helper


**Goal.** Pure `can()` / `assertCan()` implementing the matrix.

## Read first
- `agent-spec/AGENTS.md`
- `agent-spec/SPEC.md`
- `agent-spec/contracts/permissions.md`
- `agent-spec/contracts/schema.md`
- Output of `F-03` (merged on main)

## Requirements
- `REQ-AUTH-07` — Roles: `member`, `contributor`, `music_leader`, `admin`. Permissions per `contracts/permissions.md`, enforced in Postgres RLS **and** server code.

## Deliverables
- [x] Implementation + exhaustive table-driven unit tests (every action × role × ownership case)

## Acceptance criteria
- [x] 100% branch coverage on lib/permissions.ts
- [x] Definition of Done in `AGENTS.md` §5 is satisfied

## Boundaries
- **Owns** (create/modify freely): `lib/permissions.ts`
- Anything else: do not edit. Open a change request (`AGENTS.md` §6).
