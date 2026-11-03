---
id: ADM-06
title: "Admin backlog: to-dos and enhancement requests with wireframes"
phase: 4
wave: 11
stream: fullstack
size: L
status: in_progress
human_required: false
depends_on: ["ADM-05", "DB-08"]
blocks: ["SHR-05"]
owns: ["db/migrations/0006_admin_backlog.sql", "features/admin/backlog/", "app/(app)/admin/requests/", "app/dev/admin-backlog/", "tests/db/backlog.int.test.ts", "tests/e2e/admin-backlog.spec.ts"]
touches: ["db/migrations/meta/", "db/schema/backlog.ts", "db/schema/index.ts", "lib/permissions.ts", "lib/permissions.test.ts", "app/(app)/admin/page.tsx", "app/(app)/admin/page.test.tsx", "features/admin/adminAreas.ts", "features/admin/adminAreas.test.ts"]
requirements: ["REQ-ADM-01", "REQ-ADM-02"]
---

# ADM-06 · Admin backlog: to-dos and enhancement requests with wireframes


**Goal.** Requested by the project owner on 2026-11-03. The admin dashboard (`/admin`) gets two sections:
- **To-dos:** a shared checklist admins add to, tick off and delete.
- **Enhancement and change requests:** admins submit requests with a description and wireframe images, list them, and track each one's status.

Only admins see or use either section. The owner decided:
- the to-dos are stored in the app, not read from `TODO.md`
- requests are saved in the app, with no GitHub or email step
- only admins can submit requests

## Read first
- `agent-spec/AGENTS.md`
- `agent-spec/SPEC.md` §2.9 (REQ-ADM-01/02)
- `agent-spec/contracts/schema.md` (`admin_todos`, `feature_requests`, `feature_request_images`, the enums, and the `admin-attachments` bucket under Storage)
- `agent-spec/contracts/permissions.md` (`admin:backlog`)
- `agent-spec/contracts/api.md` (`features/admin/backlog/server.ts` rows)
- `agent-spec/contracts/ui.md` (`/admin` and `/admin/requests/*` routes, `BacklogTodos`, `RequestList`, `RequestForm`, `RequestDetail`)
- Prior art:
  - `features/resources/server/` and `lib/storage.ts`: the signed-upload flow
  - `app/(app)/admin/page.tsx` and `features/admin/adminAreas.ts`: ADM-05's dashboard
  - `db/migrations/0003_rls.sql`: RLS and storage policies for `resources`

## Migration order
`0006` is this task's. SHR-05 (hashed share tokens) was renumbered to `0007` and depends on ADM-06. Drizzle skips a migration whose timestamp is older than the last one applied, so don't merge anything that would apply a later migration before this one.

## Deliverables
- [ ] **`0006_admin_backlog.sql`** plus the Drizzle schema (`db/schema/backlog.ts`, exported from `db/schema/index.ts`) and the regenerated `meta/`:
  - [ ] Enums `feature_request_kind` (`enhancement`, `change`) and `feature_request_status` (`new`, `planned`, `in_progress`, `done`, `declined`).
  - [ ] The three tables as in `schema.md`, including the `updated_at` trigger where the other tables have one.
  - [ ] RLS on: each table allows select/insert/update/delete only when `app_role_at_least('admin')`.
  - [ ] Private bucket `admin-attachments` (insert … on conflict do nothing, as `0003` does for `resources`), with a file-size limit of 10 MiB and the MIME types `image/png`, `image/jpeg`, `image/webp`, `image/gif`. Storage policies allow select/insert/delete for admins only.
  - [ ] Safe to apply while the previous build is live: it only adds things.
- [ ] **`admin:backlog`** action in `lib/permissions.ts` (admin only), with tests, matching the RLS.
- [ ] **Server** (`features/admin/backlog/server.ts`, `'use server'`). Every action follows `requireUser` → `assertCan('admin:backlog')` → Zod → work → `ActionResult`; feature-local types and schemas go in `features/admin/backlog/types.ts`:
  - [ ] `listTodos()`, `addTodo({ title, notes? })`, `updateTodo(id, { title?, notes?, done? })` (sets or clears `done_at`/`done_by`), `deleteTodo(id)`.
  - [ ] `listRequests({ status? })`, `getRequest(id)` (with images and short-lived signed URLs), `createRequest({ kind, title, description })`, `updateRequest(id, { status?, title?, description?, kind? })`, `deleteRequest(id)` (removes its stored images too).
  - [ ] Images: `createRequestImageUpload(requestId, { fileName, mimeType, sizeBytes })` checks type, size and the 5-per-request limit, then returns a signed upload URL and a pending image id. The client PUTs the file. `finalizeRequestImage(imageId)` checks that the object exists and its size matches, then saves the row. `deleteRequestImage(imageId)` removes both the object and the row.
  - [ ] Path: `requests/{request_id}/{image_id}.{ext}`.
  - [ ] Limits: title 1–200 characters, description ≤ 10,000, to-do notes ≤ 2,000.
