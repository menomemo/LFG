'use client';

import {useRouter} from 'next/navigation';
import {useActionState, useState, useTransition} from 'react';

import {POLLABLE_ATS, regionLabel, type Region} from '@lfg/core';

import {
  adoptLead,
  setLeadDismissed,
  unwatchCompany,
  watchCompany,
} from '@/app/actions';
import {EMPTY_WATCH_FORM} from '@/app/watch-company-state';
import {browserClient, type SupabasePublicConfig} from '@/lib/supabase/browser';
import {explainInvoke, isInvokeResult} from '@/lib/supabase/invoke';

/** A company whose board is being read, as the page hands it over. */
export interface WatchedCompany {
  readonly id: string;
  readonly name: string;
  readonly ats: string;
  readonly slug: string;
  /** Null means the board has never been read, which is not "nothing found". */
  readonly checkedAt: Date | null;
}

/** A role a poll found and nobody has applied for yet. */
export interface Lead {
  readonly id: string;
  readonly title: string;
  readonly company: string;
  readonly region: Region;
  readonly sourceUrl: string | null;
  /**
   * When the company first published it, if the provider said.
   *
   * The reason to poll at all is that this leads the aggregators. Showing it
   * is what makes the claim checkable instead of a belief.
   */
  readonly postedAt: Date | null;
  readonly dismissed: boolean;
}

interface DiscoverProps {
  readonly config: SupabasePublicConfig;
  readonly watched: readonly WatchedCompany[];
  readonly leads: readonly Lead[];
  /** Read once on the server and passed in, so a render is reproducible. */
  readonly now: Date;
}

/** One board's outcome, as `poll-boards` reports it. */
interface CompanyResult {
  readonly company: string;
  readonly added: number;
  readonly discarded: number;
  readonly problem?: string;
}

/** What `poll-boards` answers with. */
interface PollResult {
  readonly results: readonly CompanyResult[];
  readonly added: number;
  readonly checked: number;
  readonly note?: string;
}

/** Shape only; the function validates its own answer. */
function isPollResult(value: unknown): value is PollResult {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const {results, added, checked} = value as Record<string, unknown>;
  return (
    Array.isArray(results) &&
    typeof added === 'number' &&
    typeof checked === 'number'
  );
}

const MS_PER_DAY = 86_400_000;

/**
 * How long ago something happened, in whole days.
 *
 * Presentation, which is why it is here rather than in `core`: no decision
 * anywhere turns on this string. The one thing it must not do is round a
 * null into a number — "never checked" and "checked today" are the pair this
 * column exists to tell apart (CLAUDE.md rule 8).
 */
function daysAgo(when: Date | null, now: Date): string {
  if (when === null) {
    return 'never checked';
  }
  const days = Math.floor((now.getTime() - when.getTime()) / MS_PER_DAY);
  if (days <= 0) {
    return 'checked today';
  }
  if (days === 1) {
    return 'checked yesterday';
  }
  return `checked ${days.toString()} days ago`;
}

/** The same, for a posting's publication date. */
function postedLabel(postedAt: Date | null, now: Date): string | null {
  if (postedAt === null) {
    return null;
  }
  const days = Math.floor((now.getTime() - postedAt.getTime()) / MS_PER_DAY);
  if (days <= 0) {
    return 'posted today';
  }
  if (days === 1) {
    return 'posted yesterday';
  }
  return `posted ${days.toString()}d ago`;
}

/** How a provider is named on screen. */
const ATS_LABELS: Record<string, string> = {
  greenhouse: 'Greenhouse',
  lever: 'Lever',
  ashby: 'Ashby',
};

/** What a poll is worth telling the person afterwards. */
interface PollSummary {
  readonly sentence: string;
  /** The boards that produced nothing because they failed, with the reason. */
  readonly failures: readonly CompanyResult[];
}

/**
 * Sums a poll into what is worth reading afterwards.
 *
 * Two parts, because the first version of this was one sentence and it lied
 * by omission the first time it ran: "4 boards read, nothing new" was shown
 * while three of the four had failed outright, one of them on a slug that was
 * simply wrong. A board that could not be read is not a company that is not
 * hiring, and a summary that adds them together is the silent failure this
 * whole feature is supposed to replace (CLAUDE.md rule 8).
 *
 * The discarded count stays in the sentence for the same reason. A filter
 * that is too narrow finds nothing and looks exactly like a quiet market, and
 * that number is the only thing that tells the two apart
 * (packages/core/src/jobs/board.ts).
 */
