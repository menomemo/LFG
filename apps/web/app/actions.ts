'use server';

import {redirect} from 'next/navigation';

import {createClient} from '@/lib/supabase/server';

/**
 * Reads a text field from a submitted form.
 *
 * `FormData.get` returns `string | File | null`, and a `File` stringifies to
 * '[object Object]'. Parsing at the boundary means rejecting the shape rather
 * than coercing it.
 */
function readField(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value : '';
}

/** Signs in with email and password, then returns to the board. */
export async function signIn(
  _previous: string | null,
  formData: FormData,
): Promise<string | null> {
  const email = readField(formData, 'email');
  const password = readField(formData, 'password');

  const supabase = await createClient();
  const {error} = await supabase.auth.signInWithPassword({email, password});
  if (error) {
    return error.message;
  }

  redirect('/');
}

/** Signs out and returns to the sign-in page. */
export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}
