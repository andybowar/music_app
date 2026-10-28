# Worship Library — People of Praise music app

Members-only web app (installable PWA): a shared, searchable library of the songs Christian communities use, with event setlists and listening playlists on top.

- What we're building: [`agent-spec/SPEC.md`](agent-spec/SPEC.md)
- How agents pick up and deliver work: [`agent-spec/AGENTS.md`](agent-spec/AGENTS.md)
- Task board: [`agent-spec/INDEX.md`](agent-spec/INDEX.md)

## Stack

Next.js 15 (App Router, Server Actions) · TypeScript strict · Tailwind CSS v4 + shadcn/ui · Supabase (Postgres, Auth, Storage) · Drizzle ORM · Zod · Vitest · Playwright · pnpm.

## Prerequisites

- Node.js ≥ 20.18
- pnpm 10 (`npm i -g pnpm@10`, or prefix commands with `npx pnpm@10`)
- Docker Desktop (or another Docker runtime) for the local Supabase stack. The Supabase CLI is a dev dependency — no global install needed.

## Setup

```bash
pnpm install
cp .env.example .env.local
pnpm db:start                # = supabase start; prints API URL, anon key, service_role key
# copy those values into .env.local
pnpm exec playwright install chromium   # first time only, for e2e tests
```

## Everyday commands

| Command                          | What it does                                                              |
| -------------------------------- | ------------------------------------------------------------------------- |
| `pnpm dev`                       | Dev server on http://127.0.0.1:3000 (`/` redirects to `/library`)         |
| `pnpm build` / `pnpm start`      | Production build / serve                                                  |
| `pnpm typecheck`                 | `tsc --noEmit`                                                            |
| `pnpm lint`                      | ESLint (zero warnings allowed)                                            |
| `pnpm format`                    | Prettier write                                                            |
| `pnpm test`                      | Unit tests (Vitest, jsdom) — `*.test.ts(x)` next to the code              |
| `pnpm test:int`                  | Integration tests (`tests/db/**`, `*.int.test.ts`) against local Supabase |
| `pnpm test:e2e`                  | Playwright (desktop Chrome + 360px phone); starts the dev server itself   |
| `pnpm db:start` / `pnpm db:stop` | Start / stop the local Supabase stack                                     |
| `pnpm db:reset`                  | Reset the local database                                                  |

Supabase Studio runs at http://127.0.0.1:54323 and the local mail catcher (password resets, invites) at http://127.0.0.1:54324 while the stack is up.

## Layout

See [`agent-spec/AGENTS.md` §4](agent-spec/AGENTS.md#4-repo-layout). Empty folders carry a `.gitkeep`; delete it when you add real files.
