/**
 * Reads the ATS board of every company the caller is watching.
 *
 * ADR-0010: a company with both `ats_type` and `ats_slug` is one to poll, a
 * posting that survives the filter in `@lfg/core` becomes a `jobs` row with
 * no application, and the existing `(user_id, source_url)` unique index is
 * what stops a second poll storing the same role twice.
 *
 * What this file decides: nothing. Which boards exist, what a posting looks
 * like, and whether one is worth keeping are all in
 * `packages/core/src/jobs/board.ts` (ADR-0003). Here there is fetching,
 * inserting, and the two failure modes a network boundary adds.
 *
 * SCOPE, CUT DELIBERATELY: this runs when the caller asks, with the caller's
 * own token, so row-level security applies exactly as it does everywhere
 * else. ADR-0010 describes a schedule, and a schedule has no user and would
 * need the service key -- which ADR-0002 permits only for scheduler plugins
 * passing an explicit user context. That is a larger decision than this
 * function, and running it by hand first is how the filter gets tuned
 * against real boards before anything runs unattended. docs/roadmap.md
 * records the cut.
 */

import {createClient} from '@supabase/supabase-js';

import type {Database} from '../../database.types.ts';
import {
  boardUrl,
  isPollableAts,
  readBoard,
  type BoardPosting,
  type PollableAts,
} from '../../../packages/core/src/jobs/board.ts';
import {
  isRegion,
  type Region,
} from '../../../packages/core/src/regions/region.ts';

/** How long one board is given before it is abandoned. */
const BOARD_TIMEOUT_MS = 12_000;

/**
 * Most companies read in one run.
 *
 * A ceiling rather than a budget: the list is the author's own and will not
 * plausibly reach this. It exists so that a mistake in the data -- a
 * thousand rows from a bad import -- cannot turn one request into a thousand
 * outbound fetches against endpoints nobody is charging us for.
 */
const MAX_COMPANIES = 60;

const CORS = {
  'Access-Control-Allow-Origin': Deno.env.get('WEB_ORIGIN') ?? '*',
  /* The client's list, not ours: supabase-js sends x-client-info and apikey
     of its own accord, and a preflight fails closed on any header the
     allow-list omits. Checked by scripts/check-function-cors.sh. */
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {...CORS, 'Content-Type': 'application/json'},
  });
}

function clientFor(authorization: string) {
  return createClient<Database>(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    {global: {headers: {Authorization: authorization}}},
  );
}

type Db = ReturnType<typeof clientFor>;

/** What one company's poll produced, for the caller to read. */
interface CompanyResult {
  readonly company: string;
  readonly ats: PollableAts;
  /** Postings stored by this run. Already-known ones are not counted. */
  readonly added: number;
  /** Postings read and rejected by the filter. */
  readonly discarded: number;
  /** Why this company produced nothing, when that is worth saying. */
  readonly problem?: string;
}

/**
 * Fetches one board.
 *
 * A board that is slow, missing or malformed is a company that produced
 * nothing, not a failed request: the author's list will contain slugs that
 * are wrong and companies that have moved off a provider, and one of those
 * must not stop the other fifty being read.
 */
