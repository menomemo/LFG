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
const ALICE_ID = '11111111-1111-1111-1111-111111111111';
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
let bobApplicationId: string;
let bobCompanyId: string;
let bobJobId: string;
let aliceJobId: string;
let aliceApplicationId: string;
let aliceResumeVersionId: string;
let bobResumeVersionId: string;
let bobInterviewId: string;
let bobContactId: string;
let bobSignalId: string;
let bobCompetencyId: string;
let bobEvidenceId: string;
let aliceCompetencyId: string;

beforeAll(async () => {
  alice = await signIn(ALICE);
  bob = await signIn(BOB);

  const bobCompany = await bob
    .from('companies')
    .select('id')
    .eq('name', 'ACME Bob Ltd')
    .single();
  if (bobCompany.error) {
    throw new Error(`Seed missing Bob's company: ${bobCompany.error.message}`);
  }
  bobCompanyId = bobCompany.data.id;

  const bobJob = await bob.from('jobs').select('id').limit(1).single();
  if (bobJob.error) {
    throw new Error(`Seed missing Bob's job: ${bobJob.error.message}`);
  }
  bobJobId = bobJob.data.id;

  const bobApplication = await bob
    .from('applications')
    .select('id')
    .limit(1)
    .single();
  if (bobApplication.error) {
    throw new Error(
      `Seed missing Bob's application: ${bobApplication.error.message}`,
    );
  }
  bobApplicationId = bobApplication.data.id;

  const aliceJob = await alice.from('jobs').select('id').limit(1).single();
  if (aliceJob.error) {
    throw new Error(`Seed missing Alice's job: ${aliceJob.error.message}`);
  }
  aliceJobId = aliceJob.data.id;

  const bobResumeVersion = await bob
    .from('resume_versions')
    .select('id')
    .limit(1)
    .single();
  if (bobResumeVersion.error) {
    throw new Error(
      `Seed missing Bob's resume version: ${bobResumeVersion.error.message}`,
    );
  }
  bobResumeVersionId = bobResumeVersion.data.id;

  const bobInterview = await bob
    .from('interviews')
    .select('id')
    .limit(1)
    .single();
  if (bobInterview.error) {
    throw new Error(
      `Seed missing Bob's interview: ${bobInterview.error.message}`,
    );
  }
  bobInterviewId = bobInterview.data.id;

  const aliceApplication = await alice
    .from('applications')
    .select('id')
    .limit(1)
    .single();
  if (aliceApplication.error) {
    throw new Error(
      `Seed missing Alice's application: ${aliceApplication.error.message}`,
    );
  }
  aliceApplicationId = aliceApplication.data.id;

  const aliceResumeVersion = await alice
    .from('resume_versions')
    .select('id')
    .limit(1)
    .single();
  if (aliceResumeVersion.error) {
    throw new Error(
      `Seed missing Alice's resume version: ${aliceResumeVersion.error.message}`,
    );
  }
  aliceResumeVersionId = aliceResumeVersion.data.id;

  const bobContact = await bob.from('contacts').select('id').limit(1).single();
  if (bobContact.error) {
    throw new Error(`Seed missing Bob's contact: ${bobContact.error.message}`);
  }
  bobContactId = bobContact.data.id;

  const bobSignal = await bob.from('signals').select('id').limit(1).single();
  if (bobSignal.error) {
    throw new Error(`Seed missing Bob's signal: ${bobSignal.error.message}`);
  }
  bobSignalId = bobSignal.data.id;

  const bobCompetency = await bob
    .from('competencies')
    .select('id')
    .limit(1)
    .single();
  if (bobCompetency.error) {
    throw new Error(
      `Seed missing Bob competency: ${bobCompetency.error.message}`,
    );
  }
  bobCompetencyId = bobCompetency.data.id;

  const bobEvidence = await bob.from('evidence').select('id').limit(1).single();
  if (bobEvidence.error) {
    throw new Error(`Seed missing Bob evidence: ${bobEvidence.error.message}`);
  }
  bobEvidenceId = bobEvidence.data.id;

  const aliceCompetency = await alice
    .from('competencies')
    .select('id')
    .limit(1)
    .single();
  if (aliceCompetency.error) {
    throw new Error(
      `Seed missing Alice competency: ${aliceCompetency.error.message}`,
    );
  }
  aliceCompetencyId = aliceCompetency.data.id;
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

  it('never shows Alice a company belonging to Bob', async () => {
    const {data, error} = await alice.from('companies').select('name');
    /* Asserting on the error matters more than it looks. The earlier version
       of this test queried a column that had been dropped, so the request
       failed, `data` came back null, and `expect([]).not.toContain(...)`
       passed while proving nothing. A test that cannot fail is worse than no
       test: it occupies the space where a real one would be. */
    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data!.length).toBeGreaterThan(0);
    expect(data!.map(row => row.name)).not.toContain('ACME Bob Ltd');
  });

  it("hides Bob's rows from Alice even when she asks for them by id", async () => {
    for (const [table, id] of [
      ['applications', bobApplicationId],
      ['companies', bobCompanyId],
      ['jobs', bobJobId],
      ['resume_versions', bobResumeVersionId],
      ['interviews', bobInterviewId],
      ['contacts', bobContactId],
      ['signals', bobSignalId],
      ['competencies', bobCompetencyId],
      ['evidence', bobEvidenceId],
    ] as const) {
      const {data, error} = await alice.from(table).select('*').eq('id', id);
      expect(error).toBeNull();
      expect(data).toStrictEqual([]);
    }
  });

  it('returns nothing at all to an anonymous caller, from any table', async () => {
    const anon = anonClient();
    for (const table of [
      'applications',
      'companies',
      'jobs',
      'resume_versions',
      'interviews',
      'contacts',
      'signals',
      'competencies',
      'evidence',
    ] as const) {
      const {data, error} = await anon.from(table).select('*');
      expect(error).toBeNull();
      expect(data).toStrictEqual([]);
    }
  });

  it('shows Bob only his own company', async () => {
    const {data, error} = await bob.from('companies').select('name');
    expect(error).toBeNull();
    expect(data!.map(r => r.name)).toStrictEqual(['ACME Bob Ltd']);
  });
});

