---
id: SHR-05
title: "Store share tokens hashed"
phase: 4
wave: 12
stream: backend
size: M
status: todo
human_required: false
depends_on: ["SHR-01", "SHR-02", "SHR-03", "DB-08", "ADM-06"]
blocks: ["SHR-04"]
owns: ["db/migrations/0007_share_token_hash.sql"]
touches: ["db/migrations/meta/", "db/schema/shares.ts", "types/domain.ts", "types/validation.ts", "fixtures/", "db/seed/", "features/sharing/server.ts", "features/sharing/server.test.ts", "features/sharing/server.int.test.ts"]
requirements: ["REQ-SHARE-01", "REQ-SHARE-03"]
---

# SHR-05 · Store share tokens hashed


**Goal.** A copy of the database (backup, leaked read credential, logs) can't be used to open shared lists: only a sha256 of each share token is stored.

## Read first
- `agent-spec/AGENTS.md`
- `agent-spec/change-requests/SHR-01-hash-share-tokens.md` (approved 2026-11-03)
- `agent-spec/contracts/schema.md` (`shares`), `contracts/types.md` (`Share`), `contracts/api.md` (sharing rows), all updated for this CR
- `features/sharing/server.ts` (SHR-01) and how SHR-02 (`app/share/[token]/`) and SHR-03 (`sendShareEmail`) use it
- `agent-spec/change-requests/DB-01-migrate-scripts.md` (create the file with `pnpm db:generate --custom --name share_token_hash`)

## Deliverables
- [ ] `0007_share_token_hash.sql`: add `token_hash bytea unique` and `token_prefix text`, backfill both from `token`, set them `not null`, then drop `token`. Must be safe while the old build is still live during the deploy: if that needs two steps (add + backfill now, drop `token` in a later migration), do that and note it in the PR
- [ ] Drizzle schema `db/schema/shares.ts` and the `meta/` journal and snapshot updated (touches)
- [ ] `types/domain.ts` `Share`: `token` replaced by `tokenPrefix` (first 6 chars); `types/validation.ts`, `fixtures/` and `db/seed/` follow if they mention share tokens (touches)
- [ ] `features/sharing/server.ts`: `createShare` stores the hash and prefix and returns the full link only in `url`; `listShares` returns no token or url; `getSharedList(token)` looks up by `sha256(token)` with the same "malformed / unknown / revoked / expired all return null" behavior (touch); unit and integration tests updated (touches)

## Acceptance criteria
- [ ] No column or API response after `createShare` contains a usable token
- [ ] Links created before the migration still open (backfilled hashes)
- [ ] `/share/[token]` and share-by-email keep working (their tests pass unchanged, or with fixture-only edits described in the PR)
- [ ] Definition of Done in `AGENTS.md` §5 is satisfied

## Boundaries
- **Owns** (create/modify freely): `db/migrations/0007_share_token_hash.sql`
- **Touches** (small integration edits only; describe each in the PR): `db/migrations/meta/`, `db/schema/shares.ts`, `types/domain.ts`, `types/validation.ts`, `fixtures/`, `db/seed/`, `features/sharing/server.ts`, `features/sharing/server.test.ts`, `features/sharing/server.int.test.ts`
- Anything else: do not edit. Open a change request (`AGENTS.md` §6).
