# CR ADM-06 · RLS test files need small edits when `admin:backlog` and its tables land

**Status:** approved by project owner 2026-11-03. The edits merged with ADM-06 (#134).

## Problem

ADM-06 adds the `admin:backlog` action to `lib/permissions.ts` and three admin-only tables in
`0006_admin_backlog.sql`. Two DB-03 / DB-05 test files, which ADM-06 doesn't own or touch,
are written to fail whenever that happens:

- `tests/db/rls.test.ts` (DB-05) declares `ROLE_PROBES: Record<RoleAction, Probe[]>`, so a new
  `Action` is a **typecheck** error until it gets probes, and its coverage test counts
  exactly 21 actions.
- `tests/db/0003_rls.int.test.ts` (DB-03) asserts the set of `public` tables equals its
  `PUBLIC_TABLES` list, so any new table fails the coverage test.

Both guards are working as intended; the task file just didn't list them under `touches`.

## Proposed diff

Add `tests/db/rls.test.ts` and `tests/db/0003_rls.int.test.ts` to ADM-06's `touches`, with
these edits (already in the PR):

- `tests/db/rls.test.ts`: an `'admin:backlog'` entry in `ROLE_PROBES` (insert a to-do, insert
  a request, upload an object to `admin-attachments`, each as the subject), and the coverage
  count 21 → 22. The parity suite then checks `can(user, 'admin:backlog')` against RLS for every
  role and access status.
- `tests/db/0003_rls.int.test.ts`: a `BACKLOG_TABLES` constant added to the expected table set in
  the "RLS is enabled on every public table" test only. The per-table visibility tests keep
  `PUBLIC_TABLES` (the backlog tables start empty, and `tests/db/backlog.int.test.ts` covers
  them for every role, a disabled admin, a pending admin and anon).

## Affects

- **ADM-06**: two extra touched files (test-only).
- **DB-03 / DB-05** (done): no behaviour change; their suites still pass.
- Future tasks adding an `Action` or a table will hit the same guards; worth a line in
  AGENTS.md or the task template.