function summarise(result: PollResult): PollSummary {
  if (result.note !== undefined) {
    return {sentence: result.note, failures: []};
  }
  const failures = result.results.filter(entry => entry.problem !== undefined);
  const read = result.checked - failures.length;
  const discarded = result.results.reduce(
    (total, entry) => total + entry.discarded,
    0,
  );
  const boards = `${read.toString()} board${read === 1 ? '' : 's'}`;
  const found =
    result.added === 0
      ? 'nothing new'
      : `${result.added.toString()} new role${result.added === 1 ? '' : 's'}`;
  const failed =
    failures.length === 0
      ? ''
      : ` ${failures.length.toString()} could not be read at all:`;
  return {
    sentence:
      `${boards} read, ${found}. ` +
      `${discarded.toString()} postings did not match and were not stored.` +
      failed,
    failures,
  };
}

/**
 * Watching company boards, and what they turned up.
 *
 * This is the half of ADR-0010 a person touches. The board of a company that
 * is hiring carries the role before an aggregator ingests it, so the thing
 * worth automating is reading boards — and the thing that cannot be
 * automated is deciding which companies to read. That list is typed in here.
 *
 * The poll runs when the button is pressed, with the signed-in person's own
 * token, which is why it is a `functions.invoke` from the browser rather than
 * a schedule: a schedule has no user and would need the service key
 * (ADR-0002), and the filter wants tuning against real boards before
 * anything runs unattended. docs/roadmap.md records that cut.
 *
 * Nothing here applies for anything. A lead is a `jobs` row with no
 * application; it becomes an application when the person presses the button
 * that says so (CLAUDE.md rule 7).
 */
