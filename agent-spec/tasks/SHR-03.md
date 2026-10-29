---
id: SHR-03
title: "Share by email"
phase: 4
wave: 10
stream: backend
size: S
status: todo
human_required: false
depends_on: ["SHR-01", "F-05"]
blocks: ["ADM-04", "SHR-04"]
owns: ["lib/email.ts", "emails/ShareList.tsx"]
touches: ["features/sharing/server.ts"]
requirements: ["REQ-SHARE-02"]
---

# SHR-03 · Share by email


**Goal.** Email a list to the ministry team.

## Read first
- `agent-spec/AGENTS.md`
- `agent-spec/SPEC.md`
- `agent-spec/contracts/api.md`
- `agent-spec/contracts/types.md`
- `agent-spec/contracts/permissions.md`
- `agent-spec/contracts/schema.md`
- Output of `SHR-01` (merged on main)
- Output of `F-05` (merged on main)

## Requirements
- `REQ-SHARE-02` — Share a list by email (summary + link).

## Deliverables
- [ ] Resend wrapper (no-op logger when key absent)
- [ ] react-email template: list summary with keys/overrides + link
- [ ] sendShareEmail with limits per contract

## Acceptance criteria
- [ ] Rate limit returns RATE_LIMITED
- [ ] Definition of Done in `AGENTS.md` §5 is satisfied

## Boundaries
- **Owns** (create/modify freely): `lib/email.ts`, `emails/ShareList.tsx`
- **May touch** (minimal integration edits only, described in PR): `features/sharing/server.ts`
- Anything else: do not edit. Open a change request (`AGENTS.md` §6).
