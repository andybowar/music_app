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
blocks: ["ADM-04", "SHR-04", "SHR-05"]
owns: ["lib/email.ts", "emails/ShareList.tsx"]
touches: ["features/sharing/server.ts", "lib/env.ts", "lib/env.test.ts", ".env.example", ".github/workflows/ci.yml"]
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
- [ ] SMTP wrapper in `lib/email.ts` (Nodemailer + `@react-email/render`, HTML and text parts); logs instead of sending when `SMTP_USER`/`SMTP_PASSWORD` are unset. See `change-requests/OWNER-gmail-smtp-email.md`
- [ ] Replace `RESEND_API_KEY` with `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` in `lib/env.ts` (+ test), `.env.example` and CI (touches)
- [ ] react-email template: list summary with keys/overrides + link
- [ ] sendShareEmail with limits per contract; at most 50 recipients per share, sent in BCC or one message each (never all addresses in To); Gmail quota errors map to `RATE_LIMITED`

## Acceptance criteria
- [ ] Rate limit returns RATE_LIMITED
- [ ] Definition of Done in `AGENTS.md` §5 is satisfied

## Boundaries
- **Owns** (create/modify freely): `lib/email.ts`, `emails/ShareList.tsx`
- **May touch** (minimal integration edits only, described in PR): `features/sharing/server.ts`, `lib/env.ts`, `lib/env.test.ts`, `.env.example`, `.github/workflows/ci.yml`
- Anything else: do not edit. Open a change request (`AGENTS.md` §6).
