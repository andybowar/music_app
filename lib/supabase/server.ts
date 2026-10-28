import 'server-only';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

import { env } from '@/lib/env';

export { createServiceSupabase } from './admin';

/**
 * Per-request Supabase client bound to the user's auth cookies (anon key, RLS applies).
 * Async because Next 15 `cookies()` is async. Create a new client per request.
 */
export async function createServerSupabase() {
  const cookieStore = await cookies();

  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components can't set cookies. Safe to ignore when middleware
          // refreshes the session (and sets no-cache headers) on each request.
        }
      },
    },
  });
}
