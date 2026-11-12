/**
 * Reads a batch of captured insights and files them.
 *
 * ADR-0011 decides when this runs: only when the person presses the button,
 * over the captures that have no summary yet, a fixed number at a time.
 * Capture itself never calls a model, because the premise of module 6 is
 * that capture costs nothing and cannot fail.
 *
 * ADR-0009 decides where it runs. Three things it does that the web host
 * must not: it holds the provider credential, it waits on a model, and it
 * writes `llm_usage`. The third decided the other two — a call site that CAN
 * return without metering eventually will.
 *
 * What it deliberately does not decide is anything about the answer. The
 * prompt and the response contract are in @lfg/core (ADR-0003); this file
 * moves bytes, counts money, and keeps one insight's failure from touching
 * the next one's row.
 */

/* A bare specifier, resolved by the deno.json beside this file. Both the
   deploy and the CI check run with this directory as the working directory,
   which is what makes that config discoverable -- Deno looks upward from the
   working directory, not from the entry file. */
import {createClient} from '@supabase/supabase-js';

import type {Database} from '../../database.types.ts';

import {
  insightTaggingPrompt,
  INSIGHT_TAGGING_TASK,
  INSIGHT_TAGGING_PROMPT_VERSION,
} from '../../../packages/core/src/insights/tagging-prompt.ts';
import {parseInsightTagging} from '../../../packages/core/src/insights/tagging.ts';

/** The name this spend is attributed to in `llm_usage.plugin`. */
const PLUGIN = 'insight-tagger';

/**
 * What goes into `insights.generated_by`.
 *
 * Plugin and prompt version, which is the pair that reproduces an answer:
 * the model is recorded separately in `llm_usage.model`, and a prompt
 * reworded next month must not be able to claim it wrote last month's
 * summaries.
 */
const GENERATED_BY = `${PLUGIN}@${INSIGHT_TAGGING_PROMPT_VERSION}`;

/**
 * How many insights one press may process.
 *
 * ADR-0011 chose a ceiling over "everything unprocessed" so that the cost of
 * a press is knowable before it is paid, and so that a function with a
 * wall-clock limit cannot fail halfway through an unbounded loop. Ten is
 * roughly a week of capture for one person, which makes a backlog two
 * presses rather than a decision.
 */
const BATCH = Number(Deno.env.get('INSIGHT_TAGGER_BATCH') ?? '10');

/**
 * The most insights one person may have processed in a day.
 *
 * Configuration rather than SQL, as architecture.md §7 requires. A hundred
 * is roughly ten presses of a full batch: a runaway-loop guard rather than a
 * budget, and reaching it by hand is information worth having.
 */
const DAILY_CALL_CAP = Number(
  Deno.env.get('INSIGHT_TAGGER_DAILY_CAP') ?? '100',
);

/** Longest capture sent to the model, in characters. */
const MAX_CAPTURE_CHARS = 8_000;

/* Backends are configuration (CLAUDE.md rule 4). The model name is read,
   never written, and is recorded in llm_usage.model so a bill can later be
   attributed to it. */
const MODEL = Deno.env.get('INSIGHT_TAGGER_MODEL') ?? 'claude-haiku-5-5';
const API_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? '';

/**
 * Price per million tokens, in USD, for the default model.
 *
 * Checked 2026-11-09 against the published rates for `claude-haiku-5-5`, for
 * prompts under 100K tokens — the same figures the advert parser carries,
 * and wrong in the same way if the model is overridden without them. A
 * figure with a checked date is what ADR-0004 asks for, and the argument
 * applies to a price as much as to a visa threshold.
 */
const USD_PER_MTOK_IN = Number(Deno.env.get('INSIGHT_TAGGER_USD_IN') ?? '0.10');
const USD_PER_MTOK_OUT = Number(
  Deno.env.get('INSIGHT_TAGGER_USD_OUT') ?? '0.50',
);

/*
 * The browser's preflight decides whether this function is reachable at all,
 * and it fails closed on any header the allow-list omits. The list is the
 * client's, not ours: supabase-js sends `x-client-info` and `apikey` of its
 * own accord, and a list of "only what we read" blocks every real call while
 * a curl OPTIONS request keeps passing (docs/engineering-log.md §3.1).
 */