async function fetchBoard(url: string): Promise<unknown> {
  const abort = new AbortController();
  const timer = setTimeout(() => {
    abort.abort();
  }, BOARD_TIMEOUT_MS);
  try {
    const response = await fetch(url, {signal: abort.signal});
    if (!response.ok) {
      throw new Error(`the board answered ${response.status.toString()}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Writes the postings that are new.
 *
 * `onConflict` names the partial unique index on `(user_id, source_url)`,
 * so a role seen on an earlier run is skipped rather than duplicated or
 * overwritten -- overwriting would quietly reset anything the author had
 * edited on the row.
 *
 * `visa_sponsorship` is left at its default of `unknown`, which is the
 * truthful answer: a board listing says nothing either way, and the
 * NOT NULL provenance constraint on a confirmed answer exists precisely so
 * that a guess cannot be recorded as a fact (CLAUDE.md rules 3 and 8).
 */
async function storeNew(
  supabase: Db,
  userId: string,
  companyId: string,
  postings: readonly BoardPosting[],
): Promise<number> {
  if (postings.length === 0) {
    return 0;
  }

  const rows = postings.map(posting => ({
    user_id: userId,
    company_id: companyId,
    title: posting.title,
    source_url: posting.sourceUrl,
    region: posting.region,
    posted_at: posting.firstPublishedAt,
  }));

  const {data, error} = await supabase
    .from('jobs')
    .upsert(rows, {onConflict: 'user_id,source_url', ignoreDuplicates: true})
    .select('id');

  if (error !== null) {
    throw new Error(error.message);
  }
  return data?.length ?? 0;
}

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', {headers: CORS});
  }
  if (request.method !== 'POST') {
    return json({error: 'Use POST.'}, 405);
  }

  const supabase = clientFor(request.headers.get('Authorization') ?? '');
  const {
    data: {user},
    error: authError,
  } = await supabase.auth.getUser();
  if (authError !== null || user === null) {
    return json({error: 'Sign in to check boards.'}, 401);
  }

  /* The markets to keep. Read from the request so the caller can narrow a
     run, and validated here because a region that is not a region would
     silently keep nothing and look like a quiet board. */
  let regions: readonly Region[] = ['uk', 'ie', 'ee', 'jp'];
  try {
    const body: unknown = await request.json();
    const asked = (body as {regions?: unknown}).regions;
    if (Array.isArray(asked)) {
      const valid = asked.filter(isRegion);
      if (valid.length === 0) {
        return json({error: 'None of those are markets this supports.'}, 400);
      }
      regions = valid;
    }
  } catch {
    /* No body is fine; the defaults above are the wave-one markets. */
  }

  const {data: companies, error: readError} = await supabase
    .from('companies')
    .select('id, name, ats_type, ats_slug')
    .not('ats_type', 'is', null)
    .not('ats_slug', 'is', null)
    .limit(MAX_COMPANIES);

  if (readError !== null) {
    return json({error: 'The company list could not be read.'}, 500);
  }
  if (companies === null || companies.length === 0) {
    /* Not an error, and worth saying plainly: there is nothing to poll until
       a company carries an ATS, and an empty result here is otherwise
       indistinguishable from fifty quiet boards. */
    return json(
      {
        results: [],
        added: 0,
        checked: 0,
        note: 'No company has an ATS set, so there is nothing to check yet.',
      },
      200,
    );
  }

  const results: CompanyResult[] = [];
  let added = 0;

  for (const company of companies) {
    const ats: unknown = company.ats_type;
    if (!isPollableAts(ats)) {
      /* workday and other are real stored values with no public endpoint.
         Skipped, and said out loud rather than silently passed over. */
      results.push({
        company: company.name,
        ats: 'greenhouse',
        added: 0,
        discarded: 0,
        problem: `No public board endpoint for ${String(ats)}.`,
      });
      continue;
    }

    const url = boardUrl(ats, company.ats_slug ?? '');
    if (url === null) {
      results.push({
        company: company.name,
        ats,
        added: 0,
        discarded: 0,
        problem: 'That board name cannot be turned into a URL.',
      });
      continue;
    }

    try {
      const raw = await fetchBoard(url);
      const reading = readBoard(raw, {regions});
      const stored = await storeNew(
        supabase,
        user.id,
        company.id,
        reading.kept,
      );
      added += stored;

      /* Written whether or not anything was kept. The point of the column is
         to tell "looked and found nothing" from "never looked". */
      await supabase
        .from('companies')
        .update({ats_checked_at: new Date().toISOString()})
        .eq('id', company.id);

      results.push({
        company: company.name,
        ats,
        added: stored,
        discarded: reading.discarded,
      });
    } catch (cause) {
      results.push({
        company: company.name,
        ats,
        added: 0,
        discarded: 0,
        problem: cause instanceof Error ? cause.message : 'The board failed.',
      });
    }
  }

  return json({results, added, checked: companies.length}, 200);
});
