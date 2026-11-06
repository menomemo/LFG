/**
 * Turning a filled-in form into the three rows an application needs.
 *
 * An application points at a job, and a job points at a company
 * (supabase/migrations/20261105093000), so adding one role to the board is
 * three inserts. The person doing it should not have to know that, which
 * means something has to take one form and produce all three — including the
 * parts the database will refuse if they are missing, such as the provenance
 * that a confirmed sponsorship answer has to carry.
 *
 * That translation is a rule, so it lives here and not in the surface. The
 * web form is only the first caller: the JD parser arrives next in Phase 1
 * and must produce exactly the same shape from a pasted advert, down to
 * saying where its sponsorship answer came from.
 */

import {normaliseDomain} from '../companies/domain';
import {isRegion, REGIONS, type Region} from '../regions/region';
import {
  isSponsorship,
  isWorkMode,
  SPONSORSHIP_VALUES,
  WORK_MODES,
  type Sponsorship,
  type WorkMode,
} from '../jobs/job';
import {accept, reject, type Validated} from '../validation';
import {
  isApplicationStage,
  APPLICATION_STAGES,
  type ApplicationStage,
} from './stage';

/**
 * The source recorded for a sponsorship answer a person gave themselves.
 *
 * `jobs.visa_sponsorship_source` is `NOT NULL` whenever the answer is not
 * `unknown`, and the constraint exists because a value read from the UK's
 * register of licensed sponsors and a value someone inferred from an advert
 * are not the same fact. This is the honest label for the second kind. When
 * the register ingest lands in Phase 2 it will write its own.
 */
export const SELF_REPORTED = 'self-reported';

/**
 * A create form, as a browser hands it over.
 *
 * Every field is a string, including the ones that will become enums, because
 * that is what a form body contains. Empty means the field was left blank,
 * which for an optional field is information and not an error.
 */
export interface ApplicationDraftFields {
  readonly company: string;
  readonly domain: string;
  readonly role: string;
  readonly region: string;
  readonly workMode: string;
  readonly sponsorship: string;
  readonly sourceUrl: string;
  readonly stage: string;
}

/** The company row an application needs, found or created. */
export interface CompanyDraft {
  readonly name: string;
  /** The deduplication key, or `null` when the person did not give one. */
  readonly domain: string | null;
  /** The market this role is in, which the company is now known to hire in. */
  readonly region: Region;
}

/** The job row an application points at. */
export interface JobDraft {
  readonly title: string;
  readonly region: Region;
  readonly workMode: WorkMode | null;
  readonly sponsorship: Sponsorship;
  /** `null` exactly when the answer is `unknown`, as the table requires. */
  readonly sponsorshipSource: string | null;
  readonly sourceUrl: string | null;
}

/** Everything one submitted form says, in the shape the three tables want. */
export interface ApplicationDraft {
  readonly company: CompanyDraft;
  readonly job: JobDraft;
  /** The stage the application starts in. */
  readonly stage: ApplicationStage;
}

/* Accepts what a person can reasonably paste as a job advert's address.
   Narrow on purpose: `jobs.source_url` is the key the JD parser caches on and
   the unique index that stops the same posting being paid for twice. */
const HTTP_URL = /^https?:\/\/[^\s/]+\.[^\s/]+(?:\/\S*)?$/;

function list(values: readonly string[]): string {
  return values.join(', ');
}

/**
 * Parses a submitted create form.
 *
 * Nothing here coerces. A region that is not a region is refused rather than
 * defaulted, because a default would silently file a Tokyo role under the
 * British playbook — the wrong résumé template, the wrong visa question and a
 * concentration metric that no longer describes the search (ADR-0004).
 *
 * Blank optional fields are the exception, and they become `null` rather than
 * a guess: an unstated work mode is unknown, not onsite.
 *
 * @param fields The raw form values.
 * @returns The three rows to write, or every reason the form was refused.
 */
