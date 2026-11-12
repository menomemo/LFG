/**
 * The instruction given to a model when it reads one captured insight.
 *
 * A versioned file rather than an inline string, which CLAUDE.md requires:
 * the version goes into `llm_usage.task`, so a batch of bad tags found next
 * month can be traced to the exact wording that produced them.
 *
 * The prompt is in `core` and not in the function that calls the provider,
 * for the same reason the advert prompt is: what a model is asked for is a
 * product rule. This one decides what the insight library is _for_ — a
 * summary that restates and a principle that instructs are two different
 * products, and that choice is made here (ADR-0003).
 */

import {SALES_DIMENSIONS, type SalesDimension} from './insight.ts';
import {MAX_WRITTEN_CHARS} from './tagging.ts';

/**
 * Bump on every wording change, including one that looks cosmetic.
 *
 * Prompts are not code: a reordered sentence can change the output
 * distribution, so "this edit cannot matter" is not a judgement anyone is
 * able to make from reading it.
 */
export const INSIGHT_TAGGING_PROMPT_VERSION = 'v1';

/** The task name written to `llm_usage.task` for this prompt. */
export const INSIGHT_TAGGING_TASK = `tag-insight@${INSIGHT_TAGGING_PROMPT_VERSION}`;

/**
 * What each dimension means in a job search.
 *
 * Straight from the table in docs/product-spec.md module 6. The model is
 * given these rather than the bare enum values because the values are
 * sales vocabulary and the captures will not be: without the examples,
 * "discovery" reads as a software term and a note about asking better
 * questions gets filed under storytelling.
 */
const DIMENSION_GUIDE: Record<SalesDimension, string> = {
  opening: 'cold messages, the first three minutes of an interview',
  discovery: "asking an interviewer about the team's real problems",
  storytelling: 'STAR answers, project walkthroughs',
  value_proposition: 'why you rather than another candidate',
  objections: 'doubts about experience, visa status, language',
  trust: 'follow-ups, referral relationships, being easy to believe',
  closing: 'asking for next steps, salary conversations',
  following_up: 'thank-you notes, staying in touch after a rejection',
};

/**
 * Builds the system instruction.
 *
 * The dimensions are interpolated from the same constant the validator
 * checks against, so a ninth dimension cannot be added to the enum and leave
 * the prompt describing eight. That drift is the most boring way a tagger
 * rots.
 *
 * @returns The system prompt, stable across calls so that provider-side
 *   prompt caching applies (architecture.md §7).
 */
export function insightTaggingPrompt(): string {
  return [
    'You read one thing a person captured while job-hunting and file it for',
    'practice. You do not advise, encourage, or write prose around your',
    'answer.',
    '',
    'Return a single JSON object and nothing else. No markdown fence, no',
    'explanation before or after it.',
    '',
    'Keys, all three required:',
    '',
    '  summary    one sentence: the point of what they captured, in plain',
    '             language. Not a description of the text ("this article',
    '             argues that…") — the point itself, as they would say it to',
    '             themselves later.',
    '  principle  one sentence, imperative: what to actually do about it next',
    '             time. "Ask what they tried before pitching anything", not',
    '             "discovery is important".',
    `  dims       an array of one to three of these, most relevant first:`,
    ...SALES_DIMENSIONS.map(
      dimension =>
        `               ${dimension} — ${DIMENSION_GUIDE[dimension]}`,
    ),
    '',
    'Rules you must follow:',
    '',
    '1. Add no facts. Everything in your answer must be supported by the text',
    '   you were given. If it names no company, name none.',
    `2. Keep each sentence under ${MAX_WRITTEN_CHARS.toString()} characters.`,
    '   One sentence, not two joined by a semicolon.',
    '3. Most captures belong to one dimension. Use two or three only when the',
    '   capture genuinely carries that many; a capture tagged with everything',
    '   is a capture nothing can find.',
    '4. The capture may have nothing to do with work — a line from a novel, a',
    '   conversation in a shop. That is expected and welcome. Find the',
    '   transferable principle and file it where it would be practised.',
    '5. If the text is too short or too empty to say anything true about,',
    '   return {} rather than inventing a point.',
    '',
    'This is filed, searched and rehearsed against later. A confident wrong',
    'tag is worse than a refusal, because nobody rereads a capture that looks',
    'processed.',
  ].join('\n');
}
