# CR OWNER · Self-registration with admin approval

**Status:** approved by the project owner, 2026-10-29. SPEC, contracts and task files updated in the same change.

## Decision

Replace "no public signup" with request-and-approve:

- **Anyone can request an account:** sign up with email + password at `/signup`, or sign in with Google, Microsoft or SAML for the first time.
- **New accounts start `pending`** and can see no data until an admin approves them. This applies to SSO users too, including ones whose IdP group maps to a branch: the mapping only pre-fills the branch the admin approves with.
- **Invites stay approved:** accounts an admin invites are approved when created.
- **Admins approve or reject** each request from Admin › Users, choosing role and branch. Rejected users can be approved later.
- **Status page:** pending and rejected users who sign in see only `/account-status`.
- **Emails:** admins are emailed about new requests, and users are emailed when approved. No email on rejection.

## Spec and contract changes

| File | Change |
|---|---|
| `SPEC.md` | REQ-AUTH-03 rewritten; REQ-AUTH-04 notes the mapping is a suggestion; new REQ-AUTH-08; §6 records the SSO decision and an email-confirmation default |
| `contracts/schema.md` | `access_status` enum; `users.access_status` (default `pending`), `access_decided_by`, `access_decided_at` |
| `contracts/types.md` | `ACCESS_STATUSES`, `AccessStatus`, `AppUser.accessStatus` |
| `contracts/api.md` | `requireUser` approved-only (FORBIDDEN for pending/rejected); `signUpWithPassword`; `provisionUser` creates pending; `approveUser`, `rejectUser`, `listUsers({ accessStatus? })`; invites are approved |
| `contracts/permissions.md` | Pending/rejected users can do nothing except read their own row; RLS helpers require `access_status = 'approved'` |
| `contracts/ui.md` | `/signup` and `/account-status` routes |

## Task changes

| Task | Change |
|---|---|
| **DB-07** (new) | Migration, RLS helper update, own-row read for pending users, types, fixtures, seed |
| **AUTH-07** (new) | `/signup`, `/account-status`, `signUpWithPassword`; `provisionUser` creates pending users instead of refusing unmapped ones |
| **ADM-04** (new) | Access-requested and approved emails (needs `lib/email.ts` from SHR-03) |
| AUTH-04 | Depends on DB-07; `requireUser` approved-only; middleware sends pending/rejected users to `/account-status` |
| ADM-01 | Depends on DB-07; access-requests view, `approveUser` / `rejectUser`; size M → L |
| DB-05 | Depends on DB-07; parity tests cover pending and rejected users |
| AUTH-03 | Depends on AUTH-07; SAML first login is pending too |
| AUTH-06 | Depends on AUTH-07; linking never bypasses approval |

AUTH-02 (done) refuses brand-new SSO users whose groups map to no branch. AUTH-07 changes that through its touch on `features/auth/provision.ts`.

Waves for AUTH-04 and everything downstream of it moved back by one; see `INDEX.md` (regenerated with `scripts/gen_index.py`).