export function Discover({config, watched, leads, now}: DiscoverProps) {
  const router = useRouter();
  const [state, formAction, saving] = useActionState(
    watchCompany,
    EMPTY_WATCH_FORM,
  );
  const [polling, startPoll] = useTransition();
  const [polled, setPolled] = useState<PollSummary | null>(null);
  const [pollProblem, setPollProblem] = useState<string | null>(null);
  const [problems, setProblems] = useState<Record<string, string>>({});
  const [showDismissed, setShowDismissed] = useState(false);
  const [acting, startAction] = useTransition();

  const open = leads.filter(lead => !lead.dismissed);
  const dismissed = leads.filter(lead => lead.dismissed);

  /** Runs one of the per-row actions and keeps its message against the row. */
  function act(key: string, run: () => Promise<string | null>) {
    startAction(async () => {
      const problem = await run();
      setProblems(previous => {
        /* Rebuilt rather than deleted from: a dynamic `delete` is banned by
           lint, and rebuilding is also what keeps a stale message from one
           row surviving on another. */
        const next: Record<string, string> = {};
        for (const [id, message] of Object.entries(previous)) {
          if (id !== key) {
            next[id] = message;
          }
        }
        if (problem !== null) {
          next[key] = problem;
        }
        return next;
      });
    });
  }

  function check() {
    setPollProblem(null);
    setPolled(null);
    startPoll(async () => {
      const supabase = browserClient(config);
      const response: unknown = await supabase.functions.invoke('poll-boards', {
        body: {},
      });
      const data = isInvokeResult(response) ? response.data : null;
      if (!isPollResult(data)) {
        setPollProblem(
          await explainInvoke(
            response,
            'The boards could not be checked. Nothing was stored.',
          ),
        );
        return;
      }
      setPolled(summarise(data));
      /* The function wrote rows the server component has already rendered
         without. A server action would have revalidated; this call did not
         go through one, so the refresh is explicit. */
      router.refresh();
    });
  }

  return (
    <details className="discover">
      <summary>
        Company boards
        {open.length === 0 ? '' : ` · ${open.length.toString()} new`}
      </summary>

      <p className="note">
        A company publishes to its own board first; the aggregators ingest
        afterwards. Add the boards you want read, then read them.
      </p>

      <form action={formAction} key={state.attempt}>
        <div className="fields">
          <label>
            Company
            <input
              name="name"
              required
              autoComplete="off"
              defaultValue={state.fields.name}
            />
          </label>

          <label>
            Board provider
            <select name="ats" defaultValue={state.fields.ats} required>
              <option value="">choose a provider</option>
              {POLLABLE_ATS.map(ats => (
                <option key={ats} value={ats}>
                  {ATS_LABELS[ats] ?? ats}
                </option>
              ))}
            </select>
          </label>

          <label className="wide">
            Board name or link
            <input
              name="board"
              required
              autoComplete="off"
              placeholder="monzo, or https://jobs.lever.co/deliveroo"
              defaultValue={state.fields.board}
            />
          </label>
        </div>

        <button type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Watch this board'}
        </button>

        {state.problem === null ? null : (
          <p className="error">{state.problem}</p>
        )}
        {state.watching === null ? null : (
          <p className="note">
            {state.watching}’s board is now watched. Check it below.
          </p>
        )}
      </form>

      {watched.length === 0 ? (
        <p className="empty">
          No boards yet. Nothing can be found until one is added.
        </p>
      ) : (
        <>
          <ul className="watched">
            {watched.map(company => (
              <li key={company.id}>
                <span className="co">{company.name}</span>
                <span className="meta">
                  {ATS_LABELS[company.ats] ?? company.ats} · {company.slug} ·{' '}
                  {daysAgo(company.checkedAt, now)}
                </span>
                <button
                  type="button"
                  className="linkish"
                  disabled={acting}
                  onClick={() => {
                    const data = new FormData();
                    data.set('companyId', company.id);
                    act(company.id, () => unwatchCompany(data));
                  }}
                >
                  Stop watching
                </button>
                {problems[company.id] === undefined ? null : (
                  <p className="error">{problems[company.id]}</p>
                )}
              </li>
            ))}
          </ul>

          <button type="button" onClick={check} disabled={polling}>
            {polling ? 'Reading the boards…' : 'Check these boards now'}
          </button>

          {pollProblem === null ? null : <p className="error">{pollProblem}</p>}
          {polled === null ? null : (
            <>
              <p className="note">{polled.sentence}</p>
              {polled.failures.length === 0 ? null : (
                <ul className="failures">
                  {polled.failures.map(failure => (
                    <li key={failure.company}>
                      {failure.company} — {failure.problem}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </>
      )}

      {open.length === 0 ? null : (
        <>
          <h2 className="leads-head">
            Found, not applied for ({open.length.toString()})
          </h2>
          <ul className="leads">
            {open.map(lead => (
              <li key={lead.id}>
                <p className="role">
                  {lead.sourceUrl === null ? (
                    lead.title
                  ) : (
                    <a href={lead.sourceUrl} target="_blank" rel="noreferrer">
                      {lead.title}
                    </a>
                  )}
                </p>
                <p className="meta">
                  {lead.company} · {regionLabel(lead.region)}
                  {postedLabel(lead.postedAt, now) === null
                    ? ''
                    : ` · ${postedLabel(lead.postedAt, now) ?? ''}`}
                </p>
                <div className="lead-actions">
                  <button
                    type="button"
                    disabled={acting}
                    onClick={() => {
                      const data = new FormData();
                      data.set('jobId', lead.id);
                      act(lead.id, () => adoptLead(data));
                    }}
                  >
                    Add to the board
                  </button>
                  <button
                    type="button"
                    className="linkish"
                    disabled={acting}
                    onClick={() => {
                      const data = new FormData();
                      data.set('jobId', lead.id);
                      data.set('dismissed', 'true');
                      act(lead.id, () => setLeadDismissed(data));
                    }}
                  >
                    Not interested
                  </button>
                </div>
                {problems[lead.id] === undefined ? null : (
                  <p className="error">{problems[lead.id]}</p>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {dismissed.length === 0 ? null : (
        <>
          <button
            type="button"
            className="linkish"
            onClick={() => {
              setShowDismissed(previous => !previous);
            }}
          >
            {showDismissed ? 'Hide' : 'Show'} {dismissed.length.toString()}{' '}
            passed over
          </button>

          {!showDismissed ? null : (
            <ul className="leads dismissed">
              {dismissed.map(lead => (
                <li key={lead.id}>
                  <p className="role">{lead.title}</p>
                  <p className="meta">
                    {lead.company} · {regionLabel(lead.region)}
                  </p>
                  <button
                    type="button"
                    className="linkish"
                    disabled={acting}
                    onClick={() => {
                      const data = new FormData();
                      data.set('jobId', lead.id);
                      data.set('dismissed', 'false');
                      act(lead.id, () => setLeadDismissed(data));
                    }}
                  >
                    Bring it back
                  </button>
                  {problems[lead.id] === undefined ? null : (
                    <p className="error">{problems[lead.id]}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </details>
  );
}
