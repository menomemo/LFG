import {redirect} from 'next/navigation';

import {
  buildLanes,
  formatLanguageRequirement,
  longestWaitingFirst,
  parseLanguageRequirement,
  parseStageHistory,
  regionLabel,
  summariseBoard,
  summariseStage,
  type Region,
  type Sponsorship,
  type StageSummary,
  type WorkMode,
} from '@lfg/core';

import {signOut} from '@/app/actions';
import {CreateApplication} from '@/app/create-application';
import {MoveApplication} from '@/app/move-application';
import {createClient} from '@/lib/supabase/server';

/** One card on the board: a row, plus everything derived from its history. */
interface Card extends StageSummary {
  readonly id: string;
  readonly company: string;
  readonly role: string;
  readonly region: Region;
  readonly workMode: WorkMode | null;
  readonly sponsorship: Sponsorship;
  readonly language: string | null;
}

/** An ISO date, because dates in this project are absolute (CLAUDE.md). */
function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/**
 * The line above the board.
 *
 * Only counts that are not zero, except the total — "0 ghosted" is noise, and
 * the point of the line is that a number which is not zero gets noticed.
 */
function headline(totals: ReturnType<typeof summariseBoard>): string {
  const parts = [`${String(totals.total)} in the pipeline`];
  if (totals.active > 0) {
    parts.push(`${String(totals.active)} still moving`);
  }
  if (totals.ghosted > 0) {
    parts.push(`${String(totals.ghosted)} ghosted`);
  }
  if (totals.closed > 0) {
    parts.push(`${String(totals.closed)} closed`);
  }
  if (totals.unknown > 0) {
    parts.push(`${String(totals.unknown)} with no history`);
  }
  return parts.join(' · ');
}

/**
 * The application board.
 *
 * Browser → Next server component → Supabase with the user's token → row-level
 * security → back through `packages/core`, which derives everything shown. No
 * query here filters by user id, and that is the point: the database does it,
 * so a mistake in this file cannot leak another person's applications.
 *
 * Which lane a card sits in, how long it has waited and whether it has gone
 * quiet are all computed from `stage_history`. No column stores any of them,
 * which is why a reply un-ghosts an application without anything having to
 * remember to undo a flag (docs/data-model.md).
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

  const cards: readonly Card[] = data.map(row => {
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
      ...summariseStage(parseStageHistory(row.stage_history), now),
    };
  });

  const totals = summariseBoard(cards);

  /* Longest wait first, inside every lane: days in stage is the number the
     board exists to surface, and newest-first would bury exactly the
     applications that need a chase today. */
  const lanes = buildLanes(
    longestWaitingFirst(cards, card => card.daysInStage),
    card => card.stage,
  );

  return (
    <main className="board">
      <div className="row">
        <div>
          <h1>Applications</h1>
          <p className="sub">
            {headline(totals)} · signed in as {user.email}
          </p>
        </div>
        <form action={signOut}>
          <button type="submit" className="linkish">
            Sign out
          </button>
        </form>
      </div>

      <CreateApplication />

      {cards.length === 0 ? (
        <p className="empty">
          Nothing here yet. Add the first application above — company, role and
          market are all it needs.
        </p>
      ) : (
        <div className="lanes">
          {lanes.map(lane => (
            <section className="lane" key={lane.stage ?? 'unknown'}>
              <div className="lane-head">
                <span className="lane-name">{lane.stage ?? 'no history'}</span>
                <span className="lane-count">{lane.cards.length}</span>
              </div>

              <ul className="cards">
                {lane.cards.map(card => (
                  <li key={card.id}>
                    <p className="co">{card.company}</p>
                    <p className="role">{card.role}</p>
                    <p className="meta">
                      {regionLabel(card.region)}
                      {card.workMode === null ? '' : ` · ${card.workMode}`}
                      {card.sponsorship === 'yes' ? ' · sponsors' : ''}
                      {card.language === null ? '' : ` · ${card.language}`}
                    </p>
                    <p className={card.ghosted ? 'meta ghost' : 'meta'}>
                      {card.daysInStage === null
                        ? 'no recorded history'
                        : `${String(card.daysInStage)}d in stage`}
                      {card.ghosted ? ' · ghosted' : ''}
                      {card.appliedAt === null
                        ? ''
                        : ` · applied ${isoDate(card.appliedAt)}`}
                    </p>
                    <MoveApplication id={card.id} stage={card.stage} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
