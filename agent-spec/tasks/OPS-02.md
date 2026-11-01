---
id: OPS-02
title: "Sentry + structured logging"
phase: 5
wave: 5
stream: ops
size: S
status: done
human_required: false
depends_on: ["F-01", "DB-06"]
blocks: []
owns: ["sentry.*.config.ts", "instrumentation.ts", "instrumentation-client.ts", "lib/log.ts", "app/global-error.tsx", "app/api/debug/sentry/"]
touches: ["lib/action.ts", "next.config.ts", ".env.example"]
requirements: ["REQ-NF-04"]
---

# OPS-02 · Sentry + structured logging


**Goal.** See production errors.

## Read first
- `agent-spec/AGENTS.md`
- `agent-spec/SPEC.md`
- Output of `F-01` (merged on main)
- Output of `DB-06` (merged on main)

## Requirements
- `REQ-NF-04` — Errors tracked (Sentry); daily DB backups; storage usage alerts.

## Deliverables
- [x] Sentry for server/client/edge; withAction INTERNAL errors captured; PII scrubbing (no lyrics/emails in events)

## Acceptance criteria
- [ ] Test error appears in Sentry staging
- [x] Definition of Done in `AGENTS.md` §5 is satisfied

## Boundaries
- **Owns** (create/modify freely): `sentry.*.config.ts`, `instrumentation.ts`, `lib/log.ts`
- **May touch** (minimal integration edits only, described in PR): `lib/action.ts`, `next.config.ts`
- Anything else: do not edit. Open a change request (`AGENTS.md` §6).

## Notes

- "Test error appears in Sentry staging" is left unchecked: it needs a real staging DSN. See the
  PR and `agent-spec/change-requests/OPS-02-instrumentation-client.md` for how the owner verifies it.
