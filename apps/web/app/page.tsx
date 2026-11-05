import {redirect} from 'next/navigation';

import {
  formatLanguageRequirement,
  parseLanguageRequirement,
  parseStageHistory,
} from '@lfg/core';

import {signOut} from '@/app/actions';
import {Board, type BoardCard} from '@/app/board';
import {CreateApplication} from '@/app/create-application';
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

  const cards: readonly BoardCard[] = data.map(row => {
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
        <form action={signOut}>
          <button type="submit" className="linkish">
            Sign out
          </button>
        </form>
      </div>

      <CreateApplication />

      <Board cards={cards} now={now} />
    </main>
  );
}
