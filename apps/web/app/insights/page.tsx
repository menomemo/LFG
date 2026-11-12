import Link from 'next/link';
import {redirect} from 'next/navigation';

import {
  insightProgress,
  insightProgressLabel,
  salesDimensionLabel,
  summariseLibrary,
  type InsightProcessing,
} from '@lfg/core';

import {CaptureInsight} from '@/app/capture-insight';
import {createClient} from '@/lib/supabase/server';
import {currentUser} from '@/lib/supabase/user';

/**
 * The insight library.
 *
 * A page of its own rather than another block on the board, because the two
 * are read at different moments: the board is opened to move an application
 * along, and this is opened mid-article with something worth keeping. Putting
 * the capture box three screens below a kanban board would make the cheapest
 * action in the product the slowest to reach.
 *
 * It reads and renders; `capture-insight.tsx` writes. Nothing here filters by
 * user id — row-level security does, and a query that filters in code is a
 * query that can forget to (ADR-0002).
 *
 * What it will not do is dress up an unprocessed capture. Every insight here
 * is raw text until a pipeline that does not exist yet writes a summary, a
 * principle and some tags, so each row says which of those are missing and
 * the header counts how few have any of them (CLAUDE.md rule 8).
 */

const MS_PER_DAY = 86_400_000;

/**
 * How long ago something was captured.
 *
 * Presentation, which is why it is here rather than in `core`: nothing
 * decides anything from this string.
 */
function capturedLabel(when: Date, now: Date): string {
  const days = Math.floor((now.getTime() - when.getTime()) / MS_PER_DAY);
  if (days <= 0) {
    return 'captured today';
  }
  if (days === 1) {
    return 'captured yesterday';
  }
  return `captured ${days.toString()} days ago`;
}

/**
 * The host a source link points at.
 *
 * The whole URL is the useful thing to click and a terrible thing to read: a
 * tracking-laden link is longer than the insight it came with. The `try` is
 * not defensive about `parseInsightCapture`, which cannot produce an
 * unparseable link — it is about rows that arrive another way, from the share
 * sheet or an import, and a library that will not render because one link is
 * malformed is worse than a library showing one ugly link.
 */
function linkLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/** One stored insight, in the shape this page renders. */
interface LibraryEntry extends InsightProcessing {
  readonly id: string;
  readonly rawText: string;
  readonly sourceUrl: string | null;
  readonly createdAt: Date;
}

/**
 * What the counts add up to, said in one sentence.
 *
 * The sentence names the gap rather than the total, because the total is the
 * flattering number: a library of forty-one captures and no summaries is a
 * notebook, and nothing else on this page would say so.
 */
function librarySentence(entries: readonly LibraryEntry[]): string {
  const totals = summariseLibrary(entries);
  if (totals.captured === 0) {
    return 'Nothing captured yet.';
  }
  const captured = `${totals.captured.toString()} captured`;
  if (totals.read === 0 && totals.tagged === 0) {
    return `${captured}, none read or tagged — the pipeline that does that is not built yet.`;
  }
  return `${captured}, ${totals.read.toString()} read, ${totals.tagged.toString()} tagged.`;
}

export default async function InsightsPage() {
  const user = await currentUser();
  if (!user) {
    redirect('/login');
  }

  const supabase = await createClient();
  const {data, error} = await supabase
    .from('insights')
    .select(
      'id, raw_text, source_url, summary, principle, sales_dims, created_at',
    )
    .order('created_at', {ascending: false});

  if (error) {
    throw new Error(`Could not load the insight library: ${error.message}`);
  }

  const entries: readonly LibraryEntry[] = data.map(row => ({
    id: row.id,
    rawText: row.raw_text,
    sourceUrl: row.source_url,
    summary: row.summary,
    principle: row.principle,
    /* The Postgres enum and `SalesDimension` are the same eight values, so
       the generated row type is already the core type. No cast and no
       filter: if they ever diverge, this line is where the compiler says so
       rather than somewhere a dimension has been silently dropped. */
    dims: row.sales_dims,
    createdAt: new Date(row.created_at),
  }));

  /* Read at the boundary and passed inwards, never inside a helper
     (ADR-0003). One instant for the whole page, so two rows captured a minute
     apart cannot be labelled from two different clocks. */
  const now = new Date();

  return (
    <main className="library">
      <div className="row">
        <div>
          <h1>Insights</h1>
          <p className="sub">{librarySentence(entries)}</p>
        </div>
        <Link className="linkish" href="/">
          Applications
        </Link>
      </div>

      <CaptureInsight />

      {entries.length === 0 ? (
        <p className="empty">
          Anything you learn goes here — a line from an article, something an
          interviewer said, a thought on the way home. It does not have to be
          about work.
        </p>
      ) : (
        <ul className="insights">
          {entries.map(entry => (
            <li key={entry.id}>
              {/* The summary leads when there is one, because a one-sentence
                  point is what a list of these is skimmed for. The capture
                  itself is kept behind a disclosure rather than dropped: the
                  summary is model-written and the paste is what was actually
                  said, so the paste has to stay reachable from the sentence
                  that claims to stand for it. */}
              <p className="said">{entry.summary ?? entry.rawText}</p>

              {entry.principle === null ? null : (
                <p className="principle">{entry.principle}</p>
              )}

              {entry.dims.length === 0 ? null : (
                <p className="dims">
                  {entry.dims.map(dim => (
                    <span key={dim} className="dim">
                      {salesDimensionLabel(dim)}
                    </span>
                  ))}
                </p>
              )}

              {entry.summary === null ? null : (
                <details className="raw">
                  <summary>What you captured</summary>
                  <p>{entry.rawText}</p>
                </details>
              )}

              <p className="meta">
                {insightProgressLabel(insightProgress(entry))}
                {' · '}
                {capturedLabel(entry.createdAt, now)}
                {entry.sourceUrl === null ? null : (
                  <>
                    {' · '}
                    <a
                      href={entry.sourceUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                    >
                      {linkLabel(entry.sourceUrl)}
                    </a>
                  </>
                )}
              </p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
