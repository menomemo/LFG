import {createBrowserClient} from '@supabase/ssr';
import type {SupabaseClient} from '@supabase/supabase-js';

import type {Database} from '@lfg/database';

/**
 * Connection settings handed to the browser.
 *
 * Passed as props from a server component rather than read from
 * `NEXT_PUBLIC_*` variables. Both routes expose the same two values — the
 * publishable key is designed to be public and row-level security is what
 * protects the data, not the key's secrecy — but only one of them requires
 * the deployment to carry a second copy of the same settings under different
 * names, and a second copy is a second thing to get wrong on a redeploy.
 */
export interface SupabasePublicConfig {
  readonly url: string;
  readonly anonKey: string;
}

/**
 * A Supabase client for the browser, carrying the signed-in user's session.
 *
 * It exists for one job: invoking Edge Functions. Everything the board reads
 * is fetched by a server component and everything it writes goes through a
 * server action, both of which keep queries off the client. A model call is
 * the exception ADR-0009 made deliberately — the browser calls the function
 * directly so that the web host never waits on a provider and never holds a
 * provider key.
 *
 * The session travels as the user's own access token, so the function writes
 * `llm_usage` as the person and row-level security applies to it unchanged.
 */
export function browserClient(
  config: SupabasePublicConfig,
): SupabaseClient<Database> {
  return createBrowserClient<Database>(config.url, config.anonKey);
}
