import {redirect} from 'next/navigation';

import {
  currentStage,
  daysInCurrentStage,
  isGhosted,
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

  const {data, error} = await supabase
    .from('applications')
    .select('id, company_name, role_title, region, stage_history')
    .order('created_at', {ascending: false});

  if (error) {
    throw new Error(`Could not load applications: ${error.message}`);
  }

  /* The clock is read here, at the boundary, and passed inwards. Core never
     reads it, so everything it derives is reproducible (ADR-0003). */
  const now = new Date();

  const applications = data.map(row => {
    const history = parseStageHistory(row.stage_history);
    return {
      id: row.id,
      company: row.company_name,
      role: row.role_title,
      region: row.region,
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
