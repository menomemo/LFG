/**
 * Deciding what a model is allowed to have written about one insight.
 *
 * The same split as `jobs/advert.ts`, and for the same reason: the thing
 * that produces the answer is not the thing that decides the answer is
 * acceptable. A model proposes a summary, a principle and some dimensions;
 * this module says whether those may be written over a capture.
 *
 * What makes this one stricter than the advert parser is that there is
 * nothing to check the answer against. An advert is in hand, so an invented
 * domain can be caught by looking for it in the text. A summary is a
 * paraphrase by definition — no substring check can distinguish a faithful
 * one from a fluent invention. So the rules here are about shape and about
 * what gets stored at all:
 *
 * - All three fields or none. A row with a summary and no dimensions is a
 *   half-processed capture that the library would show as finished, and the
 *   one visible signal that the pipeline is working would stop being true.
 * - Nothing is coerced, dropped or tidied. An unrecognised dimension is
 *   refused by name rather than filtered out, because a silently dropped tag
 *   is a capture that reads as filed and is not findable.
 * - An empty object is a refusal, not a blank result. The prompt tells the
 *   model to return `{}` when the text says nothing worth filing, and the
 *   honest response to that is to leave the capture raw.
 */

import {accept, reject, type Validated} from '../validation.ts';
import {isSalesDimension, type SalesDimension} from './insight.ts';

/**
 * The longest a written sentence may be.
 *
 * Presentation, not policy: both of these are rendered as a line in a list,
 * and a model that answers with a paragraph has not written the
 * one-sentence point that was asked for. The number is generous — a long
 * English sentence is about 150 characters — so hitting it means the shape
 * is wrong rather than the sentence being slightly over.
 *
 * Exported because the prompt states it, and a limit the model is not told
 * about is a limit that produces retries instead of good answers.
 */
export const MAX_WRITTEN_CHARS = 240;

/** The most dimensions one insight may carry. */
const MAX_DIMS = 3;

/** What a model wrote about one capture, once it has been checked. */
export interface InsightTagging {
  /** The one-sentence point. Becomes `insights.summary`. */
  readonly summary: string;
  /** What to do about it. Becomes `insights.principle`. */
  readonly principle: string;
  /** One to three dimensions, in the order the model ranked them. */
  readonly dims: readonly SalesDimension[];
}

/**
 * What the model did with one capture.
 *
 * Two outcomes rather than one, because declining is not failing. The prompt
 * tells the model to answer `{}` when the text says nothing worth filing —
 * a reminder to itself, a link with no page text, three words — and the
 * first version of this module treated that as a rejection. The cost of that
 * mistake was visible on the first real run: a decline was retried, which
 * meant paying twice to ask a model to correct an answer that was right, and
 * asking it, on the second pass, to find something it had just said was not
 * there. A retry is for an answer that came back wrong (CLAUDE.md rule 5),
 * not for an answer that came back empty on purpose.
 */
export type InsightVerdict =
  /** The model wrote all three fields and they passed. */
  | {readonly kind: 'tagged'; readonly tagging: InsightTagging}
  /** The model says there is nothing here to file. The capture stays raw. */
  | {readonly kind: 'declined'};

/** Reads one string field, refusing anything that is not one. */
function readSentence(
  value: unknown,
  field: string,
  problems: string[],
): string | null {
  if (typeof value !== 'string') {
    problems.push(`"${field}" must be a string.`);
    return null;
  }
  const trimmed = value.trim();
  if (trimmed === '') {
    problems.push(`"${field}" was empty.`);
    return null;
  }
  if (trimmed.length > MAX_WRITTEN_CHARS) {
    problems.push(
      `"${field}" must be one sentence under ${MAX_WRITTEN_CHARS.toString()} characters.`,
    );
    return null;
  }
  return trimmed;
}

/**
 * Reads the dimensions.
 *
 * Duplicates are collapsed rather than refused: a model that answers
 * `["discovery", "discovery"]` has made a formatting mistake, not a
 * judgement error, and spending the single allowed retry on it would be
 * paying for punctuation. An unrecognised value is the opposite — it is the
 * model inventing a ninth dimension, which is exactly what the enum exists
 * to stop — so it is named and refused.
 */
function readDims(value: unknown, problems: string[]): SalesDimension[] | null {
  if (!Array.isArray(value)) {
    problems.push('"dims" must be an array of dimension names.');
    return null;
  }

  const dims: SalesDimension[] = [];
  const unknown: string[] = [];
  for (const entry of value as readonly unknown[]) {
    if (typeof entry !== 'string') {
      problems.push('Every entry in "dims" must be a string.');
      return null;
    }
    const trimmed = entry.trim().toLowerCase();
    if (!isSalesDimension(trimmed)) {
      unknown.push(entry);
      continue;
    }
    if (!dims.includes(trimmed)) {
      dims.push(trimmed);
    }
  }

  if (unknown.length > 0) {
    problems.push(`Not a sales dimension: ${unknown.join(', ')}.`);
    return null;
  }
  if (dims.length === 0) {
    problems.push('"dims" needs at least one dimension.');
    return null;
  }
  if (dims.length > MAX_DIMS) {
    problems.push(
      `"dims" may name at most ${MAX_DIMS.toString()} dimensions; it named ${dims.length.toString()}.`,
    );
    return null;
  }
  return dims;
}

/**
 * Parses what a model answered about one insight.
 *
 * The argument is `unknown` because that is the honest type for a provider's
 * response body, and nothing on the way in is coerced (CLAUDE.md rule 5).
 * The problems are written to be handed straight back to the model as the
 * one correction rule 5 allows, which is why each one names the key it is
 * about.
 *
 * @param answer Whatever came back, already JSON-parsed.
 * @returns What the model did — three checked values, or a declining — or
 *   every reason the answer was refused.
 */
export function parseInsightTagging(
  answer: unknown,
): Validated<InsightVerdict> {
  if (typeof answer !== 'object' || answer === null || Array.isArray(answer)) {
    return reject(['The answer was not a JSON object.']);
  }

  const fields = answer as Record<string, unknown>;

  if (Object.keys(fields).length === 0) {
    /* The prompt's own escape hatch, and an accepted outcome rather than a
       refusal: the capture is left raw, which is the truthful state and the
       one that lets the person add a line of context and press the button
       again. Accepting it is also what stops the caller retrying it. */
    return accept({kind: 'declined'});
  }

  const problems: string[] = [];
  const summary = readSentence(fields.summary, 'summary', problems);
  const principle = readSentence(fields.principle, 'principle', problems);
  const dims = readDims(fields.dims, problems);

  if (problems.length > 0) {
    return reject(problems);
  }
  if (summary === null || principle === null || dims === null) {
    /* Unreachable: each of those returning null pushed a problem. Narrowed
       rather than asserted, because core does not get to assert
       (docs/code-standards.md). */
    return reject(['The answer could not be read.']);
  }

  return accept({kind: 'tagged', tagging: {summary, principle, dims}});
}
