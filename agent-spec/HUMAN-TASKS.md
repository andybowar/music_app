# Human tasks

Work only the project owner can do: accounts, credentials, decisions and real content. Agents skip these. Tick boxes here as you go, and keep each task file's own checklist in step (`tasks/<ID>.md`). Later, non-urgent ideas live in `TODO.md`.

Rules for everything below:

- Never paste secrets (keys, passwords, client secrets) into the repo, a PR, or chat. Put them only in Vercel, Supabase or a password manager.
- Menu names in dashboards change. Where a step says "look for X", find the nearest match.
- "Staging" and "production" are two separate Supabase projects. Do staging first, check it works, then repeat for production.

## Order of operations

1. [x] Section 1: decide the 3 open change requests (5 minutes, anytime).
2. [x] Section 2: create the Supabase projects and Vercel project (OPS-01). Everything else needs this.
3. [x] Section 3: Supabase Auth URL configuration, then email confirmation (section 7).
4. [x] Section 4: Google sign-in app. Section 5 (Microsoft) skipped by project owner 2026-11-01 (need the Supabase project ref from step 2).
5. [x] Section 8: Sentry account. Resend replaced by Gmail on 2026-11-02 (CR `OWNER-gmail-smtp-email`).
   - [ ] Section 6: Gmail sending account and app password, then point Supabase SMTP at it (section 7, step 3).
6. [ ] Section 9: set Vercel environment variables (needs values from 2 to 8). Production done 2026-11-02; Preview still needs the staging values.
   - [ ] Section 3: create the `staging` branch and set both projects' URL configuration (staging Google provider too).
   - [ ] Section 2c: make yourself admin on each environment after your first sign-in.
7. [ ] Section 10: write `docs/ops/environments.md`.
8. [ ] Section 11: backups and restore drill (OPS-03, after OPS-01).
9. [ ] Section 12: review the theme list (CNT-01) and tagging guide (CNT-02) with a music leader. Can run in parallel with everything above.
10. [ ] Section 13: enter the first 50 songs (CNT-03, after the song form LIB-17 and CNT-02 are merged).
11. [ ] Section 14: pilot rollout (PILOT-01, last).

## 1. Still needs your decision

Three change requests (CRs) are still marked `proposed`. To decide: open the file, change its **Status** line to `approved by project owner <date>` or `rejected <date>`, and tell the lead agent so contracts and task files are updated. All three are small and low risk.

- [x] `change-requests/AUTH-04-layout-require-user.md`
  - Plain English: the page shell still uses a temporary login check. This swaps in the real one from the auth module (it also sends pending and rejected users to the account-status page).
  - Approving: AUTH-04 gets permission to edit `app/(app)/layout.tsx` (one line). Nothing changes if you reject, because the middleware already blocks those users.
- [x] `change-requests/AUTH-04-role-at-least.md`
  - Plain English: the role order (member, contributor, music leader, admin) is written in two places and could drift. This keeps one copy and shares it.
  - Approving: adds a small `roleAtLeast` helper to `lib/permissions.ts` and to `contracts/api.md`. No user-visible change.
- [x] `change-requests/OPS-02-instrumentation-client.md`
  - Plain English: makes error reporting (Sentry) catch browser errors in dev and React page crashes, and adds a locked test endpoint so you can trigger a test error on staging.
  - Approving: OPS-02 gets new files (`instrumentation-client.ts`, `app/global-error.tsx`, `app/api/debug/sentry/`) and `.env.example` gains `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`. Decide before the OPS-02 wave runs. Section 8 has a workaround that works if you reject it.

Done when: all three Status lines are changed. Unblocks: AUTH-04 follow-up, OPS-02.

## 2. OPS-01: provision cloud environments (`tasks/OPS-01.md`)

Prerequisites: a Supabase account, a Vercel account, GitHub access to this repo.
Unblocks: real SSO testing, hosted password reset, Vercel previews that reach a database, OPS-03.

### 2a. Supabase projects (staging and production)

