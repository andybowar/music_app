#!/usr/bin/env bash
# Sets the Vercel environment variables for music-app (HUMAN-TASKS.md section 9).
# Run from the repo root in your own terminal:  bash .claude/vercel-env-setup.sh
# Secrets are read with hidden input and piped straight to Vercel; nothing is saved or printed.
set -euo pipefail

PROD_URL="https://music-app-one-plum.vercel.app"

# Replaces NAME in ENV (production|preview) with VALUE.
put() {
  local name=$1 env=$2 value=$3 flag=${4:-}
  vercel env rm "$name" "$env" --yes >/dev/null 2>&1 || true
  printf '%s' "$value" | vercel env add "$name" "$env" $flag >/dev/null
  echo "  set $name ($env)"
}

# Prompts for a value; hidden when the 3rd argument is "secret".
ask() {
  local prompt=$1 var=$2 kind=${3:-}
  if [ "$kind" = secret ]; then read -rsp "$prompt: " "$var"; echo; else read -rp "$prompt: " "$var"; fi
}

echo "1/4  Removing the placeholder entries imported from the old .env.example"
for v in NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY DATABASE_URL \
         CRON_SECRET FEATURE_SAML SAML_PROVIDER_ID EMAIL_FROM SENTRY_DSN NEXT_PUBLIC_SENTRY_DSN \
         NEXT_PUBLIC_SITE_URL AUTH_GOOGLE_ENABLED AUTH_MICROSOFT_ENABLED RESEND_API_KEY; do
  for e in production preview; do vercel env rm "$v" "$e" --yes >/dev/null 2>&1 || true; done
done
echo "  done"

for e in production preview; do
  if [ "$e" = production ]; then label="PRODUCTION Supabase project"; else label="STAGING Supabase project (used by previews)"; fi
  echo
  echo "2/4  $e: values from the $label"
  ask "  Project URL (https://<ref>.supabase.co)" SB_URL
  ask "  anon / public key" SB_ANON secret
  ask "  service_role key" SB_SERVICE secret
  ask "  DATABASE_URL (pooled, port 6543, password filled in)" DB_URL secret
  put NEXT_PUBLIC_SUPABASE_URL "$e" "$SB_URL"
  put NEXT_PUBLIC_SUPABASE_ANON_KEY "$e" "$SB_ANON"
  put SUPABASE_SERVICE_ROLE_KEY "$e" "$SB_SERVICE" --sensitive
  put DATABASE_URL "$e" "$DB_URL" --sensitive
  unset SB_ANON SB_SERVICE DB_URL

  echo "3/4  $e: fixed values"
  put SSO_PROVIDERS "$e" google
  put FEATURE_SAML "$e" false
  put CRON_SECRET "$e" "$(openssl rand -hex 32)" --sensitive
done

echo
echo "4/4  APP_URL"
put APP_URL production "$PROD_URL"
ask "  APP_URL for previews (press Enter to skip for now)" PREVIEW_URL
if [ -n "$PREVIEW_URL" ]; then put APP_URL preview "${PREVIEW_URL%/}"; else echo "  skipped APP_URL (preview): preview pages will error until it is set"; fi

ask "Optional: Sentry DSN (Enter to skip)" DSN
if [ -n "$DSN" ]; then for e in production preview; do put SENTRY_DSN "$e" "$DSN"; put NEXT_PUBLIC_SENTRY_DSN "$e" "$DSN"; done; fi
ask "Optional: app Gmail address (Enter to skip)" GMAIL
if [ -n "$GMAIL" ]; then
  ask "  Gmail app password" GPASS secret
  for e in production preview; do
    put SMTP_USER "$e" "$GMAIL"; put SMTP_PASSWORD "$e" "$GPASS" --sensitive
    put EMAIL_FROM "$e" "Worship Library <$GMAIL>"
  done
  unset GPASS
fi

echo
echo "Done. Redeploy production so the new values take effect:"
echo "  vercel redeploy $PROD_URL"
