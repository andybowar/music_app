---
id: ADM-07
title: "Show the open TODO.md items on the admin dashboard"
phase: 4
wave: 12
stream: backend
size: S
status: done
human_required: false
depends_on: ["ADM-06"]
blocks: ["SHR-05", "ADM-08"]
owns: ["db/migrations/0007_import_todos.sql", "tests/db/todo-import.int.test.ts"]
touches: ["db/migrations/meta/", "db/schema/backlog.ts", "features/admin/backlog/types.ts"]
requirements: ["REQ-ADM-01"]
---

# ADM-07 · Show the open TODO.md items on the admin dashboard


**Goal.** Every outstanding owner TODO (`agent-spec/TODO.md`) shows in the To-dos section on `/admin`, now and whenever a TODO is added later. Requested by the project owner on 2026-11-03.

## Deliverables
- [x] `0007_import_todos.sql`:
  - [x] Drops `not null` on `admin_todos.created_by`; null means imported.
  - [x] Inserts each open item (#1–4, #6–8, #10) with its fixed id `7d0d0000-0000-4000-8000-<n, 12 digits>`, a short title, notes ending in "(TODO.md #n)", and the date it was added. Uses `on conflict (id) do nothing`.
  - [x] Items already scheduled as tasks (#5, #9) are left out.
- [x] `AdminTodo.createdBy` and the Drizzle schema allow null.
- [x] `tests/db/todo-import.int.test.ts`: parses `TODO.md` and fails if any open item (empty Task column) has no `admin_todos` row.
- [x] `TODO.md` header: the rule for adding later items.

## Acceptance criteria
- [x] After migrating, `/admin` lists the 8 imported items as open to-dos.
- [x] `pnpm typecheck && pnpm lint && pnpm test && pnpm test:int` pass.

## Boundaries
- **Owns** (create/modify freely): `db/migrations/0007_import_todos.sql`, `tests/db/todo-import.int.test.ts`
- **Touches** (small integration edits only; describe each in the PR): `db/migrations/meta/`, `db/schema/backlog.ts`, `features/admin/backlog/types.ts`
- Anything else: do not edit. Open a change request (`AGENTS.md` §6).