1. Sign in at supabase.com and click New project.
2. Name it (for example `music-app-staging`), choose your organization, pick a region close to your users, and generate a database password. Save the password in a password manager.
3. Wait for the project to finish provisioning.
4. Note the **project ref**: the short code in the dashboard URL (`supabase.com/dashboard/project/<ref>`) and in the project URL `https://<ref>.supabase.co`.
5. Create the storage bucket: look for Storage in the left menu, click New bucket, name it exactly `resources`, leave **Public bucket** off (it must be private), save.
6. Repeat steps 1 to 5 for `music-app-production`.

Verify: both projects show "Healthy"; each has a private bucket named `resources`.
Tick: `tasks/OPS-01.md` deliverable "Two Supabase projects; private `resources` bucket in each".

Database tables are created by the deploy: once `MIGRATION_DATABASE_URL` is set for an environment (section 9), every Vercel deploy applies any pending migrations before building, and a failed migration fails the deploy. To run them by hand instead, paste the migration SQL into the Supabase SQL Editor or run `pnpm db:migrate` with `DATABASE_URL` set to the session pooler string. See `change-requests/OWNER-migrate-on-deploy.md`. Do **not** run `pnpm db:seed` against production: it loads fake test songs and users.

### 2c. First admin

New accounts start pending, and only an admin can approve them, so the first admin is made by hand. After your first sign-in on an environment, open that Supabase project's SQL Editor and run (with your sign-in email):

```sql
update public.users set role = 'admin', access_status = 'approved'
where email = 'you@example.com';
```

Sign out and back in. From then on, approve everyone else in Admin › Users (`/admin/users`).

### 2b. Vercel project

1. In Vercel click Add New, then Project, and import this GitHub repo.
2. Keep the detected Next.js settings. Do not deploy yet if it asks for env vars; add them in section 9, then redeploy.
3. Note your production domain (for example `https://<name>.vercel.app`). That is `APP_URL` for production.

Verify: the project is linked and a build runs on each pull request (it will pass only after section 9).
Tick: `tasks/OPS-01.md` "Vercel project linked to repo; env vars set per environment".

## 3. Supabase Auth: URL configuration

When someone signs in, the trip is app → Google → Supabase → back to the app. These settings tell Supabase which app addresses it may send people back to. Anything not on the list falls back to the Site URL.

The addresses this project uses:

| Environment | Supabase project | App address (`APP_URL`) |
|---|---|---|
| Production | `bxelmhsxazuqbdafwpvl` | `https://music-app-one-plum.vercel.app` |
| Staging (previews) | `thzzzcioqylmbzsvmpgo` | `https://music-app-git-staging-andybowars-projects.vercel.app` |

The staging address is Vercel's permanent address for the git branch `staging`. Every other preview gets a new random address on each push, so sign-in is tested at this one. Create the branch once: `git push music_app main:staging` (push main to it again whenever you want staging updated).

In each project open Authentication, then URL Configuration:

1. **Site URL**: that project's app address from the table. No trailing slash.
2. **Redirect URLs**: exactly these, with the host replaced by that project's app address:
   - `https://<app address>/auth/callback**` (the `**` is required: the app returns to `/auth/callback?next=…`, and without it the query string is rejected)
   - `https://<app address>/reset/confirm`
   - `https://<app address>/login` (where the sign-up confirmation email lands)
3. **Staging only**, so sign-in also works from any preview address: `https://*-andybowars-projects.vercel.app/**`. Never add a wildcard to production.
4. **Remove** any single-deployment address such as `https://music-gjnhfiy6a-andybowars-projects.vercel.app`. Those sit behind Vercel's login and end in "This page is unavailable".
5. Optional, for reset emails opened on a different device: Email Templates, **Reset password**, link `{{ .SiteURL }}/reset/confirm?token_hash={{ .TokenHash }}&type=recovery`. Needs the code change from `AUTH-01-reset-redirect-and-e2e` §2 first.

Also in the **staging** project: Authentication, Providers, **Google**: enable it with the same client ID and secret as production, and add `https://thzzzcioqylmbzsvmpgo.supabase.co/auth/v1/callback` to the Google OAuth app's Authorized redirect URIs (section 4).

Verify: sign in with Google at each app address; you come back to the app (a new account lands on `/account-status`). Forgot password: the emailed link opens `/reset/confirm`.
Tick: `tasks/OPS-01.md` (Google/Microsoft redirect URLs item).
Unblocks: password reset and SSO on hosted environments.