const CORS = {
  'Access-Control-Allow-Origin': Deno.env.get('WEB_ORIGIN') ?? '*',
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

interface ModelCall {
  /** Every text block joined. Empty when the model produced none. */
  readonly text: string;
  readonly tokensIn: number;
  readonly tokensOut: number;
  /** Why generation stopped, for an error that has to explain itself. */
  readonly stopReason: string;
}

/**
 * One call to the provider, for one capture.
 *
 * `correction` carries the problems a previous attempt produced. Rule 5
 * requires exactly one retry and requires it to be told what was wrong;
 * retrying with the identical prompt is paying twice for the same
 * distribution.
 */
async function callModel(
  capture: string,
  correction: readonly string[],
): Promise<ModelCall> {
  const user =
    correction.length === 0
      ? capture
      : [
          capture,
          '',
          'Your previous answer was rejected:',
          ...correction.map(problem => `- ${problem}`),
          '',
          'Return corrected JSON with all three keys.',
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
      /* Has to cover the thinking tokens as well as the JSON, because
         thinking counts against this budget. At 1024 a thinking model can
         spend the whole allowance before writing a single field, and the
         response comes back with no text block at all. */
      max_tokens: 4096,
      /* Two short sentences and up to three labels, from text that is in
         hand. Low effort is what this workload wants: the judgement it needs
         is in the prompt, not in how long the model thinks about it. */
      output_config: {effort: 'low'},
      system: insightTaggingPrompt(),
      messages: [{role: 'user', content: user}],
    }),
  });

  if (!response.ok) {
    throw new Error(`The model provider answered ${response.status}.`);
  }

  const body = await response.json();

  /* The answer is not necessarily content[0]. Thinking is on by default on
     the models this runs against, so the first block is usually a thinking
     block carrying an empty string. Every text block, joined, is the shape
     that keeps working (docs/engineering-log.md §3.2). */
  const blocks: readonly unknown[] = Array.isArray(body?.content)
    ? (body.content as readonly unknown[])
    : [];
  const text = blocks
    .filter((block): block is {type: string; text: string} => {
      if (typeof block !== 'object' || block === null) {
        return false;
      }
      const candidate = block as {type?: unknown; text?: unknown};
      return candidate.type === 'text' && typeof candidate.text === 'string';
    })
    .map(block => block.text)
    .join('');

  /* Returned rather than thrown, even when empty: the tokens are already
     spent, and a throw here would skip the metering. */
  return {
    text,
    tokensIn: Number(body?.usage?.input_tokens ?? 0),
    tokensOut: Number(body?.usage?.output_tokens ?? 0),
    stopReason:
      typeof body?.stop_reason === 'string' ? body.stop_reason : 'unknown',
  };
}

/**
 * Reads JSON out of a model's reply.
 *
 * Models fence JSON in markdown despite being told not to, often enough that
 * treating it as a protocol error would spend the retry on punctuation.
 * Anything beyond that is left to `parseInsightTagging`, because this
 * function is not allowed to have an opinion about the contents.
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
 * `Db` is read off this function rather than off `createClient`, because
 * `ReturnType<typeof createClient>` resolves with the generic defaults and
 * produces a client whose every table is `never`.
 */
function clientFor(authorization: string) {
  return createClient<Database>(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    {global: {headers: {Authorization: authorization}}},
  );
}

type Db = ReturnType<typeof clientFor>;

/**
 * What happened to one insight, for the person who pressed the button.
 *
 * Three outcomes, not two. A capture the model declined to summarise and a
 * capture whose answer was refused both end up raw, but only one of them is
 * something going wrong — and a run reporting "2 left as they were" when
 * both were correct refusals sends the person looking for a fault that is
 * not there.
 */
interface InsightResult {
  readonly id: string;
  /** The first words of the capture, so a row can be recognised. */
  readonly excerpt: string;
  readonly outcome: 'filed' | 'declined' | 'failed';
  /** Null when it was filed. */
  readonly problem: string | null;
}

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', {headers: CORS});
  }
  if (request.method !== 'POST') {
    return json({error: 'Use POST.'}, 405);
  }
  if (API_KEY === '') {
    /* Loud rather than a fallback to unvalidated prose, per rule 5. */
    return json({error: 'The tagger is not configured on the server.'}, 503);
  }

  /* The caller's own token, not the service key: every row this function
     reads and writes is the person's, so RLS applies to it exactly as it
     applies to everything else they do (ADR-0002). */
  const supabase = clientFor(request.headers.get('Authorization') ?? '');

  const {
    data: {user},
    error: authError,
  } = await supabase.auth.getUser();
  if (authError !== null || user === null) {
    return json({error: 'Sign in to process your insights.'}, 401);
  }

  /* Oldest first. The backlog is read in the order it was captured, so two
     presses in a row cover different insights and nothing at the bottom of
     a long list is permanently skipped. `summary is null` is the whole
     definition of unprocessed: it is what the library shows, and it is why
     a failed insight is simply left alone rather than flagged. */
  const {data: pending, error: readError} = await supabase
    .from('insights')
    .select('id, raw_text')
    .is('summary', null)
    .order('created_at', {ascending: true})
    .limit(BATCH);

  if (readError !== null) {
    return json(
      {error: `Could not read the library: ${readError.message}`},
      500,
    );
  }
  if (pending.length === 0) {
    return json({processed: 0, results: [], note: 'Nothing to process.'}, 200);
  }

  /* The cap is counted from the meter rather than held in memory, because
     this function has no memory between invocations and a per-instance
     counter would reset on every cold start. */
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

  const spentToday = count ?? 0;
  if (spentToday >= DAILY_CALL_CAP) {
    return json(
      {
        error:
          `${DAILY_CALL_CAP.toString()} insights already processed today. ` +
          'The cap is a runaway guard, not a budget — if you reached it by ' +
          'hand, say so.',
      },
      429,
    );
  }

  /* Trimmed to what the cap leaves, rather than refused. A person with
     eight left in the day and ten captures should get eight filed, not a
     refusal and nothing. */
  const batch = pending.slice(0, DAILY_CALL_CAP - spentToday);

  const results: InsightResult[] = [];
  for (const insight of batch) {
    results.push(await fileOne(supabase, user.id, insight));
  }

  return json(
    {
      processed: results.filter(result => result.outcome === 'filed').length,
      results,
    },
    200,
  );
});

