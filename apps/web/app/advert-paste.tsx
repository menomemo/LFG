'use client';

import {useState, useTransition} from 'react';

import {
  type ApplicationDraftFieldsFromAdvert,
  type AdvertField,
  type JobAdvertExtraction,
} from '@lfg/core';

import {browserClient, type SupabasePublicConfig} from '@/lib/supabase/browser';

/** How an unestablished field is named to the person. */
const FIELD_LABELS: Record<AdvertField, string> = {
  company: 'company',
  domain: 'website',
  role: 'role',
  region: 'market',
  workMode: 'work mode',
  sponsorship: 'sponsorship',
  sourceUrl: 'advert link',
};

/**
 * What `functions.invoke` resolves to, as far as this file is willing to
 * assume.
 */
function isInvokeResult(value: unknown): value is {data: unknown} {
  return typeof value === 'object' && value !== null && 'data' in value;
}

/**
 * Narrows a response body to an extraction.
 *
 * The function on the other end validates its own output with
 * `parseJobAdvert`, so this looks redundant -- and it is the kind of
 * redundancy that earns itself the first time the function is deployed
 * without the client, or the other way round. Trusting a shape because the
 * same repository produced it is trusting a deployment to be atomic, which
 * two separately deployed services never are.
 *
 * Shape only. The field-level rules stay in `core`, where both sides of the
 * wire read them from the same place.
 */
function isExtraction(value: unknown): value is JobAdvertExtraction {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const {fields, unestablished} = value as Record<string, unknown>;
  return (
    typeof fields === 'object' &&
    fields !== null &&
    Array.isArray(unestablished) &&
    unestablished.every(entry => typeof entry === 'string')
  );
}

/** The sentence shown when nothing better can be established. */
const GENERIC_FAILURE =
  'The advert could not be read. Nothing was saved; fill the form in by ' +
  'hand, or try once more.';

/**
 * Turns a failed invoke into something worth reading.
 *
 * The first version of this file did not try: a comment claimed invoke()
 * hides the body behind a generic FunctionsHttpError, so it showed one
 * sentence for every failure. That was wrong twice over. The body is right
 * there -- FunctionsHttpError carries the Response on `context` -- and the
 * one failure that actually happened was not even a response: a CORS
 * preflight refusal, which the browser reports to the console and hands the
 * caller as a bare network error. The generic sentence sent the reader
 * looking at the key and the model while the real cause was a header list.
 *
 * So: the function's own message when there is one, a named guess when the
 * failure happened before any response, and the generic sentence only when
 * neither applies.
 */
async function explain(response: unknown): Promise<string> {
  if (!isInvokeError(response)) {
    return GENERIC_FAILURE;
  }
  const {error} = response;

  const body = hasResponseContext(error) ? await readBody(error.context) : null;
  if (body !== null) {
    return body;
  }

  /* No response at all. The browser blocks a request whose preflight was
     refused before it is sent, and `message` is all that survives -- the
     reason is in the console, which the person reading this cannot see. */
  const message = typeof error?.message === 'string' ? error.message : '';
  if (message.toLowerCase().includes('failed to fetch')) {
    return (
      'The parser could not be reached at all — the request was refused ' +
      'before it was sent. That is a deployment or CORS problem rather than ' +
      'anything about this advert; the browser console has the reason.'
    );
  }
  return GENERIC_FAILURE;
}

/** Narrows to the shape invoke() resolves to on failure. */
function isInvokeError(
  value: unknown,
): value is {error: {message?: unknown; context?: unknown} | null} {
  return typeof value === 'object' && value !== null && 'error' in value;
}

function hasResponseContext(
  error: {context?: unknown} | null,
): error is {context: Response} {
  return error?.context instanceof Response;
}

/**
 * Reads the function's own error text out of its response.
 *
 * The function answers JSON with an `error` string and, when an extraction
 * was attempted and refused, the `problems` the validator produced. Those
 * problems are the most useful thing it can say -- they name the field the
 * model got wrong -- so they are shown rather than summarised.
 */
async function readBody(context: Response): Promise<string | null> {
  try {
    const parsed: unknown = await context.json();
    if (typeof parsed !== 'object' || parsed === null) {
      return null;
    }
    const {error, problems} = parsed as Record<string, unknown>;
    if (typeof error !== 'string') {
      return null;
    }
    if (
      Array.isArray(problems) &&
      problems.every(entry => typeof entry === 'string') &&
      problems.length > 0
    ) {
      return `${error} ${problems.join(' ')}`;
    }
    return error;
  } catch {
    /* Not JSON, or already consumed. Nothing to add. */
    return null;
  }
}

interface AdvertPasteProps {
  readonly config: SupabasePublicConfig;
  /** Called with the fields to seed the form with. */
  readonly onExtracted: (
    fields: ApplicationDraftFieldsFromAdvert,
    unestablished: readonly AdvertField[],
  ) => void;
}

/**
 * Pastes a job advert and fills the form below it in.
 *
 * The browser calls the Edge Function directly, which is ADR-0009: the web
 * host neither holds the provider key nor spends seconds waiting on a model,
 * and the function writes the meter row before it answers.
 *
 * Nothing here is saved. The extraction lands in the form as defaults, the
 * person reads it, and the ordinary create path writes the rows — so a
 * model's answer passes through a human and through
 * `parseApplicationDraft` exactly like something typed by hand (CLAUDE.md
 * rule 7).
 *
 * What it will not do is pretend. A field the advert did not establish comes
 * back blank and is named underneath, because a blank the model left alone
 * and a blank it never considered look identical and only one of them is
 * worth re-reading the advert for (rule 8).
 */
export function AdvertPaste({config, onExtracted}: AdvertPasteProps) {
  const [advert, setAdvert] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [missing, setMissing] = useState<readonly AdvertField[] | null>(null);
  const [pending, startTransition] = useTransition();

  function read() {
    const text = advert.trim();
    if (text === '') {
      setProblem('Paste the advert first.');
      return;
    }

    setProblem(null);
    setMissing(null);

    startTransition(async () => {
      const supabase = browserClient(config);
      const response: unknown = await supabase.functions.invoke(
        'parse-advert',
        {body: {advert: text}},
      );
      const data = isInvokeResult(response) ? response.data : null;

      if (!isExtraction(data)) {
        setProblem(await explain(response));
        return;
      }

      onExtracted(data.fields, data.unestablished);
      setMissing(data.unestablished);
    });
  }

  return (
    <div className="paste">
      <label>
        Paste a job advert
        <textarea
          value={advert}
          onChange={event => {
            setAdvert(event.target.value);
          }}
          rows={5}
          placeholder="Paste the whole advert. The fields below fill in; you check them."
        />
      </label>

      <button type="button" onClick={read} disabled={pending}>
        {pending ? 'Reading…' : 'Read it'}
      </button>

      {problem === null ? null : <p className="error">{problem}</p>}

      {missing === null ? null : missing.length === 0 ? (
        <p className="note">Every field was found. Check them before adding.</p>
      ) : (
        <p className="note">
          Not in the advert, so left blank:{' '}
          {missing.map(field => FIELD_LABELS[field]).join(', ')}.
        </p>
      )}
    </div>
  );
}
