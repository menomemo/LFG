/**
 * The instruction given to a model when it reads a job advert.
 *
 * A versioned file rather than an inline string, which CLAUDE.md requires
 * and which pays for itself the first time an extraction goes wrong: the
 * version is written to `llm_usage.task`, so a bad answer found next month
 * can be traced to the exact wording that produced it. An inline prompt
 * leaves only "the parser was worse in November".
 *
 * The prompt is here, in `core`, and not in the function that calls the
 * provider. What a model is asked for is a product rule — it decides which
 * fields exist and what counts as not knowing one — and ADR-0003 puts rules
 * here. The caller supplies bytes and a network connection.
 */

import {REGIONS} from '../regions/region.ts';
import {SPONSORSHIP_VALUES, WORK_MODES} from './job.ts';
import {ADVERT_FIELDS} from './advert.ts';

/**
 * Bump on every wording change, including one that looks cosmetic.
 *
 * Prompts are not code: a reordered sentence can change the output
 * distribution, so "this edit cannot matter" is not a judgement anyone is
 * able to make from reading it.
 */
export const JOB_ADVERT_PROMPT_VERSION = 'v1';

/** The task name written to `llm_usage.task` for this prompt. */
export const JOB_ADVERT_TASK = `parse-advert@${JOB_ADVERT_PROMPT_VERSION}`;

/**
 * Builds the system instruction.
 *
 * The enums are interpolated from the same constants the validator checks
 * against, so a region added to `REGIONS` cannot leave the prompt behind.
 * That drift is the most boring way a parser rots: the model keeps being
 * told about four markets while the product supports five, and the fifth
 * silently never extracts.
 *
 * @returns The system prompt, stable across calls so that provider-side
 *   prompt caching applies (architecture.md §7).
 */
export function jobAdvertPrompt(): string {
  return [
    'You extract structured fields from a job advert. You do not summarise,',
    'advise, or write prose.',
    '',
    'Return a single JSON object and nothing else. No markdown fence, no',
    'explanation before or after it.',
    '',
    'Keys, all optional, all string-valued:',
    ...ADVERT_FIELDS.map(field => `  ${field}`),
    '',
    `  company      the employer's name, as the advert writes it`,
    "  domain       the employer's website host, such as stripe.com. Only if",
    '               the advert actually contains it. Never guess it from the',
    '               company name.',
    '  role         the job title, without the location or the req number',
    `  region       one of: ${REGIONS.join(', ')}`,
    '               These are codes, not country names: use "ee" for an',
    '               Estonian role, not "Estonia". Use "other" for a market',
    '               not in the list.',
    `  workMode     one of: ${WORK_MODES.join(', ')}`,
    `  sponsorship  one of: ${SPONSORSHIP_VALUES.join(', ')} -- whether the`,
    '               employer says it sponsors a work visa. Use "unknown" when',
    '               the advert does not say, which is the usual case.',
    "  sourceUrl    the advert's own address, only if it appears in the text",
    '',
    'Rules you must follow:',
    '',
    '1. Omit a key you cannot establish from the text. An omitted key is a',
    '   correct answer. A guess is not.',
    '2. Never infer a domain or a URL from a company name. If the advert does',
    '   not contain it, omit it.',
    '3. Do not translate, expand abbreviations, or tidy the company name.',
    '4. If the text is not a job advert, return {}.',
    '',
    'The person who pasted this will read every field before anything is',
    'saved. An omission costs them five seconds. A confident wrong answer',
    'costs them a wrong record they may not notice.',
  ].join('\n');
}
