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
5. [x] Sections 6 and 8: Resend and Sentry accounts.
6. [ ] Section 9: set Vercel environment variables (needs values from 2 to 8).
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

Database tables are created later by running the repo migrations against each project. Ask the lead agent to run them (or follow `README.md`) once the projects exist.

### 2b. Vercel project

1. In Vercel click Add New, then Project, and import this GitHub repo.
2. Keep the detected Next.js settings. Do not deploy yet if it asks for env vars; add them in section 9, then redeploy.
3. Note your production domain (for example `https://<name>.vercel.app`). That is `APP_URL` for production.

Verify: the project is linked and a build runs on each pull request (it will pass only after section 9).
Tick: `tasks/OPS-01.md` "Vercel project linked to repo; env vars set per environment".

## 3. Supabase Auth: URL configuration

Do this in **each** Supabase project. Prerequisite: section 2 and the Vercel domains.

1. In the Supabase project, open Authentication and look for URL Configuration.
2. Set **Site URL** to that environment's `APP_URL` (staging domain for the staging project, production domain for production). No trailing slash.
3. Under **Redirect URLs**, click Add URL and add each of these (replace the host with your `APP_URL`):
   - `https://<your-domain>/auth/callback**`
   - `https://<your-domain>/reset/confirm`
4. For Vercel preview deploys, also add the preview pattern to the staging project (replace `<team>` with your Vercel team slug shown in preview URLs):
   - `https://*-<team>.vercel.app/auth/callback**`
   - `https://*-<team>.vercel.app/reset/confirm`
5. The `**` after `/auth/callback` is required: the app returns to `/auth/callback?next=...`, and without `**` the query string is rejected.
6. Optional but recommended for the password reset email when opened on a different device: in Authentication, look for Email Templates, open **Reset password**, and set the link to `{{ .SiteURL }}/reset/confirm?token_hash={{ .TokenHash }}&type=recovery`. This needs the code change from `AUTH-01-reset-redirect-and-e2e` §2 (follow-up for the lead dev), so do it only after that lands.

Verify: on a deployed site, use Forgot password; the emailed link lands on `/reset/confirm`, not on the home page.
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

## 6. Resend (email)

Prerequisites: a domain you can edit DNS for. Used by SHR-03 and ADM-04 emails.

1. Sign up at resend.com. Go to Domains, Add domain, and enter the sending domain (a subdomain such as `mail.<yourdomain>` is fine).
2. Resend shows DNS records (SPF, DKIM, and so on). Add them at your DNS host, then click Verify in Resend. This can take minutes to hours.
3. Look for API Keys, create a key with sending access, and store it in a password manager.
4. Decide the from address, for example `Worship Library <no-reply@mail.<yourdomain>>`. That is `EMAIL_FROM`.

Verify: the domain shows Verified in Resend.
Tick: `tasks/OPS-01.md` is satisfied without it, but SHR-03 and ADM-04 need it. Record in `docs/ops/environments.md` that Resend exists.
Unblocks: share-by-email and admin notification emails.

## 7. Email confirmation for sign-ups

SPEC §6 default: hosted projects require a confirmed email before a self-registered request reaches admins (local dev has it off).

1. In each Supabase project open Authentication, then Sign In / Providers (look for Email), and turn on **Confirm email**.
2. Save.
3. Optional: Authentication, SMTP Settings, point Supabase at Resend (host, port, username, and the Resend API key as the password; use the values from Resend's SMTP docs) so confirmation emails come from your domain. Supabase's built-in sender is rate limited.

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

| Variable | Where to find the value | Environments |
|---|---|---|
| `APP_URL` | The site's public URL, no trailing slash (for example `https://<domain>`). Previews: if you can't set a stable URL, use the staging domain. | Preview, Production |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project, Project Settings, look for API (or Data API): Project URL | Preview, Production |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Same page: the `anon` / public key | Preview, Production |
| `SUPABASE_SERVICE_ROLE_KEY` | Same page: the `service_role` key. Secret; server only; mark Sensitive | Preview, Production |
| `DATABASE_URL` | Supabase: click Connect (or Project Settings, Database) and copy the connection string. Prefer the pooled/transaction string for Vercel; put your DB password in it | Preview, Production |
| `SSO_PROVIDERS` | You choose: `google`, `microsoft`, or `google,microsoft` (only providers you finished in sections 4 and 5) | Preview, Production |
| `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` / `_SECRET` | Local Supabase CLI only. Hosted projects take these in Supabase, Providers (sections 4 and 5). Leave out of Vercel | Local only |
| `SUPABASE_AUTH_EXTERNAL_AZURE_CLIENT_ID` / `_SECRET` / `_URL` | Same: local CLI only; hosted values go in Supabase, Providers | Local only |
| `FEATURE_SAML` | `false` (SAML needs a paid Supabase tier; default per SPEC §6) | Preview, Production |
| `SAML_PROVIDER_ID` | Leave empty unless SAML is turned on | Preview, Production (optional) |
| `RESEND_API_KEY` | Resend, API Keys (section 6). Secret | Preview, Production |
| `EMAIL_FROM` | Your chosen from address, for example `Worship Library <no-reply@mail.<yourdomain>>` | Preview, Production |
| `SENTRY_DSN` | Sentry project DSN (section 8) | Preview, Production |
| `NEXT_PUBLIC_SENTRY_DSN` | Same DSN value | Preview, Production |
| `CRON_SECRET` | Make up a long random string (for example generate 32+ random characters in a password manager). Use a different one per environment. Vercel sends it to the cron route at `/api/cron/usage` | Preview, Production |
| `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` | Sentry (section 8). Used by `next.config.ts` for source maps; not yet in `.env.example` (see the OPS-02 CR) | Preview, Production |

Verify: trigger a redeploy of a preview branch; the build passes, the preview loads `/login`, and signing in against staging works. Tick: `tasks/OPS-01.md` acceptance "Preview deploys build and reach staging DB".

## 10. `docs/ops/environments.md`

Prerequisite: sections 2 to 9 done. Owned by OPS-01.

1. Create `docs/ops/environments.md` listing, with no secrets: the two Supabase project names and refs, the Vercel project and domains, which OAuth apps exist and where, the Resend domain, the Sentry project, who owns each account, and when the Entra client secret expires.
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
