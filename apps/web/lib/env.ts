/**
 * Environment access, in one place and validated once.
 *
 * `packages/core` is forbidden from reading the environment (ADR-0003), so
 * this is where configuration enters the system and becomes typed values that
 * get passed inwards.
 */

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(
      `Missing environment variable ${name}. Copy .env.example to .env.local ` +
        'and fill it in — see docs/development.md.',
    );
  }
  return value;
}

/**
 * Supabase connection settings.
 *
 * Only the anon key appears here. The service role key bypasses row-level
 * security and is confined to scheduler plugins (ADR-0002); a web surface
 * that can read it is a web surface that can leak every user's data.
 */
export function supabaseConfig(): {url: string; anonKey: string} {
  return {
    url: required('SUPABASE_URL'),
    anonKey: required('SUPABASE_ANON_KEY'),
  };
}
