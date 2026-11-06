/**
 * Reading a pasted job advert into the create form.
 *
 * A model does the extraction; this module decides what is allowed back.
 * Those are deliberately separate jobs, and the separation is the whole
 * point of the file: the thing that produces the answer is not the thing
 * that decides the answer is acceptable.
 *
 * Three rules shape everything here.
 *
 * CLAUDE.md rule 5 says parse, never trust. The argument arrives as
 * `unknown` because that is the honest type for a provider's response body,
 * and nothing is coerced on the way in — a model that answers
 * `{"company": {"name": "Stripe"}}` instead of `{"company": "Stripe"}` is
 * refused, not stringified into `[object Object]`.
 *
 * CLAUDE.md rule 8 says unknown is not zero. Every field is allowed to come
 * back absent, and absent becomes a blank form field plus a named entry in
 * `unestablished` — never a plausible guess. A model that will not say "I
 * could not find it" is worse than no model.
 *
 * CLAUDE.md rule 7 says a human submits. The output of this module is
 * therefore `ApplicationDraftFields` — the same string-keyed shape a browser
 * posts — and not an `ApplicationDraft`. The extraction fills the form in;
 * the person reads it and presses the button. There is no path from a model
 * to the database that does not pass through a person and through
 * `parseApplicationDraft`, which is the same validation a typed-in form gets.
 */

import {normaliseDomain} from '../companies/domain';
import {isRegion, REGIONS} from '../regions/region';
import {isSponsorship, isWorkMode, SPONSORSHIP_VALUES, WORK_MODES} from './job';
import {accept, reject, type Validated} from '../validation';

/**
 * The fields a model is asked to find, in the order the form shows them.
 *
 * `stage` is deliberately not here. Nothing in an advert says what stage an
 * application is in — that is a fact about the person's search, not about
 * the posting — so asking for it would be inviting an invention.
 */
export const ADVERT_FIELDS = [
  'company',
  'domain',
  'role',
  'region',
  'workMode',
  'sponsorship',
  'sourceUrl',
] as const;

/** One of the fields an extraction may fill in. */
export type AdvertField = (typeof ADVERT_FIELDS)[number];

/**
 * What an extraction produced, and what it admitted it could not find.
 *
 * `unestablished` is not an error list. It is the part of the form the
 * person still has to fill in themselves, and the UI owes them that
 * distinction: a blank the model left alone looks exactly like a blank the
 * model never considered, and only one of those is worth re-reading the
 * advert for.
 */
export interface JobAdvertExtraction {
  /** Ready to be rendered into the create form. Blank means not established. */
  readonly fields: ApplicationDraftFieldsFromAdvert;
  /** Fields left blank, named. Sorted in `ADVERT_FIELDS` order. */
  readonly unestablished: readonly AdvertField[];
}

/**
 * The form fields an advert can supply.
 *
 * Structurally an `ApplicationDraftFields` minus `stage`, which the surface
 * supplies. Spelled out rather than derived so that adding a form field does
 * not silently become something a model is trusted to answer.
 */
export interface ApplicationDraftFieldsFromAdvert {
  readonly company: string;
  readonly domain: string;
  readonly role: string;
  readonly region: string;
  readonly workMode: string;
  readonly sponsorship: string;
  readonly sourceUrl: string;
}

/**
 * Fields whose value must appear in the advert the model was given.
 *
 * Both of these are keys rather than descriptions, and that is why they are
 * checked and the others are not. `domain` is the deduplication key — a
 * plausible invention gives one employer two rows, which is the failure
 * `normaliseDomain` exists to prevent. `sourceUrl` is the cache key and the
 * unique index that stops the same posting being paid for twice.
 *
 * A model inventing `careers.stripe.com` for an advert that never said it is
 * not a hypothetical: it is the single most likely thing a fluent model does
 * with a company name. Grounding is cheap here because the source text is in
 * hand, so there is no excuse for taking it on trust.
 *
 * The role title and the company name are NOT grounded this way on purpose.
 * An advert that says "Software Engineer, Backend (London)" should be allowed
 * to yield the role "Software Engineer, Backend", and a substring check would
 * reject every reasonable tidy-up a model makes.
 */
const GROUNDED_FIELDS = ['domain', 'sourceUrl'] as const;

function list(values: readonly string[]): string {
  return values.join(', ');
}

