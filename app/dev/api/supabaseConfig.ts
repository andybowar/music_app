/**
 * The public Supabase settings, or null when this deployment has none (e.g. a
 * Vercel preview before cloud environments exist). Dev tools read these directly
 * instead of through `lib/env`, which throws on missing variables and would fail
 * the build or the request.
 */
export interface SupabaseConfig {
  url: string;
  anonKey: string;
}

export function readSupabaseConfig(
  source: Record<string, string | undefined> = process.env,
): SupabaseConfig | null {
  const url = source.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = source.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) return null;
  return { url: url.replace(/\/$/, ''), anonKey };
}

export function isLocalSupabase(config: SupabaseConfig | null): boolean {
  return !!config && /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(config.url);
}

export const NOT_CONFIGURED =
  "Supabase isn't configured for this deployment (NEXT_PUBLIC_SUPABASE_URL / " +
  'NEXT_PUBLIC_SUPABASE_ANON_KEY are unset). Run the app locally with `pnpm dev`.';