export function parseApplicationDraft(
  fields: ApplicationDraftFields,
): Validated<ApplicationDraft> {
  const problems: string[] = [];

  const name = fields.company.trim();
  if (name === '') {
    problems.push('A company name is required.');
  }

  const title = fields.role.trim();
  if (title === '') {
    problems.push('A role title is required.');
  }

  const rawRegion = fields.region.trim();
  const region = isRegion(rawRegion) ? rawRegion : null;
  if (region === null) {
    problems.push(`Region must be one of ${list(REGIONS)}.`);
  }

  /* Blank is the honest answer when nobody has established a domain; a
     non-empty value that is not a domain is a mistake worth saying out loud,
     because silently dropping it is what gives one employer two rows. */
  const rawDomain = fields.domain.trim();
  const domain = rawDomain === '' ? null : normaliseDomain(rawDomain);
  if (rawDomain !== '' && domain === null) {
    problems.push(
      `"${rawDomain}" is not a domain. Give the company's website, such as ` +
        'stripe.com, or leave it blank.',
    );
  }

  let workMode: WorkMode | null = null;
  const rawWorkMode = fields.workMode.trim();
  if (rawWorkMode !== '') {
    if (isWorkMode(rawWorkMode)) {
      workMode = rawWorkMode;
    } else {
      problems.push(`Work mode must be one of ${list(WORK_MODES)}, or blank.`);
    }
  }

  /* Unlike the others, a blank sponsorship answer has a meaning the schema
     already names: `unknown`, which is a claim about our knowledge and not
     about the employer. */
  const rawSponsorship = fields.sponsorship.trim();
  const sponsorship: Sponsorship | null =
    rawSponsorship === ''
      ? 'unknown'
      : isSponsorship(rawSponsorship)
        ? rawSponsorship
        : null;
  if (sponsorship === null) {
    problems.push(`Sponsorship must be one of ${list(SPONSORSHIP_VALUES)}.`);
  }

  const rawSourceUrl = fields.sourceUrl.trim();
  const sourceUrl = rawSourceUrl === '' ? null : rawSourceUrl;
  if (sourceUrl !== null && !HTTP_URL.test(sourceUrl)) {
    problems.push('The job advert link must be an http or https address.');
  }

  const rawStage = fields.stage.trim();
  const stage: ApplicationStage | null =
    rawStage === '' ? 'saved' : isApplicationStage(rawStage) ? rawStage : null;
  if (stage === null) {
    problems.push(`Stage must be one of ${list(APPLICATION_STAGES)}.`);
  }

  if (problems.length > 0) {
    return reject(problems);
  }

  /* Not reachable: each of these three being null pushed a problem above, and
     problems have already returned. Narrowing anyway, because the alternative
     is a non-null assertion, which core does not get to make
     (docs/code-standards.md). */
  if (region === null || sponsorship === null || stage === null) {
    return reject(['The form could not be read.']);
  }

  return accept({
    company: {name, domain, region},
    job: {
      title,
      region,
      workMode,
      sponsorship,
      sponsorshipSource: sponsorship === 'unknown' ? null : SELF_REPORTED,
      sourceUrl,
    },
    stage,
  });
}

/**
 * An edit to an application that already exists.
 *
 * Narrower than a draft on purpose. The company and the role title are the
 * identity of the thing this application points at rather than properties of
 * the application, so they are shown as relations and not typed over; the
 * domain is the deduplication key; and the stage is appended to the history
 * rather than set. What is left is what a person can sensibly change about
 * an application they already have.
 */
export interface ApplicationEditFields {
  readonly region: string;
  readonly workMode: string;
  readonly sponsorship: string;
  readonly sourceUrl: string;
  readonly notes: string;
  /**
   * The note about the employer, which every application to it shares.
   *
   * It arrives in the same form as the rest because it is edited in the same
   * place, and leaves in its own part of the result because it is written to
   * its own row. It is never copied onto the application: the same sentence
   * in two rows is one sentence and one stale copy, with nothing to say
   * which is which.
   */
  readonly companyNotes: string;
  /** A calendar date from a date control: `YYYY-MM-DD`, or empty. */
  readonly nextActionAt: string;
  /**
   * The source already recorded against the sponsorship answer, read from
   * the database rather than from the form.
   *
   * It is an input because the rule needs it, and it comes from the row
   * rather than from the person editing: a source saying the UK register of
   * licensed sponsors was consulted is a claim about where a fact came from,
   * and a form field is not allowed to make that claim (CLAUDE.md rule 3).
   */
  readonly recordedSponsorshipSource: string;
}

