import type {User} from '@supabase/supabase-js';
import {cache} from 'react';

import {createClient} from '@/lib/supabase/server';

/**
 * The signed-in user, verified once per render.
 *
 * `getUser()` is a network call to the Supabase auth server: it verifies the
 * token rather than trusting the cookie, which is the reason to use it and
 * the reason not to make it more often than necessary. This is the one place
 * the web app asks, so there is one place to change how it asks.
 *
 * `cache` from React memoises for the life of a render and no longer, so
 * nothing here is shared between users or between requests. Measured against
 * the auth server's own log: a page load asks once, and a stage move also
 * asks once — the move action makes no auth call at all, and the one request
 * belongs to the re-render that follows it. Creating an application still
 * asks twice, because a server action and the render that `revalidatePath`
 * triggers are separate React cache scopes and this does not span them.
 * Removing that one needs either a `default auth.uid()` on the `user_id`
 * columns, which is a migration and a production push, or trusting the
 * cookie without verifying it, which is not ours to decide here.
 */
export const currentUser = cache(async (): Promise<User | null> => {
  const supabase = await createClient();
  const {
    data: {user},
  } = await supabase.auth.getUser();
  return user;
});
