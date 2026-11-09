/**
 * Turns a pasted job advert into a filled-in create form.
 *
 * This function exists here, and not as a server action in apps/web,
 * because of ADR-0009. Three things it does that the web host must not:
 * it holds the provider credential, it spends time waiting on a model, and
 * it writes the `llm_usage` row. The third is the one that decided the
 * other two -- a call site that CAN return without metering eventually
 * will, so the call and the meter belong in one function with no path
 * between them.
 *
 * What it deliberately does not do is decide anything. The prompt, the
 * response contract and the grounding checks are all in @lfg/core
 * (ADR-0003); this file moves bytes, counts money and handles the two
 * failures a network boundary adds.
 */

/* A bare specifier, resolved by the deno.json beside this file. Both the
   deploy and the CI check run with this directory as the working directory,
   which is what makes that config discoverable -- Deno looks upward from the
   working directory, not from the entry file. Checked from the repository
   root instead, Deno finds the Node workspace's package.json, switches to
   Node resolution and asks for a node_modules this function has no reason to
   have. The CI job documents the cd for that reason. */
import {createClient} from '@supabase/supabase-js';

import type {Database} from '../../database.types.ts';

import {
  jobAdvertPrompt,
  JOB_ADVERT_TASK,
} from '../../../packages/core/src/jobs/advert-prompt.ts';
import {parseJobAdvert} from '../../../packages/core/src/jobs/advert.ts';

/** The name this spend is attributed to in `llm_usage.plugin`. */
const PLUGIN = 'jd-parser';

/**
 * The most parses one person may run in a day.
 *
 * Configuration rather than SQL, as architecture.md §7 requires: a number
 * in a migration is a threshold nobody can see or change. Forty is roughly
 * ten times a heavy application day, which makes it a runaway-loop guard
 * rather than a budget -- it should never be reached by a person using the
 * product as intended, and reaching it is information.
 */
const DAILY_CALL_CAP = Number(Deno.env.get('JD_PARSER_DAILY_CAP') ?? '40');

/** Longest advert accepted, in characters. */
const MAX_ADVERT_CHARS = 20_000;

/* Backends are configuration (CLAUDE.md rule 4). The model name is read,
   never written, and is recorded in llm_usage.model so a bill can later be
   attributed to it. */
const MODEL = Deno.env.get('JD_PARSER_MODEL') ?? 'claude-haiku-5-5';
const API_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? '';

/**
 * Price per million tokens, in USD, for the default model.
 *
 * Checked 2026-11-09 against the published rates for `claude-haiku-5-5`, for
 * prompts under 100K tokens. The first version of this file carried 1 and 5,
 * written from memory and ten times too high, which would have made every
 * cost_usd in the ledger overstate the spend by an order of magnitude. The
 * meter would have been the most confidently wrong thing in the system.
 *
 * These are a default for one model, so changing MODEL without changing them
 * leaves the ledger wrong rather than failing: an override belongs with the
 * override. A figure with a checked date is what ADR-0004 asks for, and the
 * same argument applies to a price as to a visa threshold.
 */
const USD_PER_MTOK_IN = Number(Deno.env.get('JD_PARSER_USD_IN') ?? '0.10');
const USD_PER_MTOK_OUT = Number(Deno.env.get('JD_PARSER_USD_OUT') ?? '0.50');

const CORS = {
  'Access-Control-Allow-Origin': Deno.env.get('WEB_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {...CORS, 'Content-Type': 'application/json'},
  });
}

interface ModelCall {
  readonly text: string;
  readonly tokensIn: number;
  readonly tokensOut: number;
}

/**
 * One call to the provider.
 *
 * `correction` carries the problems a previous attempt produced. Rule 5
 * requires exactly one retry and requires it to be told what was wrong;
 * retrying with the identical prompt is just paying twice for the same
 * distribution.
 */
async function callModel(
  advert: string,
  correction: readonly string[],
): Promise<ModelCall> {
  const user =
    correction.length === 0
      ? advert
      : [
          advert,
          '',
          'Your previous answer was rejected:',
          ...correction.map(problem => `- ${problem}`),
          '',
          'Return corrected JSON. Omit any key you cannot establish.',
        ].join('\n');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      system: jobAdvertPrompt(),
      messages: [{role: 'user', content: user}],
    }),
  });

  if (!response.ok) {
    throw new Error(`The model provider answered ${response.status}.`);
  }

  const body = await response.json();
  const text = body?.content?.[0]?.text;
  if (typeof text !== 'string') {
    throw new Error('The model provider returned no text.');
  }

  return {
    text,
    tokensIn: Number(body?.usage?.input_tokens ?? 0),
    tokensOut: Number(body?.usage?.output_tokens ?? 0),
  };
}

/**
 * Reads JSON out of a model's reply.
 *
 * Models fence JSON in markdown despite being told not to, often enough
 * that treating it as a protocol error would spend a retry on punctuation.
 * Anything beyond that -- prose, a truncated object -- is left to
 * `parseJobAdvert` to refuse, because this function is not allowed to have
 * an opinion about the contents.
 */
function readJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced ? fenced[1] : text).trim();
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

