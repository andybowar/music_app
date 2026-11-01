# CR AUTH-04 · Export `roleAtLeast` from `lib/permissions.ts`

**Status:** approved by project owner 2026-11-01. Contract added to `contracts/api.md`; implementing it in `lib/permissions.ts` / `lib/auth.ts` is an AUTH-04 follow-up (AUTH-04 now touches `lib/permissions.ts`).

## Problem

The role order `member < contributor < music_leader < admin` is declared twice:

- `lib/permissions.ts` (AUTH-05): private `RANK`, used by `can()` for minimum-role actions.
- `lib/auth.ts` (AUTH-04): private `ROLE_RANK`, used by `requireRole` / `requirePageRole`.

If the `role` enum gains a value or the order changes, one copy can drift from the other and the
page guard and the per-action matrix will disagree. `lib/auth.ts` carries a
`// TODO(CR): share rank with lib/permissions.ts` comment pointing here.

## Proposed contract diff

`contracts/api.md` "Core libs", `lib/permissions.ts` row — add:

```ts
/** True when `role` is at or above `min` (member < contributor < music_leader < admin). */
export function roleAtLeast(role: Role, min: Role): boolean;
```

`lib/permissions.ts` implements it with its existing `RANK` (and uses it inside `can()`).
`lib/auth.ts` then drops `ROLE_RANK` and calls `roleAtLeast(user.role, role)`.
`lib/permissions.ts` must stay free of server-only imports so both modules can share it.

## Affects

- **AUTH-05** (owns `lib/permissions.ts`): add and test the export; no behaviour change.
- **AUTH-04** (owns `lib/auth.ts`): replace `ROLE_RANK` with the import, remove the TODO.
- No other tasks; `requireRole` / `assertCan` signatures are unchanged.