describe('writing', () => {
  it('refuses an insert that assigns a row to another user', async () => {
    const {error} = await alice.from('companies').insert({
      user_id: BOB_ID,
      name: 'Smuggled',
    });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/row-level security/i);
  });

  /* The foreign keys opened a second way in, and it is subtler than owning
     the wrong row: own the row, but point it at someone else's. The reference
     itself then leaks -- it proves that company or that job exists, and any
     join from it reads across the tenant boundary. The policies check the
     parent's owner for exactly this; these two tests are what prove they do. */
  it("refuses Alice a job attached to Bob's company", async () => {
    const {error} = await alice.from('jobs').insert({
      user_id: ALICE_ID,
      company_id: bobCompanyId,
      title: 'Trojan Engineer',
      region: 'uk',
    });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/row-level security/i);
  });

  it("refuses Alice an application attached to Bob's job", async () => {
    const {error} = await alice.from('applications').insert({
      user_id: ALICE_ID,
      job_id: bobJobId,
      stage_history: [],
    });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/row-level security/i);
  });

  it("refuses Alice repointing her own application at Bob's job", async () => {
    const {data: mine} = await alice
      .from('applications')
      .select('id')
      .limit(1)
      .single();

    const {error} = await alice
      .from('applications')
      .update({job_id: bobJobId})
      .eq('id', mine!.id);
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/row-level security/i);
  });

  it('accepts the same write when everything belongs to Alice', async () => {
    const {data, error} = await alice
      .from('applications')
      .insert({user_id: ALICE_ID, job_id: aliceJobId, stage_history: []})
      .select()
      .single();
    expect(error).toBeNull();
    expect(data).not.toBeNull();

    /* Reverse check: the policies reject what they should and permit what
       they should. A rule that refuses everything also passes every test
       above. */
    await alice.from('applications').delete().eq('id', data!.id);
  });

  it("silently affects nothing when Alice updates Bob's row", async () => {
    const {data, error} = await alice
      .from('companies')
      .update({name: 'Taken over'})
      .eq('id', bobCompanyId)
      .select();
    expect(error).toBeNull();
    expect(data).toStrictEqual([]);

    const {data: stillBobs} = await bob
      .from('companies')
      .select('name')
      .eq('id', bobCompanyId)
      .single();
    expect(stillBobs!.name).toBe('ACME Bob Ltd');
  });

  it("affects nothing when Alice deletes Bob's rows", async () => {
    for (const [table, id] of [
      ['applications', bobApplicationId],
      ['companies', bobCompanyId],
      ['jobs', bobJobId],
      ['resume_versions', bobResumeVersionId],
      ['interviews', bobInterviewId],
      ['contacts', bobContactId],
      ['signals', bobSignalId],
      ['competencies', bobCompetencyId],
      ['evidence', bobEvidenceId],
    ] as const) {
      const {data, error} = await alice
        .from(table)
        .delete()
        .eq('id', id)
        .select();
      expect(error).toBeNull();
      expect(data).toStrictEqual([]);

      const {count} = await bob
        .from(table)
        .select('*', {count: 'exact', head: true})
        .eq('id', id);
      expect(count).toBe(1);
    }
  });

  it('refuses to let Alice hand her own row to Bob', async () => {
    const {data: mine} = await alice
      .from('companies')
      .select('id')
      .limit(1)
      .single();

    const {error} = await alice
      .from('companies')
      .update({user_id: BOB_ID})
      .eq('id', mine!.id);
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/row-level security/i);
  });
});