- [ ] **UI** (`features/admin/backlog/ui/`):
  - [ ] `BacklogTodos`:
    - [ ] Add a to-do with an input plus an Add button (Enter submits).
    - [ ] Each open item has a checkbox and a delete control (with undo through a toast).
    - [ ] Completed items sit under a collapsed "Done (n)" section.
    - [ ] Changes are optimistic and rolled back on error.
    - [ ] Empty state: "No to-dos yet."
  - [ ] `RequestList`: requests newest first, filtered by status (All / New / Planned / In progress / Done / Declined). Each row shows the kind, title, status, submitter, date, an image count, and a link to the request. Empty state: "No requests yet."
  - [ ] `RequestForm` (new and edit):
    - [ ] Kind as a radio group (Enhancement / Change), title, and description.
    - [ ] A **wireframe uploader**: pick files, drag and drop, or paste an image from the clipboard. It shows thumbnail previews with a remove button (and alt text from the file name). It accepts up to 5 PNG, JPEG, WebP or GIF images, each ≤ 10 MiB, and rejects others with a clear message before uploading.
    - [ ] On submit: create the request, upload each image with per-image progress, then finalize. If an image fails, the request is still saved; the form shows which image failed and offers Retry or Remove.
    - [ ] Validation errors appear inline. Submit is disabled while saving.
  - [ ] `RequestDetail`:
    - [ ] Shows the title, kind, status selector, description (as plain text with line breaks kept), submitter and dates.
    - [ ] Shows a thumbnail grid of the images; each opens full size in a dialog (keyboard: arrows move between images, Escape closes).
    - [ ] Edit and Delete buttons; Delete asks for confirmation first.
- [ ] **Routes:**
  - [ ] **Touch** `app/(app)/admin/page.tsx`: below ADM-05's area cards, render a "To-dos" section (`BacklogTodos`) and an "Enhancement requests" section (the 5 newest from `RequestList`, plus a "New request" button linking to `/admin/requests/new` and a "View all" link) for users with `admin:backlog`. Load failures show an error state in that section only.
  - [ ] **Touch** `features/admin/adminAreas.ts`: if a card is the simplest way to link `/admin/requests`, add a "Requests" area (with the count of `new` requests); otherwise leave it unchanged.
  - [ ] `app/(app)/admin/requests/page.tsx`: all requests. `requests/new/page.tsx`: the form. `requests/[id]/page.tsx`: the detail. `requests/[id]/edit/page.tsx`: the form. Each route has `loading.tsx` and `error.tsx`. Anyone without `admin:backlog` gets a 403 (like ADM-05), and an unknown id gives a 404.
- [ ] **`/dev/admin-backlog` gallery** with fixtures and stubbed actions:
  - [ ] the to-do list in empty, filled and error states
  - [ ] the request list in empty and filled states
  - [ ] the form while uploading, with a failed image and with validation errors
  - [ ] the detail view with 3 images
  - [ ] Use small generated placeholder images, not real screenshots.
- [ ] **Tests:**
  - [ ] Unit tests next to the code: Zod limits, uploader file checks (type, size, count), optimistic rollback, the partial-failure retry, and keyboard use of the image dialog.
  - [ ] `tests/db/backlog.int.test.ts`: admins can do everything; member, contributor and music leader get nothing from the tables or the bucket; deleting a request removes its image rows. Run it under the DB lock (AGENTS.md §8).
  - [ ] `tests/e2e/admin-backlog.spec.ts` on the local seeded stack: add a to-do, mark it done, submit a request with one PNG, open its detail page and see the image. It skips itself where seeded sign-in isn't available, like the other signed-in specs.

## Acceptance criteria
- [ ] A seeded admin can add, tick off and delete to-dos on `/admin`, and submit an enhancement request with 2 wireframe images that then show on its detail page.
- [ ] A seeded music leader sees no backlog sections on `/admin` (only the Themes card) and gets a 403 on `/admin/requests`. RLS also blocks direct queries.
- [ ] Works at 360px wide with no horizontal scroll, including the thumbnail grid and the uploader.
- [ ] axe finds no serious or critical issues on `/dev/admin-backlog` and the new routes.
- [ ] Definition of Done in `AGENTS.md` §5 is satisfied.

## Boundaries
- **Owns** (create/modify freely): `db/migrations/0006_admin_backlog.sql`, `features/admin/backlog/`, `app/(app)/admin/requests/`, `app/dev/admin-backlog/`, `tests/db/backlog.int.test.ts`, `tests/e2e/admin-backlog.spec.ts`
- **Touches** (small integration edits only; describe each in the PR): `db/migrations/meta/`, `db/schema/backlog.ts` (new file in DB-01's folder), `db/schema/index.ts`, `lib/permissions.ts`, `lib/permissions.test.ts`, `app/(app)/admin/page.tsx`, `app/(app)/admin/page.test.tsx`, `features/admin/adminAreas.ts`, `features/admin/adminAreas.test.ts`
- Anything else: do not edit. Open a change request (`AGENTS.md` §6).