/**
 * Reads one value out of a model's object, refusing anything that is not a
 * string.
 *
 * `null` and a missing key both mean "not found", which is a legitimate
 * answer. A number, an object or an array is a contract violation: the model
 * was told to return strings, and quietly calling `String()` on the result is
 * how `[object Object]` ends up in a company name column.
 */
function readField(
  source: Record<string, unknown>,
  field: AdvertField,
  problems: string[],
): string {
  const value = source[field];
  if (value === undefined || value === null) {
    return '';
  }
  if (typeof value !== 'string') {
    problems.push(
      `The model returned ${typeof value} for "${field}"; every field must ` +
        'be a string or absent.',
    );
    return '';
  }
  return value.trim();
}

/**
 * Validates a model's extraction against the advert it was given.
 *
 * Refusal and omission are different outcomes and this function uses both.
 * A value that breaks the contract — a non-string, a region that is not a
 * region — is a refusal, because it means the call went wrong and retrying
 * is the right response. A value that is merely absent, or that fails its
 * grounding check, is dropped to blank and named in `unestablished`, because
 * the rest of the extraction is still worth showing to a person.
 *
 * @param raw The parsed response body. `unknown` because that is what it is.
 * @param advert The text the model was given, for grounding checks.
 * @returns The form to render, or every reason the response was unusable.
 */
export function parseJobAdvert(
  raw: unknown,
  advert: string,
): Validated<JobAdvertExtraction> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return reject([
      'The model did not return a JSON object. Nothing can be read from ' +
        'this response.',
    ]);
  }

  const source = raw as Record<string, unknown>;
  const problems: string[] = [];
  const unestablished: AdvertField[] = [];

  const company = readField(source, 'company', problems);
  const role = readField(source, 'role', problems);
  const sourceUrl = readField(source, 'sourceUrl', problems);

  /* A domain that is not a domain is a refusal rather than a blank: it means
     the model ignored the format it was given, and the next field it got
     wrong may be one with no format to check. */
  const rawDomain = readField(source, 'domain', problems);
  const domain = rawDomain === '' ? '' : (normaliseDomain(rawDomain) ?? '');
  if (rawDomain !== '' && domain === '') {
    problems.push(`The model returned "${rawDomain}" as a domain.`);
  }

  /* The enums are refusals for the same reason. There are only three work
     modes; a model that answers "flexible" was not reading the instruction,
     and accepting it as blank would hide that. */
  const region = readField(source, 'region', problems);
  if (region !== '' && !isRegion(region)) {
    problems.push(
      `The model returned "${region}" as a region; it must be one of ` +
        `${list(REGIONS)} or absent.`,
    );
  }

  const workMode = readField(source, 'workMode', problems);
  if (workMode !== '' && !isWorkMode(workMode)) {
    problems.push(
      `The model returned "${workMode}" as a work mode; it must be one of ` +
        `${list(WORK_MODES)} or absent.`,
    );
  }

  /* `unknown` is a real answer here rather than an absence, and the schema
     says so. A model that writes it has read the advert and found no claim
     either way, which is different from not having looked. */
  const sponsorship = readField(source, 'sponsorship', problems);
  if (sponsorship !== '' && !isSponsorship(sponsorship)) {
    problems.push(
      `The model returned "${sponsorship}" as a sponsorship answer; it must ` +
        `be one of ${list(SPONSORSHIP_VALUES)} or absent.`,
    );
  }

  if (problems.length > 0) {
    return reject(problems);
  }

  const fields: Record<AdvertField, string> = {
    company,
    domain,
    role,
    region,
    workMode,
    sponsorship,
    sourceUrl,
  };

  /* Grounding, after validation rather than inside it: a value can be a
     perfectly well-formed domain and still be one the advert never mentioned.
     Dropped rather than refused, because the rest of the extraction is good
     and the person can supply this field in two seconds. */
  const haystack = advert.toLowerCase();
  for (const field of GROUNDED_FIELDS) {
    const value = fields[field];
    if (value !== '' && !haystack.includes(value.toLowerCase())) {
      fields[field] = '';
    }
  }

  for (const field of ADVERT_FIELDS) {
    if (fields[field] === '') {
      unestablished.push(field);
    }
  }

  return accept({
    fields: {
      company: fields.company,
      domain: fields.domain,
      role: fields.role,
      region: fields.region,
      workMode: fields.workMode,
      sponsorship: fields.sponsorship,
      sourceUrl: fields.sourceUrl,
    },
    unestablished,
  });
}
