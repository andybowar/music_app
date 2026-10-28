import 'server-only';

import { createClient } from '@supabase/supabase-js';

import { env } from '@/lib/env';

/**
 * Service-role client: bypasses RLS. Server-only; never expose to the browser.
 * No session persistence or token refresh, so each call returns a stateless client.
 */
export function createServiceSupabase() {
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
