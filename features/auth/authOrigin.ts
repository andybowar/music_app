/**
 * Where an SSO sign-in should come back to. Pure.
 *
 * Supabase keeps the PKCE code verifier in a cookie on the address where sign-in **started**,
 * and `/auth/callback` must run on that same address to read it. If it comes back to another
 * one, the first attempt fails ("we couldn't sign you in…") and only a retry, now on that
 * address, works (bug report 2026-11-05).
 *
 * - Production always uses `APP_URL`: its Supabase project allows only that address, and the
 *   middleware first moves page loads on other production aliases there.
 * - Everywhere else (staging, previews, local dev) sign-in comes back to the address it started
 *   on, if that address belongs to this deployment: `APP_URL`, the deployment's own URL
 *   (`VERCEL_URL`), its branch URL (`VERCEL_BRANCH_URL`) or localhost. Anything else falls back
 *   to `APP_URL`, so a forged Host header can't steer the redirect.
 */

export interface AuthOriginInput {
  /** The request's host (`x-forwarded-host`, else `host`), e.g. "music-ab12-team.vercel.app". */
  host: string | null | undefined;
  /** The request's protocol (`x-forwarded-proto`), used for localhost only. */
  proto?: string | null;
  appUrl: string;
  vercelEnv?: string;
  vercelUrl?: string;
  vercelBranchUrl?: string;
}

const LOCAL = /^(localhost|127\.0\.0\.1)(:\d{1,5})?$/;

export function authOrigin({
  host,
  proto,
  appUrl,
  vercelEnv,
  vercelUrl,
  vercelBranchUrl,
}: AuthOriginInput): string {
  const app = new URL(appUrl);
  const h = host?.split(',')[0]?.trim().toLowerCase();
  if (vercelEnv === 'production' || !h) return app.origin;
  if (LOCAL.test(h)) return `${proto === 'https' ? 'https' : 'http'}://${h}`;
  const ours = [app.host, vercelUrl, vercelBranchUrl]
    .filter((x): x is string => !!x)
    .map((x) => x.toLowerCase());
  return ours.includes(h) ? `https://${h}` : app.origin;
}

/** `authOrigin` for the current request, from its headers and the Vercel system env. */
export function authOriginFor(headers: Pick<Headers, 'get'>, appUrl: string): string {
  return authOrigin({
    host: headers.get('x-forwarded-host') ?? headers.get('host'),
    proto: headers.get('x-forwarded-proto'),
    appUrl,
    vercelEnv: process.env.VERCEL_ENV,
    vercelUrl: process.env.VERCEL_URL,
    vercelBranchUrl: process.env.VERCEL_BRANCH_URL,
  });
}
