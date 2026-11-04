---
id: ADM-08
title: "Report a bug from the account menu"
phase: 4
wave: 13
stream: fullstack
size: L
status: in_progress
human_required: false
depends_on: ["ADM-06", "ADM-07"]
blocks: ["SHR-05"]
owns: ["db/migrations/0008_bug_reports.sql", "features/bugs/", "app/(app)/bugs/", "app/(app)/admin/bugs/", "app/dev/bug-report/", "tests/db/bugs.int.test.ts", "tests/e2e/bug-report.spec.ts"]
touches: ["db/migrations/meta/", "db/schema/bugs.ts", "db/schema/index.ts", "lib/permissions.ts", "lib/permissions.test.ts", "tests/db/rls.test.ts", "tests/db/0003_rls.int.test.ts", "components/NavBar.tsx", "components/NavBar.test.tsx", "app/(app)/layout.tsx", "app/(app)/admin/page.tsx", "app/(app)/admin/page.test.tsx", "features/admin/backlog/storage.ts"]
requirements: ["REQ-ADM-03"]
---

# ADM-08 · Report a bug from the account menu


**Goal.** Any signed-in, approved user can report a bug from the account (profile) menu, the same way admins reach `/admin`. A report has a description, optional screenshots, and page and browser details captured automatically. Admins triage reports on the admin dashboard, and reporters can see what happened to their own reports. Requested by the project owner on 2026-11-03.

