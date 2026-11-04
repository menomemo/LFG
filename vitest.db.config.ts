import {loadEnv} from 'vite';
import {defineConfig} from 'vitest/config';

/**
 * Database suite. Requires a running local Supabase stack, which is why it is
 * separate from the unit tests: those must never touch the network, and this
 * one exists precisely to exercise a real database.
 *
 * It is deliberately not skippable. A row-level-security test that quietly
 * skips when the database is absent is worse than no test, because it reports
 * success while proving nothing.
 */
export default defineConfig(({mode}) => ({
  test: {
    include: ['supabase/tests/**/*.test.ts'],
    environment: 'node',
    testTimeout: 20_000,
    hookTimeout: 20_000,
    /* Empty prefix: load every variable from .env.local, not just VITE_ ones. */
    env: loadEnv(mode, process.cwd(), ''),
  },
}));
