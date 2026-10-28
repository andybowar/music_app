# CR F-01 · Scaffold files missing from F-01 `owns`

**Status:** approved 2026-10-28; F-01 `owns` updated in `tasks/F-01.md` and `tasks.json`.

## Problem

F-01's deliverables need a few files that no task owns:

| File | Why |
|---|---|
| `postcss.config.mjs` | Tailwind v4 in Next.js runs through `@tailwindcss/postcss`. |
| `.prettierignore` | Keeps Prettier off `agent-spec/`, build output and the lockfile. |
| `tests/smoke.test.ts` | The Vitest smoke test the task asks for. |
| `tests/e2e/smoke.spec.ts` | The Playwright smoke test the task asks for. |
| `supabase/.gitignore` | Written by `supabase init`. |
| `**/.gitkeep` | Repo-layout placeholders (AGENTS.md §3 already covers deleting them). |

F-01 created them. Nothing else changed outside F-01's paths.

## Proposed contract diff

Add these to F-01 `owns` in `tasks/F-01.md` and `tasks.json`:

```diff
-owns: [..., "README.md", ".gitignore"]
+owns: [..., "README.md", ".gitignore", "postcss.config.mjs", ".prettierignore",
+       "tests/smoke.test.ts", "tests/e2e/smoke.spec.ts", "supabase/.gitignore"]
```

## Also worth noting for later tasks

- `components.json` points the shadcn `utils` alias at `@/components/ui/utils` (inside UI-01's `components/ui/`), so UI-01 can create `cn()` without needing a `lib/utils.ts` that no task owns.
- ESLint enforces two AGENTS.md §7 rules: named exports only in `components/ features/ lib/ types/ fixtures/ emails/`, and no `@/lib/db` or `@/lib/supabase/{server,admin}` imports from `components/` or `features/*/ui/`. F-05 should name its service-role client `lib/supabase/admin.ts` so the second rule covers it, or ask to have the pattern updated.
- `pnpm test` runs unit tests only. `pnpm test:int` runs `tests/db/**` and `*.int.test.ts` one file at a time (F-02's integration job).

## Affects

F-01 only. Notes for UI-01, F-05 and F-02.
