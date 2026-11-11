/**
 * Reading an Edge Function's answer, including when there isn't one.
 *
 * Extracted from `advert-paste.tsx` when the second function arrived: the
 * failure this handles is a property of calling a separately deployed
 * function from a browser, not of parsing adverts, and the whole value of
 * the explanation is that it names the one cause nobody guesses.
 *
 * WHAT HAPPENED, SO THAT IT IS NOT DIAGNOSED FROM SCRATCH AGAIN: on
 * 2026-11-09 the parse-advert function was unreachable from the browser for
 * its entire first day because its CORS allow-list omitted `x-client-info`,
 * which supabase-js sends of its own accord. A refused preflight is not a
 * response — the browser blocks the request before sending it, hands the
 * caller a bare "Failed to fetch", and writes the real reason to a console
 * the person reading the screen cannot see. Every other explanation looks
 * more likely than a header list, so the message says it outright.
 */

/**
 * What `functions.invoke` resolves to, as far as a caller is willing to
 * assume.
 */
export function isInvokeResult(value: unknown): value is {data: unknown} {
  return typeof value === 'object' && value !== null && 'data' in value;
}

/** The sentence shown when nothing better can be established. */
const GENERIC_FAILURE =
  'The request failed and nothing was saved. Try once more.';

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
 * Every function in this project answers JSON with an `error` string and,
 * where a validator refused something, the `problems` it produced. Those
 * problems name the field that was wrong, which makes them the most useful
 * thing the function can say, so they are shown rather than summarised.
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

/**
 * Turns a failed invoke into something worth reading.
 *
 * The function's own message when there is one — `FunctionsHttpError` carries
 * the whole `Response` on `context`, so there is no reason to show a generic
 * sentence instead. A named guess when the failure happened before any
 * response existed. The generic sentence only when neither applies.
 *
 * @param response Whatever `functions.invoke` resolved to.
 * @param fallback The sentence to use when the failure cannot be explained.
 */
export async function explainInvoke(
  response: unknown,
  fallback: string = GENERIC_FAILURE,
): Promise<string> {
  if (!isInvokeError(response)) {
    return fallback;
  }
  const {error} = response;

  const body = hasResponseContext(error) ? await readBody(error.context) : null;
  if (body !== null) {
    return body;
  }

  const message = typeof error?.message === 'string' ? error.message : '';
  if (message.toLowerCase().includes('failed to fetch')) {
    return (
      'The function could not be reached at all — the request was refused ' +
      'before it was sent. That is a deployment or CORS problem rather than ' +
      'anything about what was asked of it; the browser console has the ' +
      'reason, and scripts/check-function-cors.sh is what checks it.'
    );
  }
  return fallback;
}