## Read first
- `agent-spec/AGENTS.md`
- `agent-spec/SPEC.md` §2.9 (REQ-ADM-03)
- `agent-spec/contracts/schema.md` (`bug_reports`, `bug_report_images`, `bug_report_status`; the `admin-attachments` bucket under Storage)
- `agent-spec/contracts/permissions.md` (`bug:report`, `bug:triage`)
- `agent-spec/contracts/api.md` (`features/bugs/server.ts` rows)
- `agent-spec/contracts/ui.md` (`/bugs*` and `/admin/bugs*` routes, `NavBar` `UserMenu` `bugReportHref?`, `BugReportForm`, `BugReportList`, `BugReportDetail`)
- Prior art from ADM-06, to reuse rather than copy:
  - `features/admin/backlog/`: the signed-upload flow, the pending-id ticket, the image checks (sniffing the file's leading bytes), `RequestForm`'s uploader, and the image dialog in `RequestDetail`
  - `0006_admin_backlog.sql`: RLS and the bucket
  - `features/admin/notifications.ts`: ADM-04's admin emails
- ADM-05's `UserMenu` `adminHref` wiring in `components/NavBar.tsx` and `app/(app)/layout.tsx`.

## Migration order
`0008` belongs to this task. SHR-05 (hashed share tokens) was renumbered to `0009` and depends on ADM-08. Generate the migration with `pnpm db:generate`, then run `pnpm prettier --write db/migrations/meta/`, because CI's format check fails on the raw output.

## Deliverables
- [ ] **`0008_bug_reports.sql`**, with the Drizzle schema in `db/schema/bugs.ts` and exported from `index.ts`. It only adds things.
  - [ ] Enum `bug_report_status` (`new`, `confirmed`, `fixed`, `wont_fix`, `duplicate`).
  - [ ] The tables as in `schema.md`, with the `updated_at` trigger.
  - [ ] RLS:
    - [ ] `bug_reports`: insert by an approved user when `created_by = auth.uid()`; select your own rows, or all rows for an admin; update and delete for admins only.
    - [ ] `bug_report_images`: select follows the report; insert only by the report's creator, and only within 24 hours of the report being created; delete for admins only.
  - [ ] Images go in the existing private `admin-attachments` bucket under `bugs/{report_id}/{image_id}.{ext}`. Uploads use server-issued signed URLs, so the admin-only bucket policies stay as they are.
- [ ] **Permissions** in `lib/permissions.ts`, with tests:
  - [ ] `bug:report`: every approved role.
  - [ ] `bug:triage`: admins only.
  - [ ] Update `tests/db/rls.test.ts` and `tests/db/0003_rls.int.test.ts` for the new actions and tables, the way ADM-06 did.
- [ ] **Server** (`features/bugs/server.ts`, `'use server'`). Every action runs `requireUser` → `assertCan` → Zod → work → `ActionResult`. Types go in `features/bugs/types.ts`.
  - [ ] `createBugReport({ title, description, expected?, pagePath?, userAgent?, viewport? })`:
    - [ ] Needs `bug:report`.
    - [ ] Limits: title 1–200 characters, description 1–10,000, expected ≤ 2,000.
    - [ ] `pagePath` must be a same-origin path that starts with `/`.
    - [ ] At most 10 reports per user per hour; beyond that, return `RATE_LIMITED`.
    - [ ] Records the deployment's commit SHA (`VERCEL_GIT_COMMIT_SHA`, or null) as `app_version`.
    - [ ] After saving, emails every approved admin through `lib/email`, the same way `notifyAccessRequested` does. The email has the title, the reporter, the page and a link to `/admin/bugs/{id}`. A failed send never fails the report.
  - [ ] `listMyBugReports()`: the current user's own reports.
  - [ ] `getBugReport(id)`: visible to its reporter or with `bug:triage`; images come with signed URLs.
  - [ ] Admin only (`bug:triage`):
    - [ ] `listBugReports({ status? })`
    - [ ] `updateBugReport(id, { status?, adminNote? })`, where `adminNote` is ≤ 2,000 characters and visible to the reporter
    - [ ] `deleteBugReport(id)`, which also removes the stored images
  - [ ] Images: `createBugImageUpload(reportId, { fileName, mimeType, sizeBytes })`, `finalizeBugImage(pendingId)` and `deleteBugImage(imageId)`. They work like ADM-06's: up to 5 PNG/JPEG/WebP/GIF images, each ≤ 10 MiB, with the file's leading bytes checked against its type. Only the report's creator may upload, and only within 24 hours of the report.
  - [ ] Reuse the helpers in `features/admin/backlog/storage.ts`, which takes a small touch to add a path helper for `bugs/…`.
- [ ] **UI** (`features/bugs/ui/`):
  - [ ] `BugReportForm`:
    - [ ] Fields: "What went wrong?" (title), "What happened?" (description) and "What did you expect?" (optional).
    - [ ] A screenshot uploader (pick, drag and drop, or paste), the same as ADM-06's wireframe uploader.
    - [ ] A read-only "Sent with your report" summary: the page path, the browser, and the screen size.
    - [ ] On success, show a "Thanks — we got it" state with links to the report and to "Report another bug". If an image fails, the report is still saved, and the form offers Retry or Remove for that image.
  - [ ] `BugReportList`: the title, a status badge (text, not only colour), the date and the image count.
    - [ ] Admins also see the reporter and a status filter.
    - [ ] Empty states: "You haven't reported any bugs." / "No bug reports yet."
  - [ ] `BugReportDetail`:
    - [ ] Shows the title, the description, what the reporter expected, the page (as a link), the browser, the screen size, the app version, the reporter (admins only), the dates, and the image grid with ADM-06's full-size dialog.
    - [ ] Admins also get a status selector, an editable note to the reporter, and a Delete button that asks for confirmation.
- [ ] **Routes.** Each has `loading.tsx` and `error.tsx`. Anyone without the permission gets a 403, and an unknown or other user's id gets a 404.
  - [ ] `/bugs`: my reports, with a "Report a bug" button.
  - [ ] `/bugs/new?from=<path>`: the form, with `pagePath` taken from `from`.
  - [ ] `/bugs/[id]`: the detail.
  - [ ] `/admin/bugs`: all reports.
  - [ ] `/admin/bugs/[id]`: the detail with triage controls.
- [ ] **Touches:**
  - [ ] `components/NavBar.tsx` `UserMenu`:
    - [ ] Add an optional prop `bugReportHref?: string | null`. When it's set, a "Report a bug" item (Bug icon) appears above Sign out, below "Admin" if that's shown.
    - [ ] The link appends `?from=<current path>` (`usePathname`).
    - [ ] Update `NavBar.test.tsx`.
  - [ ] `app/(app)/layout.tsx`: pass `bugReportHref={can(user, 'bug:report') ? '/bugs/new' : null}`.
  - [ ] `app/(app)/admin/page.tsx`: for `bug:triage`, add a "Bug reports" section showing the 5 newest open reports (`new` or `confirmed`), with a count and a "View all" link to `/admin/bugs`. If it fails to load, show an error state in that section only.
- [ ] **`/dev/bug-report` gallery** with fixtures and stubbed actions. Cover the form (empty, with validation errors, uploading, a failed image, success), both lists (empty and filled), and the detail view (as reporter and as admin). Use only small generated placeholder images.
- [ ] **Tests:**
  - [ ] Unit tests next to the code: Zod limits, the `pagePath` check, the rate limit, the uploader checks, the menu item showing and hiding, and `?from=`.
  - [ ] `tests/db/bugs.int.test.ts`, run under the DB lock:
    - [ ] Each role can create a report and read only its own.
    - [ ] Admins can read, update and delete every report.
    - [ ] Pending and disabled users get nothing.
    - [ ] Image insert is limited to the creator and the 24-hour window.
    - [ ] Deleting a report cascades to its images.
  - [ ] `tests/e2e/bug-report.spec.ts` on the local seeded stack:
    - [ ] A member opens the account menu, chooses "Report a bug", submits a report with one PNG, and sees it under `/bugs`.
    - [ ] An admin sees it on `/admin` and changes its status.
    - [ ] It skips itself where seeded sign-in isn't available.

## Acceptance criteria
- [ ] A seeded member, contributor, music leader and admin all see "Report a bug" in the account menu and can submit a report with screenshots.
- [ ] Non-admins see only their own reports. Admins see every report on `/admin` and `/admin/bugs`, and get an email for each new one when SMTP is configured.
- [ ] RLS blocks direct queries the same way the app does.
- [ ] Works at 360px wide with no horizontal scroll. axe finds no serious or critical issues on `/dev/bug-report` or the new routes.
- [ ] `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm test:int` pass locally.
- [ ] Definition of Done in `AGENTS.md` §5 is satisfied.

## Boundaries
- **Owns** (create/modify freely): `db/migrations/0008_bug_reports.sql`, `features/bugs/`, `app/(app)/bugs/`, `app/(app)/admin/bugs/`, `app/dev/bug-report/`, `tests/db/bugs.int.test.ts`, `tests/e2e/bug-report.spec.ts`
- **Touches** (small integration edits only; describe each in the PR): `db/migrations/meta/`, `db/schema/bugs.ts` (a new file in DB-01's folder), `db/schema/index.ts`, `lib/permissions.ts`, `lib/permissions.test.ts`, `tests/db/rls.test.ts`, `tests/db/0003_rls.int.test.ts`, `components/NavBar.tsx`, `components/NavBar.test.tsx`, `app/(app)/layout.tsx`, `app/(app)/admin/page.tsx`, `app/(app)/admin/page.test.tsx`, `features/admin/backlog/storage.ts`
- Anything else: do not edit. Open a change request (`AGENTS.md` §6).