/**
 * A client carrying the caller's own access token.
 *
 * Typed with the generated schema, so a column that no longer exists is a
 * type error here rather than a silent insert failure at two in the morning.
 *
 * `Db` is read off this function rather than off `createClient`, because
 * `ReturnType<typeof createClient>` resolves with the generic defaults and
 * not with the arguments actually passed -- which produces a client whose
 * every table is `never`.
 */
function clientFor(authorization: string) {
  return createClient<Database>(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    {global: {headers: {Authorization: authorization}}},
  );
}

type Db = ReturnType<typeof clientFor>;

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', {headers: CORS});
  }
  if (request.method !== 'POST') {
    return json({error: 'Use POST.'}, 405);
  }
  if (API_KEY === '') {
    /* Loud rather than a fallback to unparsed prose, per rule 5. */
    return json({error: 'The parser is not configured on the server.'}, 503);
  }

  /* The caller's own token, not the service key: every row this function
     writes is written as the person, so RLS applies to it exactly as it
     applies to everything else they do. */
  const supabase = clientFor(request.headers.get('Authorization') ?? '');

  const {
    data: {user},
    error: authError,
  } = await supabase.auth.getUser();
  if (authError !== null || user === null) {
    return json({error: 'Sign in to parse an advert.'}, 401);
  }

  let advert = '';
  try {
    const body = await request.json();
    advert = typeof body?.advert === 'string' ? body.advert.trim() : '';
  } catch {
    return json({error: 'Send a JSON body with an "advert" string.'}, 400);
  }
  if (advert === '') {
    return json({error: 'Paste the advert first.'}, 400);
  }
  if (advert.length > MAX_ADVERT_CHARS) {
    return json(
      {error: `That advert is longer than ${MAX_ADVERT_CHARS} characters.`},
      413,
    );
  }

  /* The cap is counted from the meter rather than held in memory, because
     this function has no memory between invocations and a per-instance
     counter would reset every cold start -- which is to say, constantly. */
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  const {count, error: countError} = await supabase
    .from('llm_usage')
    .select('id', {count: 'exact', head: true})
    .eq('plugin', PLUGIN)
    .gte('created_at', since.toISOString());

  if (countError !== null) {
    return json({error: 'The meter could not be read, so nothing ran.'}, 500);
  }
  if ((count ?? 0) >= DAILY_CALL_CAP) {
    return json(
      {
        error:
          `${DAILY_CALL_CAP} parses already today. The cap is a runaway ` +
          'guard, not a budget — if you hit it by hand, say so.',
      },
      429,
    );
  }

  let spentIn = 0;
  let spentOut = 0;
  let problems: readonly string[] = [];

  try {
    /* One attempt, then one corrected retry. Not a loop: rule 5 says retry
       once and then fail visibly, and a loop is how a parser quietly costs
       twenty calls for an advert that was never going to work. */
    for (let attempt = 0; attempt < 2; attempt++) {
      const call = await callModel(advert, problems);
      spentIn += call.tokensIn;
      spentOut += call.tokensOut;

      const result = parseJobAdvert(readJson(call.text), advert);
      if (result.ok) {
        await meter(supabase, user.id, spentIn, spentOut);
        return json(result.value, 200);
      }
      problems = result.problems;
    }

    await meter(supabase, user.id, spentIn, spentOut);
    return json(
      {
        error: 'The advert could not be read.',
        problems,
      },
      422,
    );
  } catch (cause) {
    /* The spend happened even though the answer did not arrive, so it is
       metered before this returns. A failed call that costs money and
       records nothing is the hole llm_usage exists to close. */
    await meter(supabase, user.id, spentIn, spentOut);
    return json(
      {error: cause instanceof Error ? cause.message : 'The parse failed.'},
      502,
    );
  }
});

/**
 * Writes the row. Never throws: a meter that can take down the response it
 * is measuring turns a cost record into an outage.
 */
async function meter(
  supabase: Db,
  userId: string,
  tokensIn: number,
  tokensOut: number,
): Promise<void> {
  if (tokensIn === 0 && tokensOut === 0) {
    return;
  }
  const costUsd =
    (tokensIn / 1_000_000) * USD_PER_MTOK_IN +
    (tokensOut / 1_000_000) * USD_PER_MTOK_OUT;

  const {error} = await supabase.from('llm_usage').insert({
    user_id: userId,
    plugin: PLUGIN,
    task: JOB_ADVERT_TASK,
    model: MODEL,
    tokens_in: tokensIn,
    tokens_out: tokensOut,
    /* Rounded here rather than left to the column. numeric(12,6) would
       round it anyway, but doing it in the open means the number written and
       the number the generated type promises are the same thing. A double is
       exact enough at fractions of a cent; it would not be if this were ever
       summed into a balance, and summing belongs in SQL over numeric. */
    cost_usd: Number(costUsd.toFixed(6)),
  });

  if (error !== null) {
    console.error('llm_usage insert failed', {
      plugin: PLUGIN,
      task: JOB_ADVERT_TASK,
      tokensIn,
      tokensOut,
      error: error.message,
    });
  }
}
