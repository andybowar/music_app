# CR AUTH-01 · Allow the reset redirect URL; let AUTH-01 own a login e2e spec and gallery page

**Status:** §1 approved 2026-10-29 and applied. §2 and §3 approved by project owner 2026-10-30: §3 applied to `tasks/AUTH-01.md` (owns `tests/e2e/auth-login.spec.ts`; the spec itself is still to be written). §2 (token-hash recovery template) is a follow-up for the lead dev.

## 1. `/reset/confirm` is not an allowed Supabase redirect for `localhost`

### Problem

`requestPasswordReset` sends the reset email with `redirectTo: ${APP_URL}/reset/confirm`. Supabase Auth only redirects there if the URL is allowed: same host as `site_url`, or listed in `additional_redirect_urls`. Otherwise it silently falls back to `site_url` (`/`), the `?code=` is lost behind the `/` → `/library` redirect, and the reset can't be completed.

`supabase/config.toml` (F-01) has:

```toml
site_url = "http://127.0.0.1:3000"
additional_redirect_urls = ["http://127.0.0.1:3000/auth/callback", "http://localhost:3000/auth/callback"]
```

So with `APP_URL=http://127.0.0.1:3000` (the `.env.example` default) reset works. `features/auth/actions.int.test.ts` passes. With `APP_URL=http://localhost:3000`, the verify link redirects to `http://127.0.0.1:3000/` and the integration test fails (seen locally).

### Proposed change

`supabase/config.toml`:

```diff
-additional_redirect_urls = ["http://127.0.0.1:3000/auth/callback", "http://localhost:3000/auth/callback"]
+additional_redirect_urls = [
+  "http://127.0.0.1:3000/auth/callback", "http://localhost:3000/auth/callback",
+  "http://127.0.0.1:3000/reset/confirm", "http://localhost:3000/reset/confirm",
+]
```

Hosted projects: add `${APP_URL}/reset/confirm` (and each Vercel preview pattern, e.g. `https://*-<team>.vercel.app/reset/confirm`) to Auth → URL Configuration → Redirect URLs. This belongs in the deploy/ops docs.

**Affects:** F-01 (owner of `supabase/config.toml`), ops docs.

## 2. Reset links only work in the browser that requested them (PKCE)

### Problem

`@supabase/ssr` uses PKCE, so the code in the reset link can only be exchanged with the code verifier cookie set when the reset was requested. Someone who requests a reset on a laptop and opens the email on a phone gets "This reset link is invalid or has expired." The page says so.

### Proposed change (follow-up, not blocking)

Switch the recovery email template to a token-hash link (`{{ .SiteURL }}/reset/confirm?token_hash={{ .TokenHash }}&type=recovery`) under `[auth.email.template.recovery]` in `supabase/config.toml` and in the hosted dashboard. Then `confirmPasswordReset` accepts the hash via `verifyOtp({ type: 'recovery', token_hash })`. The `confirmPasswordReset(token, pw)` signature doesn't change. Only the meaning of `token` widens, plus a small edit to `/reset/confirm` to read `token_hash`.

**Affects:** F-01 (`supabase/config.toml`), AUTH-01 (follow-up).

## 3. Login e2e spec and gallery page are outside AUTH-01's owned paths

### Problem

AUTH-01's acceptance criteria include "Playwright: login → lands on /library", and DoD §5 asks for a `/dev/<name>` gallery page. Playwright's `testDir` is `tests/e2e/`, and gallery pages live in `app/dev/<name>/`. AUTH-01 owns neither.

What AUTH-01 did instead:

- It ran an ad-hoc Playwright script (Chromium, not committed) against `next start` on port 3117 with a throwaway user. The script checked these things:
  - Wrong password shows "Incorrect email or password." and stays on `/login`.
  - Keyboard-only sign-in lands on `/library` at both 360px and 1280px.
  - `?next=/songs/abc` is honored and `?next=//evil.test` falls back to `/library`.
  - There's no horizontal scroll at 360px.
  - "Forgot your password?" goes to `/reset`.
  - An expired or bogus reset code shows the invalid-link state.
- Unit tests cover the form components (validation, pending, errors, keyboard).
- The real pages `/login`, `/reset`, `/reset/confirm` render the components with no data dependencies, so they serve as the gallery.

### Proposed change

```diff
-owns: [..., "features/auth/ui/ResetForms.tsx"]
+owns: [..., "features/auth/ui/ResetForms.tsx", "tests/e2e/auth-login.spec.ts"]
```

The spec signs in as `E2E_USER_EMAIL` / `E2E_USER_PASSWORD` and expects `/library`. It calls `test.skip()` when those aren't set, so Vercel preview runs without a seeded user stay green. No gallery page is proposed; the auth pages need no fixtures.

**Affects:** AUTH-01 (`agent-spec/tasks/AUTH-01.md`, `tasks.json`).
