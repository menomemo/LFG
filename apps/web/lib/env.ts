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
    /* This is the first thing that breaks on a fresh deployment, so the
       message says where to set it rather than only what is missing. */
    throw new Error(
      `Missing environment variable ${name}. ` +
        'Locally: copy .env.example to .env.local and fill it in from ' +
        '`npx supabase status -o env` (docs/development.md). ' +
        'On Vercel: Project → Settings → Environment Variables, then redeploy ' +
        '— variables added after a build do not reach it (docs/deployment.md).',
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