/** What an edit changes, split by the table it lands in. */
export interface ApplicationEdit {
  readonly company: {
    /** `null` when nobody has written one, which is not the same as empty. */
    readonly notes: string | null;
  };
  readonly job: {
    readonly region: Region;
    readonly workMode: WorkMode | null;
    readonly sponsorship: Sponsorship;
    readonly sponsorshipSource: string | null;
    readonly sourceUrl: string | null;
  };
  readonly application: {
    /** `null` when nobody has written one, which is not the same as empty. */
    readonly notes: string | null;
    /** `null` when nothing is scheduled, which is not a date in the past. */
    readonly nextActionAt: Date | null;
  };
}

/* A calendar date as a date control submits one. */
const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Parses an edit to an existing application.
 *
 * The same refusals as {@link parseApplicationDraft}, for the same reasons,
 * with one rule of its own: an answer about sponsorship keeps the source it
 * already had. Someone switching `unknown` to `yes` is reporting it
 * themselves and gets {@link SELF_REPORTED}; someone who leaves a confirmed
 * answer alone must not have the register silently relabelled as hearsay.
 *
 * @param fields The submitted form, plus the source already on the row.
 * @returns What to write, or every reason the edit was refused.
 */
export function parseApplicationEdit(
  fields: ApplicationEditFields,
): Validated<ApplicationEdit> {
  const problems: string[] = [];

  const rawRegion = fields.region.trim();
  const region = isRegion(rawRegion) ? rawRegion : null;
  if (region === null) {
    problems.push(`Region must be one of ${list(REGIONS)}.`);
  }

  let workMode: WorkMode | null = null;
  const rawWorkMode = fields.workMode.trim();
  if (rawWorkMode !== '') {
    if (isWorkMode(rawWorkMode)) {
      workMode = rawWorkMode;
    } else {
      problems.push(`Work mode must be one of ${list(WORK_MODES)}, or blank.`);
    }
  }

  const rawSponsorship = fields.sponsorship.trim();
  const sponsorship: Sponsorship | null =
    rawSponsorship === ''
      ? 'unknown'
      : isSponsorship(rawSponsorship)
        ? rawSponsorship
        : null;
  if (sponsorship === null) {
    problems.push(`Sponsorship must be one of ${list(SPONSORSHIP_VALUES)}.`);
  }

  const rawSourceUrl = fields.sourceUrl.trim();
  const sourceUrl = rawSourceUrl === '' ? null : rawSourceUrl;
  if (sourceUrl !== null && !HTTP_URL.test(sourceUrl)) {
    problems.push('The job advert link must be an http or https address.');
  }

  /* Midday UTC rather than midnight: a calendar date has no time, and
     midnight is the moment a timezone offset turns it into the day before. */
  let nextActionAt: Date | null = null;
  const rawNextAction = fields.nextActionAt.trim();
  if (rawNextAction !== '') {
    const parsed = CALENDAR_DATE.test(rawNextAction)
      ? new Date(`${rawNextAction}T12:00:00.000Z`)
      : new Date(Number.NaN);
    if (Number.isNaN(parsed.getTime())) {
      problems.push('The next action date must be a date, or blank.');
    } else {
      nextActionAt = parsed;
    }
  }

  const trimmedNotes = fields.notes.trim();
  const notes = trimmedNotes === '' ? null : trimmedNotes;

  const trimmedCompanyNotes = fields.companyNotes.trim();
  const companyNotes = trimmedCompanyNotes === '' ? null : trimmedCompanyNotes;

  if (problems.length > 0) {
    return reject(problems);
  }

  if (region === null || sponsorship === null) {
    return reject(['The form could not be read.']);
  }

  const recorded = fields.recordedSponsorshipSource.trim();
  return accept({
    company: {notes: companyNotes},
    job: {
      region,
      workMode,
      sponsorship,
      sponsorshipSource:
        sponsorship === 'unknown'
          ? null
          : recorded === ''
            ? SELF_REPORTED
            : recorded,
      sourceUrl,
    },
    application: {notes, nextActionAt},
  });
}
