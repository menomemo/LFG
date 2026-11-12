import Link from 'next/link';
import {redirect} from 'next/navigation';

import {
  formatLanguageRequirement,
  parseLanguageRequirement,
  parseStageHistory,
} from '@lfg/core';

import {signOut} from '@/app/actions';
import {Board, type BoardCard} from '@/app/board';
import {CreateApplication} from '@/app/create-application';
import {Discover, type Lead, type WatchedCompany} from '@/app/discover';
import {supabaseConfig} from '@/lib/env';
import {createClient} from '@/lib/supabase/server';
import {currentUser} from '@/lib/supabase/user';

/**
 * The application board.
 *
 * Browser → Next server component → Supabase with the user's token → row-level
 * security → back through `packages/core`, which derives everything shown. No
 * query here filters by user id, and that is the point: the database does it,
 * so a mistake in this file cannot leak another person's applications.
 *
 * This file reads; `board.tsx` places and moves. The split is what lets a
 * move appear before the server has answered, and the history is handed over
 * whole rather than as a stage, because every number on a card is derived
 * from it (docs/data-model.md).
 */
export default async function BoardPage() {
  const user = await currentUser();
  if (!user) {
    redirect('/login');
  }

  const supabase = await createClient();

  /* Company, title and region are read through the job rather than copied
     onto the application, so there is one place for each of them to be wrong
     (supabase/migrations/20261105093000). The nested select is one round trip:
     PostgREST resolves the foreign keys server-side, and row-level security
     applies to every table it touches, not just the outermost one. */
  const {data, error} = await supabase
    .from('applications')
    .select(
      `id,
       stage_history,
       notes,
       next_action_at,
       created_at,
       resume_versions ( region_profile, locale ),
       jobs!inner (
         title,
         region,
         work_mode,
         visa_sponsorship,
         visa_sponsorship_source,
         source_url,
         language_required,
         companies!inner ( id, name, domain, notes )
       )`,
    )
    .order('created_at', {ascending: false});

  if (error) {
    throw new Error(`Could not load applications: ${error.message}`);
  }

  /* The two reads that board polling needs, beside the board's own.
     Separate queries rather than one nested select because they answer
     different questions and neither is a property of an application:
     which boards are watched, and which discovered roles have not become
     one (ADR-0010). Neither filters by user id -- row-level security does
     (ADR-0002). */
  const watchedRows = await supabase
    .from('companies')
    .select('id, name, ats_type, ats_slug, ats_checked_at')
    .not('ats_type', 'is', null)
    .not('ats_slug', 'is', null)
    .order('name');

  if (watchedRows.error) {
    throw new Error(
      `Could not load watched boards: ${watchedRows.error.message}`,
    );
  }

  /* A lead is a shape, not a table: a job with no application. The nested
     `applications ( id )` is how that is asked -- PostgREST has no
     "where not exists" -- and the emptiness is checked here rather than
     being trusted to a filter that would silently include a job whose
     application belongs to the relation but not to the array. */
  const leadRows = await supabase
    .from('jobs')
    .select(
      `id,
       title,
       region,
       source_url,
       posted_at,
       dismissed_at,
       created_at,
       companies!inner ( name ),
       applications ( id )`,
    )
    .order('posted_at', {ascending: false, nullsFirst: false})
    .order('created_at', {ascending: false});

  if (leadRows.error) {
    throw new Error(`Could not load found roles: ${leadRows.error.message}`);
  }

  const watched: readonly WatchedCompany[] = watchedRows.data.map(row => ({
    id: row.id,
    name: row.name,
    /* Non-null without a fallback, and not by assumption: the query's own
       `.not(..., 'is', null)` filters narrow these in the generated types,
       so lint refuses a default here as unreachable. */
    ats: row.ats_type,
    slug: row.ats_slug,
    checkedAt:
      row.ats_checked_at === null ? null : new Date(row.ats_checked_at),
  }));

  const leads: readonly Lead[] = leadRows.data
    .filter(row => row.applications.length === 0)
    .map(row => ({
      id: row.id,
      title: row.title,
      company: row.companies.name,
      region: row.region,
      sourceUrl: row.source_url,
      postedAt: row.posted_at === null ? null : new Date(row.posted_at),
      dismissed: row.dismissed_at !== null,
    }));

  const cards: readonly BoardCard[] = data.map(row => {
    const requirement = parseLanguageRequirement(row.jobs.language_required);
    const resume = row.resume_versions;
    return {
      id: row.id,
      company: row.jobs.companies.name,
      companyId: row.jobs.companies.id,
      companyDomain: row.jobs.companies.domain,
      /* Read through the relation, not copied onto the application. Every
         application to this employer reads the same row, which is the whole
         point of it being on `companies` (supabase/migrations/20261106140000). */
      companyNotes: row.jobs.companies.notes,
      role: row.jobs.title,
      region: row.jobs.region,
      workMode: row.jobs.work_mode,
      sponsorship: row.jobs.visa_sponsorship,
      sponsorshipSource: row.jobs.visa_sponsorship_source,
      sourceUrl: row.jobs.source_url,
      language:
        requirement === null ? null : formatLanguageRequirement(requirement),
      notes: row.notes,
      nextActionAt:
        row.next_action_at === null ? null : new Date(row.next_action_at),
      createdAt: new Date(row.created_at),
      /* Null until Phase 2's `resume-tailor` creates one. The detail view
         says so rather than showing an empty cell: a résumé nobody has
         tailored yet is unknown, not none (CLAUDE.md rule 8). */
      resume:
        resume === null ? null : `${resume.region_profile} · ${resume.locale}`,
      history: parseStageHistory(row.stage_history),
    };
  });

  /* The clock is read here, at the boundary, and passed inwards. Core never
     reads it, so everything it derives is reproducible (ADR-0003) — and the
     board uses this same instant for an optimistic move, rather than reading
     a second clock in the browser. */
  const now = new Date();

  return (
    <main className="board">
      <div className="row">
        <div>
          <h1>Applications</h1>
          <p className="sub signed-in">signed in as {user.email}</p>
        </div>
        <nav>
          <Link className="linkish" href="/insights">
            Insights
          </Link>
          <form action={signOut}>
            <button type="submit" className="linkish">
              Sign out
            </button>
          </form>
        </nav>
      </div>

      <CreateApplication config={supabaseConfig()} />

      <Discover
        config={supabaseConfig()}
        watched={watched}
        leads={leads}
        now={now}
      />

      <Board cards={cards} now={now} />
    </main>
  );
}
