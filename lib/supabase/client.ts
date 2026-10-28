import { createBrowserClient } from '@supabase/ssr';

import { env } from '@/lib/env';

type BrowserSupabase = ReturnType<typeof createBrowserClient>;

let browserClient: BrowserSupabase | undefined;

/** Browser Supabase client (anon key, cookie session). One instance per page. */
export function createBrowserSupabase(): BrowserSupabase {
  browserClient ??= createBrowserClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
  return browserClient;
}
