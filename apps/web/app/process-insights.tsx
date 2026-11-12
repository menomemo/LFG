'use client';

import {useRouter} from 'next/navigation';
import {useState, useTransition} from 'react';

import {browserClient, type SupabasePublicConfig} from '@/lib/supabase/browser';
import {explainInvoke, isInvokeResult} from '@/lib/supabase/invoke';

interface ProcessInsightsProps {
  readonly config: SupabasePublicConfig;
  /** How many captures have no summary. Zero hides the whole control. */
  readonly unprocessed: number;
}

/** What happened to one insight, as `tag-insights` reports it. */
interface InsightResult {
  readonly id: string;
  readonly excerpt: string;
  /**
   * Filed, declined, or failed.
   *
   * Declined is the model saying there is nothing in this capture to
   * summarise, which is a correct answer and not a fault. Keeping it apart
   * from a failure is the difference between "two of these need a line of
   * context" and "two of these went wrong".
   */
  readonly outcome: 'filed' | 'declined' | 'failed';
  readonly problem: string | null;
}

/** What `tag-insights` answers with. */
interface TagResult {
  readonly processed: number;
  readonly results: readonly InsightResult[];
  readonly note?: string;
}

/** Shape only; the function validates its own answer. */
function isTagResult(value: unknown): value is TagResult {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const {processed, results} = value as Record<string, unknown>;
  return typeof processed === 'number' && Array.isArray(results);
}

/** The sentence, and the rows it refuses to fold into a number. */
interface TagSummary {
  readonly sentence: string;
  /** Everything left raw — declined and failed alike, each saying which. */
  readonly untouched: readonly InsightResult[];
}

/**
 * Says what the batch did.
 *
 * Each outcome is counted separately and every untouched capture is named.
 * A run that filed one of ten and reported "1 insight filed" would be true
 * and useless — the nine are the information. The last time a total was
 * allowed to stand in for the outcomes behind it, three boards had failed
 * and the screen said everything was fine (docs/engineering-log.md §3.4).
 *
 * Declined and failed are counted apart for the same reason one level down:
 * a capture the model correctly had nothing to say about is not a fault, and
 * reporting it as one sends the person looking for a bug.
 */
function summarise(result: TagResult): TagSummary {
  if (result.note !== undefined) {
    return {sentence: result.note, untouched: []};
  }
  const declined = result.results.filter(entry => entry.outcome === 'declined');
  const failed = result.results.filter(entry => entry.outcome === 'failed');

  const parts = [
    result.processed === 1
      ? '1 insight filed'
      : `${result.processed.toString()} insights filed`,
  ];
  if (declined.length > 0) {
    parts.push(`${declined.length.toString()} had nothing to summarise yet`);
  }
  if (failed.length > 0) {
    parts.push(`${failed.length.toString()} could not be read`);
  }

  const untouched = [...declined, ...failed];
  return {
    sentence: `${parts.join(', ')}${untouched.length === 0 ? '.' : ':'}`,
    untouched,
  };
}

/**
 * The button that reads what has been captured.
 *
 * ADR-0011: processing happens when the person asks, over the captures with
 * no summary, a fixed number at a time. The button says how many are
 * waiting rather than how many it will do, because the ceiling is the
 * function's and a person who sees "40 waiting" and gets ten filed has
 * learned the right thing about the cost.
 *
 * It does nothing when there is nothing to process. A control that is always
 * there and usually pointless is a control people stop reading.
 */
export function ProcessInsights({config, unprocessed}: ProcessInsightsProps) {
  const router = useRouter();
  const [running, startRun] = useTransition();
  const [done, setDone] = useState<TagSummary | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  if (unprocessed === 0) {
    return null;
  }

  function run() {
    setProblem(null);
    setDone(null);
    startRun(async () => {
      const supabase = browserClient(config);
      const response: unknown = await supabase.functions.invoke(
        'tag-insights',
        {body: {}},
      );
      const data = isInvokeResult(response) ? response.data : null;
      if (!isTagResult(data)) {
        setProblem(
          await explainInvoke(
            response,
            'Nothing was processed, and nothing was changed.',
          ),
        );
        return;
      }
      setDone(summarise(data));
      /* The function wrote rows the server component has already rendered
         without. No server action was involved, so nothing revalidated and
         the refresh is explicit. */
      router.refresh();
    });
  }

  return (
    <div className="process">
      <button type="button" onClick={run} disabled={running}>
        {running
          ? 'Reading…'
          : `Read and tag ${unprocessed.toString()} capture${unprocessed === 1 ? '' : 's'}`}
      </button>

      {problem === null ? null : <p className="error">{problem}</p>}

      {done === null ? null : (
        <>
          <p className="sub">{done.sentence}</p>
          {done.untouched.length === 0 ? null : (
            <ul className="failures">
              {done.untouched.map(entry => (
                <li key={entry.id}>
                  “{entry.excerpt}…” — {entry.problem}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
