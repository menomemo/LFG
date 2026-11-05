import {redirect} from 'next/navigation';

import {
  currentStage,
  daysInCurrentStage,
  isGhosted,
  formatLanguageRequirement,
  parseLanguageRequirement,
  parseStageHistory,
} from '@lfg/core';

import {signOut} from '@/app/actions';
import {createClient} from '@/lib/supabase/server';

/**
 * The walking skeleton: one page, through every layer.
 *
 * Browser → Next server component → Supabase with the user's token → row-level
 * security → back through packages/core, which derives what is displayed. No
 * query here filters by user id, and that is the point: the database does it,
 * so a mistake in this file cannot leak another person's applications.
 */
export default async function BoardPage() {
  const supabase = await createClient();

  const {
    data: {user},
  } = await supabase.auth.getUser();
  if (!user) {
    redirect('/login');
  }

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
       jobs!inner (
         title,
         region,
         work_mode,
         visa_sponsorship,
         language_required,
         companies!inner ( name )
       )`,
    )
    .order('created_at', {ascending: false});

  if (error) {
    throw new Error(`Could not load applications: ${error.message}`);
  }

  /* The clock is read here, at the boundary, and passed inwards. Core never
     reads it, so everything it derives is reproducible (ADR-0003). */
  const now = new Date();

  const applications = data.map(row => {
    const history = parseStageHistory(row.stage_history);
    const requirement = parseLanguageRequirement(row.jobs.language_required);
    return {
      id: row.id,
      company: row.jobs.companies.name,
      role: row.jobs.title,
      region: row.jobs.region,
      workMode: row.jobs.work_mode,
      sponsorship: row.jobs.visa_sponsorship,
      language:
        requirement === null ? null : formatLanguageRequirement(requirement),
      stage: currentStage(history),
      days: daysInCurrentStage(history, now),
      ghosted: isGhosted(history, now),
    };
  });

  return (
    <main>
      <div className="row">
        <div>
          <h1>Applications</h1>
          <p className="sub">
            {applications.length} in the pipeline · signed in as {user.email}
          </p>
        </div>
        <form action={signOut}>
          <button type="submit" className="linkish">
            Sign out
          </button>
        </form>
      </div>

      {applications.length === 0 ? (
        <p className="empty">
          Nothing here yet. Applications appear once they are added — the board
          and the create flow arrive later in Phase 1.
        </p>
      ) : (
        <ul>
          {applications.map(application => (
            <li key={application.id}>
              <div className="row">
                <span className="co">{application.company}</span>
                <span className="stage">{application.stage ?? 'unknown'}</span>
              </div>
              <div className="row">
                <span className="role">
                  {application.role} · {application.region.toUpperCase()}
                  {application.workMode === null
                    ? ''
                    : ` · ${application.workMode}`}
                  {application.sponsorship === 'yes' ? ' · sponsors' : ''}
                  {application.language === null
                    ? ''
                    : ` · ${application.language}`}
                </span>
                <span className={application.ghosted ? 'meta ghost' : 'meta'}>
                  {application.days === null
                    ? 'no history'
                    : `${String(application.days)}d in stage`}
                  {application.ghosted ? ' · ghosted' : ''}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
