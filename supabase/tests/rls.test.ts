/**
 * Row-level security isolation.
 *
 * SECURITY.md calls this test required rather than optional, and
 * docs/code-standards.md says the same: it is the one test whose absence could
 * leak another person's résumé. It talks to a real local Supabase stack, so it
 * runs as its own suite — `npm run test:db` — rather than inside the unit
 * tests, which must stay offline.
 *
 * Every assertion here is about what the DATABASE refuses, not about what the
 * application remembers to filter. That distinction is ADR-0002.
 */

import {createClient, type SupabaseClient} from '@supabase/supabase-js';
import {beforeAll, describe, expect, it} from 'vitest';

import type {Database} from '../database.types';

const URL = process.env.SUPABASE_URL;
const ANON_KEY = process.env.SUPABASE_ANON_KEY;

const PASSWORD = 'lfg-dev-password';
const ALICE = 'alice@lfg.test';
const BOB = 'bob@lfg.test';
const BOB_ID = '22222222-2222-2222-2222-222222222222';

if (URL === undefined || ANON_KEY === undefined) {
  throw new Error(
    'SUPABASE_URL and SUPABASE_ANON_KEY must be set. Run:\n' +
      '  npx supabase start && export $(npx supabase status -o env | xargs)\n' +
      'See docs/development.md. This suite must never be silently skipped.',
  );
}

type Client = SupabaseClient<Database>;

const anonClient = (): Client =>
  createClient<Database>(URL, ANON_KEY, {
    auth: {persistSession: false, autoRefreshToken: false},
  });

async function signIn(email: string): Promise<Client> {
  const client = anonClient();
  const {error} = await client.auth.signInWithPassword({
    email,
    password: PASSWORD,
  });
  if (error) {
    throw new Error(`Could not sign in as ${email}: ${error.message}`);
  }
  return client;
}

let alice: Client;
let bob: Client;
let bobRowId: string;

beforeAll(async () => {
  alice = await signIn(ALICE);
  bob = await signIn(BOB);

  const {data, error} = await bob
    .from('applications')
    .select('id')
    .eq('company_name', 'ACME Bob Ltd')
    .single();
  if (error) {
    throw new Error(`Seed missing Bob's row: ${error.message}`);
  }
  bobRowId = data.id;
});

describe('reading', () => {
  it("returns only Alice's rows to Alice, with no user filter in the query", async () => {
    const {data, error} = await alice.from('applications').select('*');
    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data!.length).toBeGreaterThan(0);
    for (const row of data!) {
      expect(row.user_id).toBe('11111111-1111-1111-1111-111111111111');
    }
  });

  it('never shows Alice a row belonging to Bob', async () => {
    const {data} = await alice.from('applications').select('company_name');
    const names = (data ?? []).map(row => row.company_name);
    expect(names).not.toContain('ACME Bob Ltd');
  });

  it("hides Bob's row from Alice even when she asks for it by id", async () => {
    const {data, error} = await alice
      .from('applications')
      .select('*')
      .eq('id', bobRowId);
    expect(error).toBeNull();
    expect(data).toStrictEqual([]);
  });

  it('returns nothing at all to an anonymous caller', async () => {
    const {data, error} = await anonClient().from('applications').select('*');
    expect(error).toBeNull();
    expect(data).toStrictEqual([]);
  });

  it('shows Bob only his own row', async () => {
    const {data} = await bob.from('applications').select('company_name');
    expect((data ?? []).map(r => r.company_name)).toStrictEqual([
      'ACME Bob Ltd',
    ]);
  });
});

describe('writing', () => {
  it('refuses an insert that assigns a row to another user', async () => {
    const {error} = await alice.from('applications').insert({
      user_id: BOB_ID,
      company_name: 'Smuggled',
      role_title: 'Engineer',
      region: 'uk',
    });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/row-level security/i);
  });

  it("silently affects nothing when Alice updates Bob's row", async () => {
    const {data, error} = await alice
      .from('applications')
      .update({company_name: 'Taken over'})
      .eq('id', bobRowId)
      .select();
    expect(error).toBeNull();
    expect(data).toStrictEqual([]);

    const {data: stillBobs} = await bob
      .from('applications')
      .select('company_name')
      .eq('id', bobRowId)
      .single();
    expect(stillBobs!.company_name).toBe('ACME Bob Ltd');
  });

  it("affects nothing when Alice deletes Bob's row", async () => {
    const {data, error} = await alice
      .from('applications')
      .delete()
      .eq('id', bobRowId)
      .select();
    expect(error).toBeNull();
    expect(data).toStrictEqual([]);

    const {count} = await bob
      .from('applications')
      .select('*', {count: 'exact', head: true})
      .eq('id', bobRowId);
    expect(count).toBe(1);
  });

  it('refuses to let Alice hand her own row to Bob', async () => {
    const {data: mine} = await alice
      .from('applications')
      .select('id')
      .limit(1)
      .single();

    const {error} = await alice
      .from('applications')
      .update({user_id: BOB_ID})
      .eq('id', mine!.id);
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/row-level security/i);
  });
});
