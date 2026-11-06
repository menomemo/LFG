'use server';

import {revalidatePath} from 'next/cache';
import {redirect} from 'next/navigation';

import {
  accept,
  appendStageEvent,
  isApplicationStage,
  parseApplicationDraft,
  parseApplicationEdit,
  parseStageHistory,
  reject,
  serialiseStageHistory,
  type ApplicationDraftFields,
  type CompanyDraft,
  type JobDraft,
  type Validated,
} from '@lfg/core';

import {UNSAVED, type ApplicationEditState} from '@/app/application-edit-state';
import {
  EMPTY_CREATE_FORM,
  type CreateApplicationState,
} from '@/app/create-application-state';
import {createClient} from '@/lib/supabase/server';
import {currentUser} from '@/lib/supabase/user';
import type {Database} from '@lfg/database';
import type {SupabaseClient} from '@supabase/supabase-js';

type Client = SupabaseClient<Database>;

/** Postgres' unique-violation class, which here means "already saved". */
const UNIQUE_VIOLATION = '23505';

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

/**
 * Finds the company this role belongs to, or creates it.
 *
 * Deduplication keys on the domain when there is one, and never on the
 * display name alone, because "Stripe", "Stripe Inc" and "Stripe Payments
 * Europe" are one employer with one cached research profile
 * (supabase/migrations/20261105090000). Without a domain the name is all
 * there is, so the name is matched case-insensitively and then confirmed
 * exactly — `ilike` treats `%` and `_` as wildcards, and a company called
 * `C_` must not quietly attach a role to a company called `Co`.
 *
 * No query here filters by `user_id`. Row-level security does that, and a
 * query that filters in code is a query that can forget to (ADR-0002).
 */
async function findOrCreateCompany(
  supabase: Client,
  userId: string,
  company: CompanyDraft,
): Promise<Validated<string>> {
  const query = supabase.from('companies').select('id, name, regions');
  const match =
    company.domain === null
      ? await query.ilike('name', company.name)
      : await query.eq('domain', company.domain);

  if (match.error) {
    return reject([`Could not look up the company: ${match.error.message}`]);
  }

  const existing =
    company.domain === null
      ? match.data.find(
          row => row.name.toLowerCase() === company.name.toLowerCase(),
        )
      : match.data[0];

  if (existing !== undefined) {
    /* `regions` answers which of our markets this company hires in, so a
       first role in a new market is news about the company, not only about
       the job (supabase/migrations/20261105090000). */
    if (!existing.regions.includes(company.region)) {
      const {error} = await supabase
        .from('companies')
        .update({regions: [...existing.regions, company.region]})
        .eq('id', existing.id);
      if (error) {
        return reject([`Could not update the company: ${error.message}`]);
      }
    }
    return accept(existing.id);
  }

  const created = await supabase
    .from('companies')
    .insert({
      user_id: userId,
      name: company.name,
      domain: company.domain,
      regions: [company.region],
    })
    .select('id')
    .single();

  if (created.error) {
    return reject([`Could not save the company: ${created.error.message}`]);
  }
  return accept(created.data.id);
}

/** Creates the job row the application will point at. */
async function createJob(
  supabase: Client,
  userId: string,
  companyId: string,
  job: JobDraft,
): Promise<Validated<string>> {
  const created = await supabase
    .from('jobs')
    .insert({
      user_id: userId,
      company_id: companyId,
      title: job.title,
      region: job.region,
      work_mode: job.workMode,
      visa_sponsorship: job.sponsorship,
      visa_sponsorship_source: job.sponsorshipSource,
      source_url: job.sourceUrl,
    })
    .select('id')
    .single();

  if (created.error) {
    if (created.error.code === UNIQUE_VIOLATION) {
      /* One job per source URL per user: the same posting reached twice must
         not become two rows, and must not be parsed and paid for twice. */
      return reject(['You have already saved a role from that link.']);
    }
    return reject([`Could not save the role: ${created.error.message}`]);
  }
  return accept(created.data.id);
}

