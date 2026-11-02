# CR OWNER · Send email through Gmail SMTP instead of Resend

**Status:** approved by project owner 2026-11-02. SPEC, `contracts/api.md`, `tasks/SHR-03.md` and `HUMAN-TASKS.md` updated in the same commit. `lib/env.ts`, `lib/env.test.ts`, `.env.example` and CI are changed by SHR-03 (added to its touches).

## Problem

Resend only sends from a domain you verify, and recipients see that domain. The owner doesn't want app email to come from their personal domain and doesn't want to buy or borrow another one.

## Decision

The app sends through a dedicated Gmail account (for example `pop.worship.library@gmail.com`) over SMTP, using a Google app password. Supabase Auth's custom SMTP (sign-up confirmation, password reset) uses the same account.

The email module stays provider-neutral: it takes plain SMTP settings, so another provider (Resend's SMTP, a church's own mail server) can be swapped in later by changing env vars only. That also suits TODO #7 (open-source, any community).

No email code exists yet (`lib/email.ts` is SHR-03, wave 10), so nothing already built changes.

## Contract diff

`SPEC.md` §3:

```diff
-| Email | Resend + react-email |
+| Email | SMTP via Nodemailer (Gmail app password by default) + react-email for templates |
```

`contracts/api.md`, `lib/env.ts` row:

```diff
-… `RESEND_API_KEY?`, `SENTRY_DSN?` …
+… `SMTP_HOST?`, `SMTP_PORT?`, `SMTP_USER?`, `SMTP_PASSWORD?`, `EMAIL_FROM?`, `SENTRY_DSN?` …
```

`contracts/api.md`, `lib/email.ts` row: `sendEmail({ to, subject, react })` keeps its signature. It renders the template to HTML and plain text and sends over SMTP. With `SMTP_USER` or `SMTP_PASSWORD` unset it logs the message (no-op), so dev, CI and tests need no credentials.

Env vars (replace `RESEND_API_KEY`; `EMAIL_FROM` stays):

| Variable | Value |
|---|---|
| `SMTP_HOST` | `smtp.gmail.com` (default when unset) |
| `SMTP_PORT` | `465` (implicit TLS; default when unset) |
| `SMTP_USER` | the Gmail address |
| `SMTP_PASSWORD` | the 16-character Google app password. Secret |
| `EMAIL_FROM` | `Worship Library <pop.worship.library@gmail.com>`. Gmail requires the address part to be the signed-in account; only the display name is free |

## Limits to design for

- Free Gmail accounts send to about **500 recipients per day**. Plenty for a pilot. `sendShareEmail`'s existing per-user rate limit stays; SHR-03 should also cap recipients per message (for example 50) and treat Gmail's quota error as `RATE_LIMITED`.
- Send share emails as one message per recipient or with recipients in BCC, never exposing the whole team's addresses in To.
- Turning off 2-Step Verification on the Google account revokes its app passwords, and email stops until a new one is set.

## Affects

- **SHR-03**: implement `lib/email.ts` with Nodemailer + `@react-email/render`; adds touches `lib/env.ts`, `lib/env.test.ts`, `.env.example`, `.github/workflows/ci.yml` to swap `RESEND_API_KEY` for the SMTP vars.
- **ADM-04**: no change (uses `sendEmail`).
- **HUMAN-TASKS.md**: section 6 becomes the Gmail account setup; section 7 step 3 points Supabase SMTP at Gmail; section 9 lists the SMTP vars.
