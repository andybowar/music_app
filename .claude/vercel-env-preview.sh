#!/usr/bin/env bash
# Sets the missing Preview (staging) environment variables for music-app.
# Run from the repo root in your own terminal:  bash .claude/vercel-env-preview.sh
# Secrets are read with hidden input and piped straight to Vercel; nothing is saved or printed.
set -euo pipefail

STAGING_ALIAS="https://music-app-git-staging-andybowars-projects.vercel.app"

put() {
  local name=$1 value=$2 flag=${3:-}
  vercel env rm "$name" preview --yes >/dev/null 2>&1 || true
  printf '%s' "$value" | vercel env add "$name" preview $flag >/dev/null
  echo "  set $name (preview)"
}

echo "Values from the STAGING Supabase project (thzzzcioqylmbzsvmpgo):"
read -rsp "  anon / publishable key: " ANON; echo
read -rsp "  service_role / secret key: " SERVICE; echo
put NEXT_PUBLIC_SUPABASE_ANON_KEY "$ANON"
put SUPABASE_SERVICE_ROLE_KEY "$SERVICE" --sensitive
unset ANON SERVICE

put SSO_PROVIDERS google
put FEATURE_SAML false
put CRON_SECRET "$(openssl rand -hex 32)" --sensitive

echo
echo "APP_URL: sign-in returns here. Previews each get their own address, so use one stable one."
read -rp "  APP_URL for previews [$STAGING_ALIAS]: " URL
put APP_URL "${URL:-$STAGING_ALIAS}"

read -rp "Optional: app Gmail address (Enter to skip): " GMAIL
if [ -n "$GMAIL" ]; then
  read -rsp "  Gmail app password: " GPASS; echo
  put SMTP_USER "$GMAIL"
  put SMTP_PASSWORD "$GPASS" --sensitive
  put EMAIL_FROM "Worship Library <$GMAIL>"
  unset GPASS
fi

echo
echo "Done. Variables apply to new builds only: push a commit or redeploy a preview."