/* Every foreign key added to the schema is another way to point at another
   tenant, and owning the row while pointing it elsewhere is the subtle half.
   These are the two the pipeline tables opened: an interview attached to
   somebody else's application, and an application citing somebody else's
   résumé version. */
describe('writing: the pipeline tables', () => {
  it("refuses Alice an interview attached to Bob's application", async () => {
    const {error} = await alice.from('interviews').insert({
      user_id: ALICE_ID,
      application_id: bobApplicationId,
      round: 1,
      scheduled_at: new Date().toISOString(),
    });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/row-level security/i);
  });

  it("refuses Alice repointing her interview at Bob's application", async () => {
    const {data: mine, error: readError} = await alice
      .from('interviews')
      .select('id')
      .limit(1)
      .single();
    expect(readError).toBeNull();

    const {error} = await alice
      .from('interviews')
      .update({application_id: bobApplicationId})
      .eq('id', mine!.id);
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/row-level security/i);
  });

  it("refuses Alice an application citing Bob's résumé version", async () => {
    const {error} = await alice.from('applications').insert({
      user_id: ALICE_ID,
      job_id: aliceJobId,
      stage_history: [],
      resume_version_id: bobResumeVersionId,
    });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/row-level security/i);
  });

  it("refuses Alice repointing her application at Bob's résumé version", async () => {
    const {error} = await alice
      .from('applications')
      .update({resume_version_id: bobResumeVersionId})
      .eq('id', aliceApplicationId);
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/row-level security/i);
  });

  it('accepts both writes when everything belongs to Alice', async () => {
    /* The reverse check. A policy that refuses every write also passes every
       test above, so each new parent check needs the permitted case too. */
    const interview = await alice
      .from('interviews')
      .insert({
        user_id: ALICE_ID,
        application_id: aliceApplicationId,
        round: 9,
        scheduled_at: new Date().toISOString(),
      })
      .select()
      .single();
    expect(interview.error).toBeNull();
    expect(interview.data).not.toBeNull();
    await alice.from('interviews').delete().eq('id', interview.data!.id);

    const application = await alice
      .from('applications')
      .insert({
        user_id: ALICE_ID,
        job_id: aliceJobId,
        stage_history: [],
        resume_version_id: aliceResumeVersionId,
      })
      .select()
      .single();
    expect(application.error).toBeNull();
    expect(application.data).not.toBeNull();
    await alice.from('applications').delete().eq('id', application.data!.id);
  });

  it("never shows Alice Bob's résumé versions", async () => {
    const {data, error} = await alice
      .from('resume_versions')
      .select('region_profile');
    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data!.length).toBeGreaterThan(0);
    expect(data!.map(row => row.region_profile)).not.toContain('de_lebenslauf');
  });

  it("never shows Alice Bob's interviews", async () => {
    const {data, error} = await alice.from('interviews').select('id');
    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data!.length).toBeGreaterThan(0);
    expect(data!.map(row => row.id)).not.toContain(bobInterviewId);
  });
});

