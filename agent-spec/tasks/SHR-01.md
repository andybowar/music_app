---
id: SHR-01
title: "Share tokens server"
phase: 4
wave: 9
stream: backend
size: M
status: todo
human_required: false
depends_on: ["LIST-01", "AUTH-05"]
blocks: ["SHR-02", "SHR-03", "SHR-04"]
owns: ["features/sharing/server.ts"]
touches: []
requirements: ["REQ-SHARE-01", "REQ-SHARE-03"]
---

# SHR-01 · Share tokens server


**Goal.** Read-only links to lists.

## Read first
- `agent-spec/AGENTS.md`
- `agent-spec/SPEC.md`
- `agent-spec/contracts/api.md`
- `agent-spec/contracts/types.md`
- `agent-spec/contracts/permissions.md`
- `agent-spec/contracts/schema.md`
- Output of `LIST-01` (merged on main)
- Output of `AUTH-05` (merged on main)

## Requirements
- `REQ-SHARE-01` — Share a list via tokenized read-only link including modified tags (overrides); optional expiry; revocable.
- `REQ-SHARE-03` — The public share page shows list content and overrides; opening files still requires sign-in.

## Deliverables
- [ ] createShare (32-byte base64url token), revokeShare, listShares, getSharedList (service role; checks expiry/revocation; strips resource url/storagePath)

## Acceptance criteria
- [ ] Expired/revoked token → null
- [ ] Shared ListDetail contains overrides but no file URLs
- [ ] Definition of Done in `AGENTS.md` §5 is satisfied

## Boundaries
- **Owns** (create/modify freely): `features/sharing/server.ts`
- Anything else: do not edit. Open a change request (`AGENTS.md` §6).
