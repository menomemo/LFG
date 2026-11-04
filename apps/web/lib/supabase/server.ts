import {createServerClient} from '@supabase/ssr';
import type {SupabaseClient} from '@supabase/supabase-js';
import {cookies} from 'next/headers';

import {supabaseConfig} from '@/lib/env';
import type {Database} from '@lfg/database';

/**
 * A Supabase client bound to the current request's cookies.
 *
 * It authenticates as the signed-in user, which is the whole point: every
 * query it makes is subject to row-level security, so the database decides
 * what this request may see rather than this code remembering to filter
 * (ADR-0002).
 *
 * It is typed with the generated schema, so a column that no longer exists is
 * a compile error rather than an `any` flowing into the page.
 */
export async function createClient(): Promise<SupabaseClient<Database>> {
  const cookieStore = await cookies();
  const {url, anonKey} = supabaseConfig();

  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const {name, value, options} of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          /* Called from a Server Component, where cookies are read-only.
             Session refresh happens in the server action instead, so this is
             safe to ignore. */
        }
      },
    },
  });
}