## 4. Google sign-in app

Prerequisites: a Google account for the organization, the Supabase project ref (section 2a). Google sends no group claim, so Google users must already have an account (admin invite, or an existing password account with the same email).

1. Go to console.cloud.google.com and create (or pick) a project.
2. Look for APIs & Services, then OAuth consent screen (may be called Google Auth Platform). Set app name, support email, and user type. Choose Internal if your organization uses Google Workspace; otherwise External. Save.
3. Look for Credentials, click Create credentials, then OAuth client ID, type **Web application**.
4. Under **Authorized redirect URIs** add `https://<project-ref>.supabase.co/auth/v1/callback` (use the staging ref; make a second client for production with the production ref). Note this is Supabase's URL, not the app's.
5. Create it and copy the **Client ID** and **Client secret**.
6. In Supabase: Authentication, look for Providers (or Sign In / Providers), open Google, switch Enabled on, paste the Client ID and secret, save.
7. Repeat for production with its own client.

Verify: with `SSO_PROVIDERS` including `google` (section 9) a "Continue with Google" button appears on `/login`; signing in as an invited user lands in the app. A Google user with no account sees the "not linked to a branch yet" error. That is expected (CR decision, 2026-10-30).
Tick: `tasks/OPS-01.md` "Google + Microsoft OAuth apps created; redirect URLs registered" (when both are done).
Unblocks: Google SSO testing (AUTH-02, PR #45 test steps).

## 5. Microsoft Entra app (with groups claim)

**Skipped (project owner, 2026-11-01).** Set `SSO_PROVIDERS=google`. Google sends no groups, so automatic branch suggestions (REQ-AUTH-04) won't happen; admins pick the branch when approving. Kept below in case Microsoft is added later.

Prerequisites: admin access to your Microsoft Entra tenant, Supabase project ref.

1. Go to entra.microsoft.com, then Identity, Applications, App registrations, New registration.
2. Name it. For supported account types choose **single tenant** (this organization only).
3. Under Redirect URI choose platform **Web** and enter `https://<project-ref>.supabase.co/auth/v1/callback`. Register.
4. On the Overview page copy the **Application (client) ID** and **Directory (tenant) ID**.
5. Look for Certificates & secrets, New client secret, pick an expiry, and copy the secret **Value** immediately (it is shown once). Put a reminder in your calendar for the expiry date.
6. Look for Token configuration, Add groups claim. Choose "Groups assigned to the application" (or the nearest option), and for the ID token pick **group display names / cloud-only group names** if offered. If you only get object IDs, you must set each branch's SSO group in the app to that ID instead of a name.
7. Look for API permissions and confirm `openid`, `profile`, `email` are present; click Grant admin consent if offered.
8. Assign the groups to the app: Enterprise applications, open the app, Users and groups, add the groups that map to branches.
9. In Supabase: Authentication, Providers, Azure. Enable it, paste the Client ID and secret, and set the **Azure Tenant URL** to `https://login.microsoftonline.com/<tenant-id>/v2.0`. Save.
10. Repeat for production (a separate app registration is cleanest).

Verify: sign in with a Microsoft account that is in a mapped group; you land as a pending user (SPEC: SSO users also start pending until approved). Then check the user's metadata in Supabase (Authentication, Users, open the user) for a `groups` entry. If `groups` is missing, tell the lead agent: `AUTH-02-oidc-provider-config` §2 says a custom hook may be needed.
Tick: `tasks/OPS-01.md` Google + Microsoft item.
Unblocks: Microsoft SSO and automatic branch mapping (REQ-AUTH-04).

## 6. Gmail sending account (email)

Used for share-by-email (SHR-03), admin notifications (ADM-04), and Supabase's sign-up confirmation and password-reset emails (section 7). Recipients see this Gmail address, not your domain. See `change-requests/OWNER-gmail-smtp-email.md`.

1. Create a new Google account just for the app, for example `pop.worship.library@gmail.com`. Don't use your personal account: its address would show to recipients, and its password would sit in Vercel and Supabase.
2. In that account, open myaccount.google.com, then Security, and turn on **2-Step Verification**. App passwords don't exist without it.
3. Go to myaccount.google.com/apppasswords (or search "App passwords" in the account settings). Create one named `Worship Library`. Google shows a 16-character password once: store it in a password manager. This is `SMTP_PASSWORD`.
4. Your from address is `Worship Library <pop.worship.library@gmail.com>` (use your actual address). That is `EMAIL_FROM`. Gmail only lets you change the display name, not the address.

Limits: about 500 recipients a day on a free account, which is plenty for a pilot. If you ever turn off 2-Step Verification, Google revokes the app password and email stops until you make a new one.

Verify: from a mail client or the Supabase SMTP test in section 7, a test message arrives from the Gmail address.
Tick: `tasks/OPS-01.md` is satisfied without it, but SHR-03 and ADM-04 need it. Record in `docs/ops/environments.md` which Gmail account sends app email and who has its login.
Unblocks: share-by-email, admin notification emails, and reliable sign-up and reset emails.

## 7. Email confirmation for sign-ups

SPEC §6 default: hosted projects require a confirmed email before a self-registered request reaches admins (local dev has it off).

1. In each Supabase project open Authentication, then Sign In / Providers (look for Email), and turn on **Confirm email**.
2. Save.
3. Authentication, then SMTP Settings (look for "Enable custom SMTP"): sender email = your Gmail address, sender name = `Worship Library`, host `smtp.gmail.com`, port `465`, username = your Gmail address, password = the app password from section 6. Save. Do this in both projects. Without it, Supabase's built-in sender is heavily rate limited and won't reliably reach members.

Verify: sign up with a new email on staging; you receive a confirmation email, and the account cannot sign in until you click it. Afterwards it appears as pending for admins.
Tick: add a note under OPS-01 in this file.

Note (2026-11-01): email confirmation configured by the project owner.

## 8. Sentry

Prerequisites: Sentry account. Used by OPS-02 (error tracking, REQ-NF-04).

1. Sign up at sentry.io, create an organization, then Create project, platform **Next.js**. Name it, for example, `music-app`.
2. Copy the **DSN** from the project's settings (look for Client Keys). The same DSN value is used for `SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN`. A DSN is not secret, but keep it out of the repo.
3. For readable stack traces: in Sentry look for Settings, Auth Tokens (or Developer Settings, Internal Integrations), create a token with release and source-map upload permissions. This is `SENTRY_AUTH_TOKEN`. Note your organization slug (`SENTRY_ORG`) and project slug (`SENTRY_PROJECT`). Set these only in Vercel, build time.
4. Add the Sentry env vars in Vercel (section 9), Preview and Production, then redeploy staging.
5. Verify the console-throw test: open the staging site, sign in, open the browser developer console, and paste:
   `setTimeout(() => { throw new Error('Sentry test error (client)') })`
6. Within about a minute the error should appear in Sentry Issues with `environment` = `preview` (or `production`) and **no email address or cookies** on the event.
7. If `OPS-02-instrumentation-client` is approved and merged, you can instead trigger a server error: send a request to `/api/debug/sentry` with the header `Authorization: Bearer <CRON_SECRET>`. Without the header it returns 404.

Tick: OPS-02 acceptance "Test error appears in Sentry staging" (the agent's task file; tell the lead agent).
Unblocks: OPS-02 sign-off and REQ-NF-04.

## 9. Vercel environment variables

Where: Vercel project, Settings, Environment Variables. For each row, add the value and tick the environments listed. Staging values go in **Preview** (and Development if you use `vercel dev`); production values go in **Production**. Same variable name, different value per environment. Redeploy after changing values.

Rule for the Supabase values: Preview uses the **staging** project, Production uses the **production** project.

Things that went wrong the first time (2026-11-02), so check them:
- **Add each variable separately per environment.** One entry ticked for both Preview and Production holds one value for both, so previews would use the production database.
- **Don't import `.env.example` or `.env.local`.** They hold blank or local-only values; an import produced a site that returned 500 on every page.
- **Sensitive values can't be read back**, by you or by an agent. If you're unsure what you entered, set it again.
- **`NEXT_PUBLIC_*` values are built into the app**, so they only take effect after a new deploy.
- The removed `RESEND_API_KEY`, `NEXT_PUBLIC_SITE_URL`, `AUTH_GOOGLE_ENABLED` and `AUTH_MICROSOFT_ENABLED` are unused; delete them if they're still there.
- From a terminal: `vercel env add NAME production --sensitive` (or `preview`) asks for the value without showing it; `vercel env ls` lists what's set.

| Variable | Where to find the value | Environments |
|---|---|---|
| `APP_URL` | Where sign-in returns to (section 3 table). Production: `https://music-app-one-plum.vercel.app`. Preview: `https://music-app-git-staging-andybowars-projects.vercel.app` (the `staging` branch's address). No trailing slash | Preview, Production |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project, Project Settings, look for API (or Data API): Project URL, for example `https://bxelmhsxazuqbdafwpvl.supabase.co`. The base address only: not the project name, and without `/rest/v1/` | Preview, Production |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Same page: the `anon` / public key (the newer `sb_publishable_…` key works too) | Preview, Production |
| `SUPABASE_SERVICE_ROLE_KEY` | Same page: the `service_role` key (or the newer `sb_secret_…` key). Secret; server only; mark Sensitive | Preview, Production |
| `DATABASE_URL` | Supabase: click Connect and copy the **Transaction pooler** string (port `6543`), with your DB password in place of `[YOUR-PASSWORD]`. If the password has symbols such as `@ # / ?`, reset it to letters and numbers or URL-encode it | Preview, Production |
| `MIGRATION_DATABASE_URL` | Supabase: click Connect and copy the **Session pooler** string (port `5432`), with your DB password filled in. Used only during the build to apply migrations; leave it out of an environment to skip migrations there. Mark Sensitive | Preview (staging), Production (production) |
| `SSO_PROVIDERS` | `google` (Microsoft was skipped; use `google,microsoft` once section 5 is done) | Preview, Production |
| `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` / `_SECRET` | Local Supabase CLI only. Hosted projects take these in Supabase, Providers (sections 4 and 5). Leave out of Vercel | Local only |
| `SUPABASE_AUTH_EXTERNAL_AZURE_CLIENT_ID` / `_SECRET` / `_URL` | Same: local CLI only; hosted values go in Supabase, Providers | Local only |
| `FEATURE_SAML` | `false` (SAML needs a paid Supabase tier; default per SPEC §6) | Preview, Production |
| `SAML_PROVIDER_ID` | Leave empty unless SAML is turned on | Preview, Production (optional) |
| `SMTP_HOST` | `smtp.gmail.com` (optional; that is the default) | Preview, Production |
| `SMTP_PORT` | `465` (optional; that is the default) | Preview, Production |
| `SMTP_USER` | The app's Gmail address (section 6) | Preview, Production |
| `SMTP_PASSWORD` | The Gmail app password (section 6). Secret; mark Sensitive | Preview, Production |
| `EMAIL_FROM` | `Worship Library <your-app-address@gmail.com>`; the address must be the Gmail account itself | Preview, Production |
| `SENTRY_DSN` | Sentry project DSN (section 8) | Preview, Production |
| `NEXT_PUBLIC_SENTRY_DSN` | Same DSN value | Preview, Production |
| `CRON_SECRET` | Make up a long random string (for example generate 32+ random characters in a password manager). Use a different one per environment. Vercel sends it to the cron route at `/api/cron/usage` | Preview, Production |
| `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` | Sentry (section 8). Used by `next.config.ts` to upload source maps; all three are needed for that (optional) | Preview, Production |

Verify: production loads `/login` with "Continue with Google" and `/library` redirects signed-out visitors to `/login?next=%2Flibrary`. For previews, push the `staging` branch (section 3) and check the same at its address, then sign in against staging. Tick: `tasks/OPS-01.md` acceptance "Preview deploys build and reach staging DB".

## 10. `docs/ops/environments.md`

Prerequisite: sections 2 to 9 done. Owned by OPS-01.

1. Create `docs/ops/environments.md` listing, with no secrets: the two Supabase project names and refs, the Vercel project and domains, which OAuth apps exist and where, the Gmail sending account, the Sentry project, who owns each account, and when the Entra client secret expires. Note that Vercel Hobby keeps runtime logs for about an hour, so check logs right after reproducing a problem.
2. Commit it on a branch `task/OPS-01-environments` with `status: done` in `tasks/OPS-01.md`, and open a PR titled `[OPS-01] Provision cloud environments`.

Verify: the PR merges. Unblocks: OPS-03.

## 11. OPS-03: backups, restore drill, storage alert (`tasks/OPS-03.md`)

Prerequisites: OPS-01 done. Daily backups depend on your Supabase plan; the Free plan may not include downloadable backups, so check.

1. Open the production Supabase project, then Database, and look for Backups. Confirm daily backups are listed with recent dates. If none, note it and consider upgrading the plan or using a scheduled `pg_dump`; ask the lead agent.
2. Create a third Supabase project named `music-app-restore-test`.
3. Restore into it: if your plan allows, download the latest backup and restore it into the scratch project (Supabase's docs describe restoring a backup file with `psql`; ask the lead agent for the exact commands). Some plans offer restore-to-new-project in the Backups page; use it if present.
4. Verify the restore: in the scratch project open Table Editor and check that `songs` and `users` have rows matching production.
5. Storage alert: look for Project Settings, Usage (or Billing, Spend cap/Usage) in production and set an alert/notification at 80% of the storage quota. If Supabase has no alert option on your plan, set a calendar reminder to check Usage monthly and note this in the doc.
6. Delete the scratch project when done.
7. Write `docs/ops/backups.md`: backup frequency, retention, date of the drill, how long restore took, who ran it, where the 80% alert goes.

Verify: `docs/ops/backups.md` records the drill. Tick: both `tasks/OPS-03.md` deliverable and acceptance. Unblocks: PILOT-01.

## 12. Content review: CNT-01 themes and CNT-02 tagging guide

Prerequisite: a music leader who knows how your community searches for songs. Both drafts are merged. Unblocks: seeding production themes (H-02) and CNT-03.

### CNT-01 (`content/themes-v1.md`)

1. Share `content/themes-v1.md` with the music leader (161 themes, 383 synonyms, 11 groups).
2. Answer the four questions at the top of the file:
   1. Merge any overlapping themes? `risen`/`resurrection`, `forever`/`eternity`, `reigns`/`king`, `honor`/`glory`, and fold `rocks cry out` into `creation` or `praise`. For `honor`/`glory`: either merge (honor becomes a synonym of glory) or keep both and add related-theme search later.
   2. Keep or drop the broad synonyms `spirit`, `rain`, `oil`, `fruit`.
   3. Add community-specific themes beyond `covenant community`.
   4. Keep seasons and liturgy as themes, or later split them into a separate tag.
3. Tell the lead agent the answers; an agent edits both `content/themes-v1.md` and `content/themes-v1.json` (keep them in sync).

Verify: the file's draft banner is replaced by an approval note with date and reviewer name. Tick: nothing in the task file (already done); note approval in this file.

### CNT-02 (`docs/tagging-guide.md`)

1. Read it against the sample songs: energy definitions with examples, first-chord rules, theme rules, file naming.
2. Check it fits two printed pages and matches how your leaders actually tag. Send edits to the lead agent.

Unblocks: CNT-03 entry work.

## 13. CNT-03: enter the first 50 songs (`tasks/CNT-03.md`)

Prerequisites: LIB-17 (song form) and CNT-02 merged; staging live; your account approved with at least the contributor role.

1. Pick 50 real songs across energy levels and branches. Follow `docs/tagging-guide.md`.
2. Enter them in staging using the new-song form, or use the CSV template (`docs/import-template.csv`) plus a folder of files named by the convention in the guide, once the import task is ready. Do not commit real lyrics to the repo.
3. Attach files (chord charts, audio) to each song and add themes.
4. Keep a running list of friction points. Turn each into a new task file, or a line in `TODO.md`, and tell the lead agent.

Verify: staging shows 50 songs with files and tags; searching by a theme and a synonym finds them. Tick: `tasks/CNT-03.md` both deliverables and the Phase 1 exit criterion. Unblocks: PILOT-01.

## 14. PILOT-01: pilot branch rollout (`tasks/PILOT-01.md`)

Prerequisites: H-05, DOC-01, OPS-03, CNT-03 done; production environment set up (sections 2 to 9) and production themes seeded.

1. Choose the pilot branch and a champion there.
2. Run an onboarding session (about 30 to 45 minutes) with the user guide from DOC-01: sign in, find a song, build a list, share a list.
3. Create a feedback form (Google Forms or similar) and give the link to the branch.
4. Triage weekly for 4 weeks: review Sentry issues and feedback, and turn each real problem into a task or `TODO.md` item.
5. At week 4, decide go or no-go for all branches. Record the decision and reasons.

Verify: four weeks of use, triage notes kept, and a recorded go/no-go. Tick: `tasks/PILOT-01.md` deliverables and the Phase 5 exit criterion.

## 15. OPS-04: Google Cloud setup (request for the IT/cloud team) (`tasks/OPS-04.md`)

Moving hosting from Vercel to Cloud Run. Supabase stays. You can send the list below to your IT/cloud team as is. Ask them to share the resulting names and IDs (the last bullet) with you, then add them to `docs/ops/environments.md` or give them to the agent working on OPS-04.

**Please set up, in our Google Cloud organization:**
- **Two projects** (or one, with clearly separate services): `music-app-staging` and `music-app-prod`, with billing attached.
- **Region:** one region close to our users that's allowed by our org policy (e.g. `us-central1`). It should be close to the Supabase projects' region to keep database latency low.
- **APIs enabled:** Cloud Run, Artifact Registry, Cloud Build, Secret Manager, Cloud Scheduler, IAM Credentials.
- **Artifact Registry:** a Docker repository, e.g. `music-app`, in that region.
- **Runtime service account** (per project), e.g. `music-app-run@…`: `roles/secretmanager.secretAccessor` on the app's secrets. Nothing else.
- **Deploy service account**, e.g. `music-app-deploy@…`: `roles/run.admin`, `roles/artifactregistry.writer`, and `roles/iam.serviceAccountUser` on the runtime service account.
- **Workload Identity Federation** for GitHub Actions: a pool and provider trusting `token.actions.githubusercontent.com`, restricted to the repository `andybowar/music_app` (and the `main` / `staging` branches), allowed to impersonate the deploy service account. No JSON keys.
- **Cloud Scheduler:** permission for the deploy account to create one job per environment (or IT creates it): daily at 09:00 UTC, `GET https://<app address>/api/cron/usage` with header `Authorization: Bearer <CRON_SECRET>`.
- **Public access:** the Cloud Run services must be **publicly reachable** (`allUsers` as invoker). Members of our community sign in from personal devices. If org policy blocks public services (Domain Restricted Sharing / `iam.allowedPolicyMemberDomains`), we need an exception for these two services.
- **Custom domain:** e.g. `music.<our-domain>` for production and `music-staging.<our-domain>` for staging, mapped to Cloud Run (domain mapping or a load balancer), with Google-managed TLS.
- **Send back:** project IDs, region, Artifact Registry path, both service account emails, the WIF provider resource name, and the final domain names.

**Then you (owner):**
1. Add the app's secrets to Secret Manager in each project, with the same values as in Vercel today:
   - `DATABASE_URL`, `MIGRATION_DATABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`
   - the SMTP/Resend settings
   - the Sentry auth token and DSNs
   - the Google and Microsoft OAuth values used by the app (if any)
2. In GitHub (repository → Settings → Secrets and variables → Actions), add the non-secret IDs from the IT team as **variables**: `GCP_PROJECT_STAGING`, `GCP_PROJECT_PROD`, `GCP_REGION`, `GCP_WIF_PROVIDER`, `GCP_DEPLOY_SA`, `GCP_ARTIFACT_REPO`.
3. Once staging works on Cloud Run: update each Supabase project's **URL configuration** (§3): the Site URL and redirect URLs point at the new addresses. Keep the old ones until the switch is done.
4. At cut-over: switch DNS, check sign-in and a setlist, then **pause** (don't delete) the Vercel project for two weeks.