/* contacts.company_id is nullable, which gives its policies a branch the
   others do not have: refuse somebody else's company, permit no company at
   all. Both halves need a test, because a policy written as a plain exists()
   passes every negative test here and quietly refuses the legitimate
   unattached contact. */
describe('writing: the company tables', () => {
  it("refuses Alice a contact attached to Bob's company", async () => {
    const {error} = await alice.from('contacts').insert({
      user_id: ALICE_ID,
      company_id: bobCompanyId,
      role_type: 'recruiter',
      name: 'Trojan Recruiter',
      source: 'invented',
    });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/row-level security/i);
  });

  it("refuses Alice repointing her contact at Bob's company", async () => {
    const {data: mine, error: readError} = await alice
      .from('contacts')
      .select('id')
      .limit(1)
      .single();
    expect(readError).toBeNull();

    const {error} = await alice
      .from('contacts')
      .update({company_id: bobCompanyId})
      .eq('id', mine!.id);
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/row-level security/i);
  });

  it('accepts a contact attached to no company at all', async () => {
    const {data, error} = await alice
      .from('contacts')
      .insert({
        user_id: ALICE_ID,
        company_id: null,
        role_type: 'author',
        name: 'Conference speaker',
        source: 'spoke at a meetup',
      })
      .select()
      .single();
    expect(error).toBeNull();
    expect(data).not.toBeNull();
    await alice.from('contacts').delete().eq('id', data!.id);
  });

  it("refuses Alice a signal about Bob's company", async () => {
    const {error} = await alice.from('signals').insert({
      user_id: ALICE_ID,
      company_id: bobCompanyId,
      type: 'news',
      severity: 'info',
      payload: {headline: 'Smuggled'},
      observed_at: new Date().toISOString(),
      source_url: 'https://example.test/smuggled',
      generated_by: 'test',
    });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/row-level security/i);
  });

  it('accepts a signal about a company Alice owns', async () => {
    const {data: mine, error: readError} = await alice
      .from('companies')
      .select('id')
      .limit(1)
      .single();
    expect(readError).toBeNull();

    const {data, error} = await alice
      .from('signals')
      .insert({
        user_id: ALICE_ID,
        company_id: mine!.id,
        type: 'news',
        severity: 'info',
        payload: {headline: 'Permitted'},
        observed_at: new Date().toISOString(),
        source_url: 'https://example.test/permitted',
        generated_by: 'test',
      })
      .select()
      .single();
    expect(error).toBeNull();
    expect(data).not.toBeNull();
    await alice.from('signals').delete().eq('id', data!.id);
  });

  it("never shows Alice Bob's contacts or signals", async () => {
    const contacts = await alice.from('contacts').select('id, name');
    expect(contacts.error).toBeNull();
    expect(contacts.data).not.toBeNull();
    expect(contacts.data!.length).toBeGreaterThan(0);
    expect(contacts.data!.map(row => row.name)).not.toContain('Bob Contact');

    const signals = await alice.from('signals').select('id');
    expect(signals.error).toBeNull();
    expect(signals.data).not.toBeNull();
    expect(signals.data!.length).toBeGreaterThan(0);
    expect(signals.data!.map(row => row.id)).not.toContain(bobSignalId);
  });
});