/**
 * Processes one insight: call, validate, retry once, write.
 *
 * Every failure is caught and returned rather than thrown. One capture that
 * a model cannot read must not stop the nine behind it, and a row is only
 * written when all three fields passed — a summary with no dimensions would
 * show in the library as finished (ADR-0011).
 */
async function fileOne(
  supabase: Db,
  userId: string,
  insight: {readonly id: string; readonly raw_text: string},
): Promise<InsightResult> {
  const excerpt = insight.raw_text.slice(0, 60);
  const capture = insight.raw_text.slice(0, MAX_CAPTURE_CHARS);

  let spentIn = 0;
  let spentOut = 0;
  let problems: readonly string[] = [];

  try {
    /* One attempt, then one corrected retry. Not a loop: rule 5 says retry
       once and then fail visibly. */
    for (let attempt = 0; attempt < 2; attempt++) {
      const call = await callModel(capture, problems);
      spentIn += call.tokensIn;
      spentOut += call.tokensOut;

      if (call.text === '') {
        problems = [
          `The model returned no text (stop_reason: ${call.stopReason}).`,
        ];
        continue;
      }

      const verdict = parseInsightTagging(readJson(call.text));
      if (!verdict.ok) {
        problems = verdict.problems;
        continue;
      }

      if (verdict.value.kind === 'declined') {
        /* Not retried. The model was asked to answer `{}` when there is
           nothing worth filing, and asking it again to correct a correct
           answer pays twice to pressure it into inventing one. */
        await meter(supabase, userId, spentIn, spentOut);
        return {
          id: insight.id,
          excerpt,
          outcome: 'declined',
          problem:
            'Nothing here to summarise yet — add a line of context and ' +
            'press the button again.',
        };
      }

      const {tagging} = verdict.value;

      /* All four columns in one statement. `generated_by` is NOT a separate
         write: the table ties it to `summary` in a check constraint, so
         writing them together is what makes rule 3 enforced rather than
         remembered. */
      const {error} = await supabase
        .from('insights')
        .update({
          summary: tagging.summary,
          principle: tagging.principle,
          sales_dims: [...tagging.dims],
          generated_by: GENERATED_BY,
        })
        .eq('id', insight.id);

      await meter(supabase, userId, spentIn, spentOut);

      if (error !== null) {
        return {
          id: insight.id,
          excerpt,
          outcome: 'failed',
          problem: `Not saved: ${error.message}`,
        };
      }
      return {id: insight.id, excerpt, outcome: 'filed', problem: null};
    }

    await meter(supabase, userId, spentIn, spentOut);
    return {
      id: insight.id,
      excerpt,
      outcome: 'failed',
      problem: problems.join(' '),
    };
  } catch (cause) {
    /* The spend happened even though the answer did not arrive. */
    await meter(supabase, userId, spentIn, spentOut);
    return {
      id: insight.id,
      excerpt,
      outcome: 'failed',
      problem: cause instanceof Error ? cause.message : 'The call failed.',
    };
  }
}

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
    task: INSIGHT_TAGGING_TASK,
    model: MODEL,
    tokens_in: tokensIn,
    tokens_out: tokensOut,
    /* Rounded here rather than left to the column, so the number written and
       the number the generated type promises are the same thing. */
    cost_usd: Number(costUsd.toFixed(6)),
  });

  if (error !== null) {
    console.error('llm_usage insert failed', {
      plugin: PLUGIN,
      task: INSIGHT_TAGGING_TASK,
      tokensIn,
      tokensOut,
      error: error.message,
    });
  }
}