/**
 * Adds an application to the board.
 *
 * One form, three rows: an application points at a job and a job points at a
 * company (supabase/migrations/20261105093000), and nobody filling in a form
 * should have to know that. What each row contains is decided by
 * `parseApplicationDraft` in `packages/core`; this function only writes.
 *
 * The three inserts are not one transaction. Doing them in dependency order
 * means the failure modes are a company with no job, or a job with no
 * application — both harmless, both reused by the next attempt. The
 * impossible one is an application pointing at nothing, which is also the
 * only one that would lose a stage history. An atomic version needs a
 * database function, and that is worth doing when the JD parser starts
 * creating these rows without anyone watching.
 *
 * @returns `null` on success, or every reason the form was refused.
 */
export async function createApplication(
  previous: CreateApplicationState,
  formData: FormData,
): Promise<CreateApplicationState> {
  const attempt = previous.attempt + 1;
  const fields: ApplicationDraftFields = {
    company: readField(formData, 'company'),
    domain: readField(formData, 'domain'),
    role: readField(formData, 'role'),
    region: readField(formData, 'region'),
    workMode: readField(formData, 'workMode'),
    sponsorship: readField(formData, 'sponsorship'),
    sourceUrl: readField(formData, 'sourceUrl'),
    stage: readField(formData, 'stage'),
  };
  const refused = (problems: readonly string[]): CreateApplicationState => ({
    problem: problems.join(' '),
    fields,
    attempt,
  });

  const draft = parseApplicationDraft(fields);
  if (!draft.ok) {
    return refused(draft.problems);
  }

  const supabase = await createClient();
  const user = await currentUser();
  if (!user) {
    redirect('/login');
  }

  const company = await findOrCreateCompany(
    supabase,
    user.id,
    draft.value.company,
  );
  if (!company.ok) {
    return refused(company.problems);
  }

  const job = await createJob(
    supabase,
    user.id,
    company.value,
    draft.value.job,
  );
  if (!job.ok) {
    return refused(job.problems);
  }

  /* The clock is read here, at the boundary, and passed inwards (ADR-0003). */
  const history = appendStageEvent([], draft.value.stage, new Date());
  if (!history.ok) {
    return refused(history.problems);
  }

  const {error} = await supabase.from('applications').insert({
    user_id: user.id,
    job_id: job.value,
    stage_history: [...serialiseStageHistory(history.value)],
  });
  if (error) {
    return refused([`Could not add the application: ${error.message}`]);
  }

  revalidatePath('/');
  return {...EMPTY_CREATE_FORM, attempt};
}

/**
 * Moves an application to another stage.
 *
 * The move is an append. Nothing overwrites the latest entry, because
 * `stage_history` is the only record that the earlier stage ever happened and
 * every conversion rate in the product is computed from it
 * (docs/data-model.md). Whether the move is allowed at all is decided by
 * `appendStageEvent` in `packages/core`.
 *
 * @returns `null` on success, or why the move was refused.
 */
export async function moveApplication(
  formData: FormData,
): Promise<string | null> {
  const id = readField(formData, 'id').trim();
  const stage = readField(formData, 'stage').trim();

  if (id === '') {
    return 'The form did not say which application to move.';
  }
  if (!isApplicationStage(stage)) {
    return `"${stage}" is not a stage an application can be moved to.`;
  }

  const supabase = await createClient();

  /* Read, append, write. No `user_id` filter on either half: row-level
     security makes a row belonging to someone else invisible to the read and
     unaffected by the write (ADR-0002). */
  const current = await supabase
    .from('applications')
    .select('stage_history')
    .eq('id', id)
    .maybeSingle();

  if (current.error) {
    return `Could not read the application: ${current.error.message}`;
  }
  if (current.data === null) {
    return 'That application no longer exists.';
  }

  let existing;
  try {
    existing = parseStageHistory(current.data.stage_history);
  } catch (error) {
    /* A malformed history is a data fault, not a typo. It is reported rather
       than repaired: appending to a history we cannot read would make the
       damage permanent. */
    return `This application's history cannot be read: ${
      error instanceof Error ? error.message : String(error)
    }`;
  }

  const history = appendStageEvent(existing, stage, new Date());
  if (!history.ok) {
    return history.problems.join(' ');
  }

  const updated = await supabase
    .from('applications')
    .update({stage_history: [...serialiseStageHistory(history.value)]})
    .eq('id', id)
    .select('id');

  if (updated.error) {
    return `Could not move the application: ${updated.error.message}`;
  }
  if (updated.data.length === 0) {
    /* An update that matches no row returns success and changes nothing —
       which is exactly what row-level security does to someone else's row
       (supabase/tests/rls.test.ts). Saying so beats reporting a move that
       never happened. */
    return 'That application could not be moved.';
  }

  revalidatePath('/');
  return null;
}

