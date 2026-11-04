'use client';

import {useActionState} from 'react';

import {signIn} from '@/app/actions';

export default function LoginPage() {
  const [error, formAction, pending] = useActionState(signIn, null);

  return (
    <main>
      <h1>LFG</h1>
      <p className="sub">Sign in to see your applications.</p>

      <form action={formAction}>
        <input
          name="email"
          type="email"
          placeholder="email"
          autoComplete="username"
          required
        />
        <input
          name="password"
          type="password"
          placeholder="password"
          autoComplete="current-password"
          required
        />
        <button type="submit" disabled={pending}>
          {pending ? 'Signing in…' : 'Sign in'}
        </button>
        {error === null ? null : <p className="error">{error}</p>}
      </form>

      <p className="sub" style={{marginTop: 24}}>
        Local development seeds two test accounts — see supabase/seed.sql.
      </p>
    </main>
  );
}
