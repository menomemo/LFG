'use server';

import {revalidatePath} from 'next/cache';
import {redirect} from 'next/navigation';

import {
  accept,
  appendStageEvent,
  isApplicationStage,
  parseApplicationDraft,
  parseApplicationEdit,
  parseCompanyWatch,
  parseStageHistory,
  reject,
  serialiseStageHistory,
  type ApplicationDraftFields,
  type CompanyDraft,
  type JobDraft,
  type Region,
  type Validated,
} from '@lfg/core';

import {UNSAVED, type ApplicationEditState} from '@/app/application-edit-state';
import {
  EMPTY_CREATE_FORM,
  type CreateApplicationState,
} from '@/app/create-application-state';
import {
  EMPTY_WATCH_FORM,
  type WatchCompanyState,
} from '@/app/watch-company-state';
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
/** The company columns every lookup here needs. */
const COMPANY_COLUMNS = 'id, name, regions';

interface CompanyRow {
  readonly id: string;
  readonly name: string;
  readonly regions: readonly Region[];
}

/**
 * Finds the company a display name refers to, or reports that there is none.
 *
 * Kept in one function because of the subtlety in the middle of it: `ilike`
 * treats `%` and `_` as wildcards, so the pattern match is only a prefilter
 * and the exact comparison after it is the actual rule. A company called
 * `C_` must not attach a role to a company called `Co`. Both the create form
 * and the watch form reach this, and a second copy would be a second chance
 * to forget the confirmation.
 */
async function companyByName(
  supabase: Client,
  name: string,
): Promise<Validated<CompanyRow | null>> {
  const {data, error} = await supabase
    .from('companies')
    .select(COMPANY_COLUMNS)
    .ilike('name', name);

  if (error) {
    return reject([`Could not look up the company: ${error.message}`]);
  }
  const found = data.find(row => row.name.toLowerCase() === name.toLowerCase());
  return accept(found ?? null);
}

