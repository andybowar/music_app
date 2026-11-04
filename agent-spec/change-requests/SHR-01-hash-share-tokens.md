# CR SHR-01 · Store share tokens hashed

**Status:** approved by project owner 2026-11-03. Contracts (`schema.md`, `types.md`, `api.md`) updated; implemented by new task SHR-05 (`db/migrations/0006_share_token_hash.sql`), which SHR-04 now depends on. The display prefix (`token_prefix`) was chosen over dropping the token outright. 2026-11-03: renumbered to `0009_share_token_hash.sql`; SHR-05 depends on ADM-06, ADM-07 and ADM-08 (`0006`–`0008`), which ship first.
**Raised by:** SHR-01
**Affects:** DB (new migration), contracts/schema.md, contracts/types.md (`Share`), contracts/api.md (`createShare`, `listShares`), SHR-01, SHR-04 (ShareDialog)

## Problem

`shares.token` stores the bearer token itself (contracts/schema.md: "32 random bytes,
base64url"), and `Share.token` returns it from `listShares`. Anyone who can read the table
(a database backup, a leaked read-only credential, a service-role log) can replay every live
link. RLS limits *app* reads to users who can write the list, but that does not cover
access outside the app.

SHR-01 stores the token as issued, because the contract and `Share.token` require it and
SHR-04's dialog may need to show an existing link again.

## Proposal

1. Migration: add `token_hash bytea unique` (sha256 of the token), backfill it from `token`,
   then drop `token` (or keep only a short display prefix, `token_prefix text`, for the UI).
2. contracts/types.md: `Share` drops `token`; add `tokenPrefix: string` (first 6 chars).
3. contracts/api.md: `createShare` returns `Share & { url }`. That is the only time the full
   link is available. `listShares` returns `Share[]` with no `url`. To get a new link, create
   another share.
4. `getSharedList(token)` looks the token up by `sha256(token)`.

## Trade-off

After creation an existing link can't be copied again. The dialog shows "Link …abc123
(created …)" with Revoke, plus "Create new link". This is the same pattern as API keys.

## Interim

SHR-01 keeps the 256-bit CSPRNG token, exact-match lookup on the unique index, expiry and
revocation checked in SQL against `now()`, and RLS on `shares` (writers of the list only).