describe('writing: the competency tables', () => {
  it("refuses Alice evidence against Bob's competency", async () => {
    const {error} = await alice.from('evidence').insert({
      user_id: ALICE_ID,
      competency_id: bobCompetencyId,
      source_type: 'self_assessment',
      score: 1,
      weight: 0.1,
      observed_at: new Date().toISOString(),
    });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/row-level security/i);
  });

  it("refuses Alice repointing her evidence at Bob's competency", async () => {
    const {data: mine, error: readError} = await alice
      .from('evidence')
      .select('id')
      .limit(1)
      .single();
    expect(readError).toBeNull();

    const {error} = await alice
      .from('evidence')
      .update({competency_id: bobCompetencyId})
      .eq('id', mine!.id);
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/row-level security/i);
  });

  /* ADR-0008 declines a foreign key on source_id, so this is the one
     reference in the schema a policy cannot check. The test states what that
     actually costs rather than leaving it unstated: the write is permitted,
     and it buys nothing, because resolving the source reads through RLS and
     comes back empty. If that ever stops being true, this fails. */
  it("lets Alice store Bob's interview id as a source, and it resolves to nothing", async () => {
    const written = await alice
      .from('evidence')
      .insert({
        user_id: ALICE_ID,
        competency_id: aliceCompetencyId,
        source_type: 'interview_feedback',
        source_id: bobInterviewId,
        score: 1,
        weight: 1,
        observed_at: new Date().toISOString(),
      })
      .select()
      .single();
    expect(written.error).toBeNull();
    expect(written.data).not.toBeNull();

    const resolved = await alice
      .from('interviews')
      .select('*')
      .eq('id', bobInterviewId);
    expect(resolved.error).toBeNull();
    expect(resolved.data).toStrictEqual([]);

    await alice.from('evidence').delete().eq('id', written.data!.id);
  });

  it('refuses a model-scored row that cannot say which model scored it', async () => {
    /* Not an RLS test: the provenance constraint. A mock interview score with
       no generated_by is an unattributable number, and the radar is only
       defensible if every score traces to something. */
    const {error} = await alice.from('evidence').insert({
      user_id: ALICE_ID,
      competency_id: aliceCompetencyId,
      source_type: 'mock_interview',
      score: 0.9,
      weight: 0.6,
      observed_at: new Date().toISOString(),
    });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/evidence_model_scored_has_provenance/);
  });

  it('accepts the same row once it carries provenance', async () => {
    const {data, error} = await alice
      .from('evidence')
      .insert({
        user_id: ALICE_ID,
        competency_id: aliceCompetencyId,
        source_type: 'mock_interview',
        score: 0.9,
        weight: 0.6,
        observed_at: new Date().toISOString(),
        generated_by: 'mock-interviewer@0.1.0',
      })
      .select()
      .single();
    expect(error).toBeNull();
    expect(data).not.toBeNull();
    await alice.from('evidence').delete().eq('id', data!.id);
  });

  it("never shows Alice Bob's competencies or evidence", async () => {
    const competencies = await alice
      .from('competencies')
      .select('id, axis, sub_skill');
    expect(competencies.error).toBeNull();
    expect(competencies.data).not.toBeNull();
    expect(competencies.data!.length).toBeGreaterThan(0);
    expect(competencies.data!.map(row => row.axis)).not.toContain('debugging');

    const evidence = await alice.from('evidence').select('id');
    expect(evidence.error).toBeNull();
    expect(evidence.data).not.toBeNull();
    expect(evidence.data!.length).toBeGreaterThan(0);
    expect(evidence.data!.map(row => row.id)).not.toContain(bobEvidenceId);
  });
});
