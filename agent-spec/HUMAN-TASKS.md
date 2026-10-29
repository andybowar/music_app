# Human tasks

Work only the project owner can do: accounts, credentials, decisions and real content. Agents skip these. Ordered by when they unblock agent work. Tick items here as you go, and keep each task file's own checklist in step.

Later, non-urgent change ideas live in `TODO.md`.

## Now: unblocks the next waves

### Approve or reject change requests
Agents built to these proposals and are waiting on a yes or no. For each, set the CR's **Status** line (approved / rejected, with the date), and say if a contract or task file should change to match.

- [ ] `AUTH-01-reset-redirect-and-e2e` §2–3: cross-device reset links (token-hash email template); let AUTH-01 own a login e2e spec and gallery page. §1 is done in PR #48.
- [ ] `AUTH-02-oidc-provider-config`: Supabase `config.toml` sections for Google and Microsoft, plus env vars and redirect allow-list
- [ ] `DB-04-seed-script`: add a `pnpm db:seed` script
- [ ] `DB-06-sentry-capture-hook`: document `setSentryCapture` so OPS-02 installs it (wave 5, so decide before OPS-02 runs)
- [ ] `IMP-02-file-match-type`: make IMP-02's `FileMatch` the official type
- [ ] `LIB-14-resources-section-props`: extra props for the files section (files attach to a saved song); temporary `parseYouTubeId`
- [ ] `LIB-15-set-branch-usage-semantics`: saving replaces only hand-set usage levels and leaves derived ones
- [ ] `PLAY-03-adapter-factory-and-mount`: how player adapters are created and where the YouTube player mounts
- [ ] `PLAY-06-audio-picker-gallery`: gallery page for the audio picker
- [ ] `SRCH-07-sort-control-props-and-gallery`: `hasQuery` prop, typed `onChange`, gallery page
- [ ] `UI-02-require-user`: AUTH-04 replaces the app shell's temporary login check (AUTH-04 is wave 6)
- [ ] `UI-08-gallery-and-sample-pdf`: let UI-08 own its gallery page and sample PDF

### Review content drafts
- [ ] **CNT-01 theme vocabulary** (`content/themes-v1.md`, merged as a draft): have a music leader review the 161 themes and 383 synonyms, and answer the questions in the file. Decide the `honor`/`glory` overlap: merge them, or keep both and add related-theme search later.
- [ ] **CNT-02 tagging guide** (wave 5, being written by an agent): review once its PR opens.

## OPS-01 · Provision cloud environments (wave 1, task file `tasks/OPS-01.md`)
Blocks real SSO testing, hosted password reset, Vercel previews that reach a database, and OPS-03.

- [ ] Two Supabase projects (staging, production), each with a private `resources` storage bucket
- [ ] Vercel: set env vars per environment (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `APP_URL`, `CRON_SECRET`, `SSO_PROVIDERS`, `FEATURE_SAML`; full list in `.env.example`)
- [ ] Supabase Auth → URL Configuration: site URL, plus redirect URLs for `${APP_URL}/auth/callback` and `${APP_URL}/reset/confirm`, and the Vercel preview pattern for both
- [ ] Google OAuth app and Microsoft Entra app registration. Both call back to Supabase's `…/auth/v1/callback`, and Entra must include group membership in its tokens. Then follow the test steps in PR #45 and `change-requests/AUTH-02-oidc-provider-config.md`
- [ ] Turn on email confirmation for sign-ups in the hosted Supabase projects (SPEC §6 default for the new access-approval flow)
- [ ] Accounts and keys needed later: Resend API key and sending domain (SHR-03 and ADM-04 emails), Sentry DSN (OPS-02)
- [ ] Write `docs/ops/environments.md` (what exists and who owns it; no secrets)

## OPS-03 · Backups, restore drill, quota alerts (wave 2, after OPS-01)
- [ ] Confirm daily backups; restore one to a scratch project; set a storage usage alert at 80%
- [ ] Record the drill in `docs/ops/backups.md`

## CNT-03 · Pilot data entry: first 50 songs (wave 9, after LIB-17 song form and CNT-02 tagging guide)
- [ ] Enter or import 50 real songs with files and tags
- [ ] File friction points as new tasks (or `TODO.md` items)

## PILOT-01 · Pilot branch rollout (wave 13, the last task)
- [ ] Onboarding session, feedback form, weekly triage into new tasks
- [ ] Go/no-go for all branches