/**
 * Saves the properties of an application that already exists.
 *
 * Two tables, because the properties belong to two rows: region, work mode,
 * sponsorship and the advert link describe the job, while the note and the
 * next action describe the application. Neither update filters by user id;
 * row-level security decides which rows these ids can reach (ADR-0002).
 *
 * The stage is not here. It is appended to `stage_history` by
 * {@link moveApplication}, which is the only way it ever changes.
 *
 * @returns The same state back, with every reason it was refused or nothing.
 */
export async function updateApplication(
  previous: ApplicationEditState,
  formData: FormData,
): Promise<ApplicationEditState> {
  const id = readField(formData, 'id').trim();
  if (id === '') {
    return {
      ...UNSAVED,
      problem: 'The form did not say which application to save.',
    };
  }

  const supabase = await createClient();

  /* The recorded sponsorship source is read from the row rather than taken
     from the form. It is a claim about where a fact came from, and a hidden
     field is not allowed to make that claim (CLAUDE.md rule 3). */
  const current = await supabase
    .from('applications')
    .select('job_id, jobs!inner ( company_id, visa_sponsorship_source )')
    .eq('id', id)
    .maybeSingle();

  if (current.error) {
    return {
      saved: previous.saved,
      problem: `Could not read the application: ${current.error.message}`,
    };
  }
  if (current.data === null) {
    return {
      saved: previous.saved,
      problem: 'That application no longer exists.',
    };
  }

  const edit = parseApplicationEdit({
    region: readField(formData, 'region'),
    workMode: readField(formData, 'workMode'),
    sponsorship: readField(formData, 'sponsorship'),
    sourceUrl: readField(formData, 'sourceUrl'),
    notes: readField(formData, 'notes'),
    companyNotes: readField(formData, 'companyNotes'),
    nextActionAt: readField(formData, 'nextActionAt'),
    recordedSponsorshipSource: current.data.jobs.visa_sponsorship_source ?? '',
  });
  if (!edit.ok) {
    return {saved: previous.saved, problem: edit.problems.join(' ')};
  }

  const job = await supabase
    .from('jobs')
    .update({
      region: edit.value.job.region,
      work_mode: edit.value.job.workMode,
      visa_sponsorship: edit.value.job.sponsorship,
      visa_sponsorship_source: edit.value.job.sponsorshipSource,
      source_url: edit.value.job.sourceUrl,
    })
    .eq('id', current.data.job_id)
    .select('id');

  if (job.error) {
    if (job.error.code === UNIQUE_VIOLATION) {
      return {
        saved: previous.saved,
        problem: 'You have already saved a role from that link.',
      };
    }
    return {
      saved: previous.saved,
      problem: `Could not save the role: ${job.error.message}`,
    };
  }

  /* The company note goes to the company, which is what makes it shared.
     Nothing writes it onto the application as well: two copies of one
     sentence is one sentence and one that is quietly going stale. */
  const company = await supabase
    .from('companies')
    .update({notes: edit.value.company.notes})
    .eq('id', current.data.jobs.company_id)
    .select('id');

  if (company.error) {
    return {
      saved: previous.saved,
      problem: `Could not save the company note: ${company.error.message}`,
    };
  }

  const application = await supabase
    .from('applications')
    .update({
      notes: edit.value.application.notes,
      next_action_at:
        edit.value.application.nextActionAt?.toISOString() ?? null,
    })
    .eq('id', id)
    .select('id');

  if (application.error) {
    return {
      saved: previous.saved,
      problem: `Could not save the notes: ${application.error.message}`,
    };
  }
  if (
    application.data.length === 0 ||
    job.data.length === 0 ||
    company.data.length === 0
  ) {
    /* An update that matches no row succeeds and changes nothing, which is
       what row-level security does to someone else's row. */
    return {
      saved: previous.saved,
      problem: 'That application could not be saved.',
    };
  }

  revalidatePath('/');
  return {problem: null, saved: previous.saved + 1};
}