async function findOrCreateCompany(
  supabase: Client,
  userId: string,
  company: CompanyDraft,
): Promise<Validated<string>> {
  let existing: CompanyRow | undefined;

  if (company.domain === null) {
    const byName = await companyByName(supabase, company.name);
    if (!byName.ok) {
      return byName;
    }
    existing = byName.value ?? undefined;
  } else {
    const match = await supabase
      .from('companies')
      .select(COMPANY_COLUMNS)
      .eq('domain', company.domain);
    if (match.error) {
      return reject([`Could not look up the company: ${match.error.message}`]);
    }
    existing = match.data[0];
  }

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

/**
 * Starts watching a company's ATS board.
 *
 * ADR-0010: a company row carrying both `ats_type` and `ats_slug` is one the
 * poller reads. There is no separate watch list and no `watch` flag — this
 * action writes those two columns onto the company, and that is the whole
 * subscription.
 *
 * It reuses the company if there is one, which is the point of going through
 * {@link companyByName}: watching a board for an employer already on the
 * board must not create a second employer with its own research profile and
 * its own notes.
 *
 * A new company is created with no markets. `companies.regions` answers
 * which of our markets this employer hires in, and watching a board is not
 * evidence about that — the postings the poll finds are. An empty array here
 * is "not known yet", and the first application fills it in
 * (CLAUDE.md rule 8).
 */
export async function watchCompany(
  previous: WatchCompanyState,
  formData: FormData,
): Promise<WatchCompanyState> {
  const attempt = previous.attempt + 1;
  const fields = {
    name: readField(formData, 'name'),
    ats: readField(formData, 'ats'),
    board: readField(formData, 'board'),
  };
  const refused = (problems: readonly string[]): WatchCompanyState => ({
    problem: problems.join(' '),
    fields,
    attempt,
    watching: null,
  });

  const parsed = parseCompanyWatch(fields);
  if (!parsed.ok) {
    return refused(parsed.problems);
  }
  const {name, ats, slug} = parsed.value;

  const supabase = await createClient();
  const user = await currentUser();
  if (!user) {
    redirect('/login');
  }

  const existing = await companyByName(supabase, name);
  if (!existing.ok) {
    return refused(existing.problems);
  }

  if (existing.value !== null) {
    /* `ats_checked_at` is deliberately not cleared. It records when this
       board was last read, and pointing the row at a different slug does not
       un-read it — what it means afterwards is "last looked, under whatever
       settings were current then", which is the truth. */
    const {error} = await supabase
      .from('companies')
      .update({ats_type: ats, ats_slug: slug})
      .eq('id', existing.value.id)
      .select('id');
    if (error) {
      return refused([`Could not save the board: ${error.message}`]);
    }
  } else {
    const {error} = await supabase.from('companies').insert({
      user_id: user.id,
      name,
      ats_type: ats,
      ats_slug: slug,
      regions: [],
    });
    if (error) {
      return refused([`Could not save the company: ${error.message}`]);
    }
  }

  revalidatePath('/');
  return {...EMPTY_WATCH_FORM, attempt, watching: name};
}

/**
 * Stops watching a company's board.
 *
 * Both columns are cleared together, because either one alone is a row that
 * looks half-configured and the poller's own condition is that both are
 * present. The company itself stays: it may have applications, notes and
 * research hanging off it, none of which are about its board.
 */
export async function unwatchCompany(
  formData: FormData,
): Promise<string | null> {
  const id = readField(formData, 'companyId').trim();
  if (id === '') {
    return 'The form did not say which company to stop watching.';
  }

  const supabase = await createClient();
  const {data, error} = await supabase
    .from('companies')
    .update({ats_type: null, ats_slug: null})
    .eq('id', id)
    .select('id');

  if (error) {
    return `Could not stop watching: ${error.message}`;
  }
  if (data.length === 0) {
    /* An update matching no row succeeds and changes nothing, which is what
       row-level security does to someone else's row. */
    return 'That company could not be changed.';
  }

  revalidatePath('/');
  return null;
}

/**
 * Puts a discovered role on the board.
 *
 * The job row already exists — the poll wrote it (ADR-0010) — so this writes
 * only the application, at `saved`, which is what a role you have not yet
 * applied for is. Nothing about the job is changed: the title, link and
 * market came from the company's own board and are not improved by being
 * copied.
 *
 * The existence check is not belt-and-braces. The lead list is a snapshot,
 * and two clicks on one card, or a click on a card the list still shows after
 * another tab adopted it, would otherwise be two applications to one job —
 * and the second one is invisible on a board that shows one card per
 * application.
 */
export async function adoptLead(formData: FormData): Promise<string | null> {
  const jobId = readField(formData, 'jobId').trim();
  if (jobId === '') {
    return 'The form did not say which lead to add.';
  }

  const supabase = await createClient();
  const user = await currentUser();
  if (!user) {
    redirect('/login');
  }

  const already = await supabase
    .from('applications')
    .select('id')
    .eq('job_id', jobId)
    .limit(1);
  if (already.error) {
    return `Could not check the lead: ${already.error.message}`;
  }
  if (already.data.length > 0) {
    return 'That role is already on the board.';
  }

  /* The clock is read here, at the boundary, and passed inwards (ADR-0003). */
  const history = appendStageEvent([], 'saved', new Date());
  if (!history.ok) {
    return history.problems.join(' ');
  }

  const {error} = await supabase.from('applications').insert({
    user_id: user.id,
    job_id: jobId,
    stage_history: [...serialiseStageHistory(history.value)],
  });
  if (error) {
    return `Could not add the lead: ${error.message}`;
  }

  revalidatePath('/');
  return null;
}

/**
 * Dismisses a lead, or brings it back.
 *
 * One action for both directions so that undoing is the same code path as
 * doing, rather than a second one that can disagree with it.
 *
 * The row is marked, never deleted. The poller deduplicates on
 * `(user_id, source_url)`, so a deleted lead is one the next run cannot tell
 * it has already shown — and the posting the author has decided about twice
 * would be the one that keeps coming back
 * (supabase/migrations/20261111150000).
 */
export async function setLeadDismissed(
  formData: FormData,
): Promise<string | null> {
  const jobId = readField(formData, 'jobId').trim();
  if (jobId === '') {
    return 'The form did not say which lead to change.';
  }
  const dismissed = readField(formData, 'dismissed') === 'true';

  const supabase = await createClient();
  const {data, error} = await supabase
    .from('jobs')
    .update({dismissed_at: dismissed ? new Date().toISOString() : null})
    .eq('id', jobId)
    .select('id');

  if (error) {
    return `Could not change the lead: ${error.message}`;
  }
  if (data.length === 0) {
    return 'That lead could not be changed.';
  }

  revalidatePath('/');
  return null;
}
