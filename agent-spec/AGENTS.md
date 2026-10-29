# AGENTS.md — People of Praise Music App

You are one of several agents building this app at the same time. This file tells you how to pick up work without colliding with the others. Read it fully before starting a task.

## 1. Reading order

1. This file.
2. `SPEC.md` — what we're building; requirement IDs (`REQ-…`); decided stack; open questions with **default assumptions you must use**.
3. Your task file in `tasks/<ID>.md` — goal, deliverables, acceptance criteria, the exact paths you own.
4. The contracts your task lists under "Read first" (`contracts/*.md`). Contracts are frozen interfaces; code against them even if the implementing task hasn't merged yet.

`INDEX.md` shows all tasks by wave; `tasks.json` is the same data for orchestrators. The human-facing proposal is `../Music_App_Technical_Proposal.docx` — background only; `SPEC.md` wins on any conflict.

## 2. Picking a task

```bash
python3 agent-spec/scripts/check_tasks.py --ready     # tasks whose dependencies are all done
```

A task is **ready** when its `status` is `todo`, every `depends_on` task is `done`, and `human_required` is `false`. To claim it:

1. Set `status: in_progress` in the task file's frontmatter (that file only) and commit it as the first commit on your branch.
2. Branch: `task/<ID>-<short-slug>`, e.g. `task/LIB-16-lyrics-parser`.
3. If two agents claim the same task, the one whose PR is opened first keeps it; the other stops and picks another.

Status values: `todo` → `in_progress` (claimed on your branch) → `done` (set in your PR before review). A status only reaches main when your PR merges, so setting `done` in the PR means main flips to `done` at the moment of merge, and a PR closed without merging leaves the task `todo`. Don't use `review`; the open PR already shows that. Use `blocked` plus a note at the bottom of the task file if you cannot proceed.

## 3. File ownership — the rule that makes concurrency work

Every task lists:

- **owns** — paths you may create and change freely. No other task owns an overlapping path (the checker enforces this).
- **touches** — files owned by an upstream task where you may make a *small integration edit* (wire a handler, render a slot, add an import). Describe each touch in the PR body.
- Everything else is **off-limits**. If you need a change elsewhere, open a change request (§6) and work around it or stop.

Shared files with special rules:

| File | Rule |
|---|---|
| `package.json` / `pnpm-lock.yaml` | Anyone may **add** dependencies. Never upgrade or remove others' deps. On lockfile conflict: rebase, run `pnpm install`, commit the result. |
| `.gitkeep` placeholders | Delete the one in your owned folder when you add real files. |
| `db/migrations/` | Only DB-01, DB-02, DB-03 (and later CR-approved tasks) add migrations. Never edit a merged migration. |
| `types/` | Only F-03 writes here. Need a new shared type? Change request. Feature-local types go in your own `features/<x>/types.ts`. |
| `app/dev/<name>/` | Each UI task adds its own gallery page; never edit another task's. |

## 4. Repo layout

```
music-app/
├─ agent-spec/                 # this folder: spec, contracts, tasks (docs only)
├─ app/
│  ├─ (auth)/login/  reset/  auth/callback/
│  ├─ (app)/layout.tsx         # shell + NavBar + requireUser
│  ├─ (app)/library/           # Worship Library (Home)
│  ├─ (app)/songs/new/  songs/[id]/  songs/[id]/edit/
│  ├─ (app)/lists/  lists/[id]/
│  ├─ (app)/branches/  quick/  admin/{users,branches,themes}/
│  ├─ share/[token]/           # public read-only list
│  ├─ dev/<component>/         # component gallery (404 in production)
│  └─ api/cron/usage/
├─ components/                 # shared presentational components
│  ├─ ui/                      # shadcn primitives
│  ├─ song/  song/panels/  media/
│  └─ NavBar.tsx  ResponsivePanel.tsx
├─ features/<feature>/
│  ├─ server/ or server.ts     # 'use server' actions + read helpers
│  └─ ui/                      # feature components (client)
│     features: auth, songs, themes, resources, audit, search, lists, player, sharing, branches, admin, import
├─ lib/                        # env, supabase, db, auth, permissions, action, audit, storage, email, lyrics/, lists/, usage/, youtube.ts
├─ types/                      # domain.ts, validation.ts (F-03 only)
├─ db/  schema/  migrations/  seed/
├─ fixtures/                   # typed sample data (F-04)
├─ emails/                     # react-email templates
├─ scripts/                    # import.ts etc.
├─ content/                    # theme vocabulary drafts
├─ docs/                       # guides, ops docs
└─ tests/  db/  e2e/  perf/    # unit tests live next to code as *.test.ts
```

## 5. Definition of Done (every task)

- [ ] All deliverables and acceptance criteria in the task file are checked off.
- [ ] `pnpm typecheck && pnpm lint && pnpm test` pass locally; integration tests (`pnpm test:int`) pass if you touched server or DB code.
- [ ] New logic has unit tests next to it (`*.test.ts`). Pure modules: aim for full branch coverage.
- [ ] Only owned/touched paths changed (`git diff --name-only main` to check).
- [ ] Server actions: `requireUser` → `assertCan` → Zod validate → do work → return `ActionResult`. No raw throws to the client.
- [ ] UI: props match `contracts/ui.md`; has loading, empty and error states; keyboard accessible; works at 360px wide; a `/dev/<name>` page with fixtures exists for new components.
- [ ] No secrets, real lyrics beyond first lines, or personal data committed.
- [ ] PR title `[<ID>] <title>`; body lists deliverables, any **touches**, how to test, and screenshots for UI.
- [ ] Task file `status: done` in the PR. The merger doesn't update statuses; merging the PR is what marks the task done on main.

## 6. Change requests

Contracts and other tasks' files are frozen so parallel work stays compatible. If one is wrong or missing something:

1. Create `agent-spec/change-requests/<YOUR-ID>-<slug>.md` with: the problem, the proposed contract diff, which tasks it affects.
2. Keep working on everything in your task that doesn't depend on it. If nothing remains, set your task `blocked`.
3. A human (or lead agent) approves, updates the contract, and notes it in the CR file.

Never "just fix" a contract or another task's file inside your PR.

## 7. Coding conventions

- TypeScript strict; no `any` without a `// reason:` comment. Named exports only (Next.js route files excepted).
- Import shared types from `@/types/domain`; never redeclare enums or literals that exist there.
- Server-only modules start with `import 'server-only'`.
- DB access only through `lib/db.ts` (Drizzle) inside server code; client code never imports `lib/db`, `lib/supabase/server`, or the service-role client.
- Dates: store UTC; display in the user's locale; event dates are plain `date` (no time zone).
- Naming: files `PascalCase.tsx` for components, `camelCase.ts` for modules; DB `snake_case`; TS `camelCase`.
- Tests: Vitest for unit/integration (local Supabase via `supabase start`, reset with `pnpm db:reset`), Playwright for e2e. Use `fixtures/` rather than inventing data.
- UI text: sentence case; energy labels exactly as `ENERGY_META`.
- Keep PRs small: one task per PR; split large tasks into stacked PRs if over ~600 changed lines.

## 8. When you're unsure

Use the default in `SPEC.md` §6, write the assumption in your PR description, and move on. If the question changes a contract, open a change request (§6).
