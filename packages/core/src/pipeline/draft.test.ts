import {describe, expect, it} from 'vitest';

import type {Validated} from '../validation';
import {
  parseApplicationDraft,
  parseApplicationEdit,
  SELF_REPORTED,
  type ApplicationDraft,
  type ApplicationDraftFields,
  type ApplicationEdit,
  type ApplicationEditFields,
} from './draft';

/** A form with every required field filled in and every optional one blank. */
const FILLED: ApplicationDraftFields = {
  company: 'Stripe',
  domain: '',
  role: 'Software Engineer, Graduate',
  region: 'uk',
  workMode: '',
  sponsorship: '',
  sourceUrl: '',
  stage: '',
};

const form = (
  overrides: Partial<ApplicationDraftFields>,
): ApplicationDraftFields => ({...FILLED, ...overrides});

const accepted = (result: Validated<ApplicationDraft>): ApplicationDraft => {
  if (!result.ok) {
    throw new Error(`Expected acceptance, got: ${result.problems.join(' ')}`);
  }
  return result.value;
};

const problems = (result: Validated<ApplicationDraft>): readonly string[] => {
  if (result.ok) {
    throw new Error('Expected a rejection.');
  }
  return result.problems;
};

describe('parseApplicationDraft', () => {
  it('produces all three rows from one form', () => {
    expect(accepted(parseApplicationDraft(FILLED))).toEqual({
      company: {name: 'Stripe', domain: null, region: 'uk'},
      job: {
        title: 'Software Engineer, Graduate',
        region: 'uk',
        workMode: null,
        sponsorship: 'unknown',
        sponsorshipSource: null,
        sourceUrl: null,
      },
      stage: 'saved',
    });
  });

  it('starts an application at saved when no stage was chosen', () => {
    expect(accepted(parseApplicationDraft(FILLED)).stage).toBe('saved');
  });

  it('starts it wherever the person says, for a search already underway', () => {
    expect(
      accepted(parseApplicationDraft(form({stage: 'interview'}))).stage,
    ).toBe('interview');
  });

  it('trims the fields a person types', () => {
    const draft = accepted(
      parseApplicationDraft(
        form({company: '  Stripe  ', role: '  Engineer \n'}),
      ),
    );
    expect(draft.company.name).toBe('Stripe');
    expect(draft.job.title).toBe('Engineer');
  });

  it('gives the job and the company the same region', () => {
    const draft = accepted(parseApplicationDraft(form({region: 'jp'})));
    expect(draft.company.region).toBe('jp');
    expect(draft.job.region).toBe('jp');
  });

  it('normalises the domain, so one employer keeps one row', () => {
    expect(
      accepted(parseApplicationDraft(form({domain: 'HTTPS://www.Stripe.com/'})))
        .company.domain,
    ).toBe('stripe.com');
  });

  it('accepts a blank domain as not established', () => {
    expect(accepted(parseApplicationDraft(FILLED)).company.domain).toBeNull();
  });

  it('refuses a domain that is not one rather than dropping it', () => {
    const result = parseApplicationDraft(form({domain: 'Stripe Inc'}));
    expect(problems(result)).toHaveLength(1);
    expect(problems(result)[0]).toContain('is not a domain');
  });

  it('records a work mode when given one', () => {
    expect(
      accepted(parseApplicationDraft(form({workMode: 'hybrid'}))).job.workMode,
    ).toBe('hybrid');
  });

  it('leaves an unstated work mode unknown rather than guessing onsite', () => {
    expect(accepted(parseApplicationDraft(FILLED)).job.workMode).toBeNull();
  });

  it('reads a blank sponsorship answer as unknown, which is a claim about us', () => {
    const draft = accepted(parseApplicationDraft(FILLED));
    expect(draft.job.sponsorship).toBe('unknown');
    expect(draft.job.sponsorshipSource).toBeNull();
  });

  it.each([['yes'], ['no']])(
    'gives a confirmed sponsorship answer of %s a source',
    value => {
      const draft = accepted(parseApplicationDraft(form({sponsorship: value})));
      expect(draft.job.sponsorship).toBe(value);
      expect(draft.job.sponsorshipSource).toBe(SELF_REPORTED);
    },
  );

  it('keeps a job advert link', () => {
    expect(
      accepted(
        parseApplicationDraft(
          form({sourceUrl: 'https://boards.greenhouse.io/stripe/jobs/1'}),
        ),
      ).job.sourceUrl,
    ).toBe('https://boards.greenhouse.io/stripe/jobs/1');
  });

  it.each([
    ['a bare domain', 'stripe.com/jobs'],
    ['a note instead of a link', 'saw it on LinkedIn'],
    ['a scheme we cannot fetch', 'ftp://stripe.com/jobs'],
  ])('refuses %s as a job advert link', (_label, value) => {
    expect(problems(parseApplicationDraft(form({sourceUrl: value})))).toEqual([
      'The job advert link must be an http or https address.',
    ]);
  });

  it('requires a company name', () => {
    expect(problems(parseApplicationDraft(form({company: '   '})))).toEqual([
      'A company name is required.',
    ]);
  });

  it('requires a role title', () => {
    expect(problems(parseApplicationDraft(form({role: ''})))).toEqual([
      'A role title is required.',
    ]);
  });

  it('refuses an unknown region rather than defaulting to one', () => {
    const result = parseApplicationDraft(form({region: 'fr'}));
    expect(problems(result)[0]).toContain('Region must be one of');
  });

  it('refuses a missing region, because a default is the wrong playbook', () => {
    expect(problems(parseApplicationDraft(form({region: ''})))).toHaveLength(1);
  });

  it.each([
    ['an invented work mode', {workMode: 'wfh'}],
    ['an invented sponsorship answer', {sponsorship: 'maybe'}],
    ['ghosted, which is derived rather than entered', {stage: 'ghosted'}],
    ['an invented stage', {stage: 'negotiating'}],
  ])('refuses %s', (_label, overrides) => {
    expect(problems(parseApplicationDraft(form(overrides)))).toHaveLength(1);
  });

  it('reports every problem at once rather than one per submission', () => {
    expect(
      problems(
        parseApplicationDraft({
          company: '',
          domain: 'not a domain',
          role: '',
          region: 'fr',
          workMode: 'wfh',
          sponsorship: 'maybe',
          sourceUrl: 'nope',
          stage: 'negotiating',
        }),
      ),
    ).toHaveLength(8);
  });

  it('refuses the empty form with something to show the person', () => {
    const result = parseApplicationDraft({
      company: '',
      domain: '',
      role: '',
      region: '',
      workMode: '',
      sponsorship: '',
      sourceUrl: '',
      stage: '',
    });
    expect(problems(result)).toHaveLength(3);
  });
});

const EDIT: ApplicationEditFields = {
  region: 'uk',
  workMode: '',
  sponsorship: 'unknown',
  sourceUrl: '',
  notes: '',
  nextActionAt: '',
  recordedSponsorshipSource: '',
};

const edit = (
  overrides: Partial<ApplicationEditFields>,
): ApplicationEditFields => ({...EDIT, ...overrides});

const edited = (result: Validated<ApplicationEdit>): ApplicationEdit => {
  if (!result.ok) {
    throw new Error(`Expected acceptance, got: ${result.problems.join(' ')}`);
  }
  return result.value;
};

const refused = (result: Validated<ApplicationEdit>): readonly string[] => {
  if (result.ok) {
    throw new Error('Expected a rejection.');
  }
  return result.problems;
};

describe('parseApplicationEdit', () => {
  it('changes nothing it was not given', () => {
    expect(edited(parseApplicationEdit(EDIT))).toEqual({
      job: {
        region: 'uk',
        workMode: null,
        sponsorship: 'unknown',
        sponsorshipSource: null,
        sourceUrl: null,
      },
      application: {notes: null, nextActionAt: null},
    });
  });

  it('reads a blank note as none written, not as an empty one', () => {
    expect(
      edited(parseApplicationEdit(edit({notes: '   \n  '}))).application.notes,
    ).toBeNull();
  });

  it('trims a note that was written', () => {
    expect(
      edited(parseApplicationEdit(edit({notes: '  ask about the on-call  '})))
        .application.notes,
    ).toBe('ask about the on-call');
  });

  it('keeps the source a confirmed sponsorship answer already had', () => {
    const result = edited(
      parseApplicationEdit(
        edit({
          sponsorship: 'yes',
          recordedSponsorshipSource:
            'UK register of licensed sponsors, checked 2026-11-04',
        }),
      ),
    );
    expect(result.job.sponsorshipSource).toBe(
      'UK register of licensed sponsors, checked 2026-11-04',
    );
  });

  it('marks a newly confirmed answer as self-reported', () => {
    expect(
      edited(parseApplicationEdit(edit({sponsorship: 'no'}))).job
        .sponsorshipSource,
    ).toBe(SELF_REPORTED);
  });

  it('drops the source when the answer goes back to unknown', () => {
    const result = edited(
      parseApplicationEdit(
        edit({
          sponsorship: 'unknown',
          recordedSponsorshipSource: 'the recruiter said so',
        }),
      ),
    );
    expect(result.job.sponsorship).toBe('unknown');
    expect(result.job.sponsorshipSource).toBeNull();
  });

  it('accepts a next action date from a date control', () => {
    const result = edited(
      parseApplicationEdit(edit({nextActionAt: '2026-11-20'})),
    );
    expect(result.application.nextActionAt?.toISOString()).toBe(
      '2026-11-20T12:00:00.000Z',
    );
  });

  it('puts that date at midday, so no timezone moves it to the day before', () => {
    const at = edited(parseApplicationEdit(edit({nextActionAt: '2026-01-01'})))
      .application.nextActionAt;
    expect(at?.getUTCDate()).toBe(1);
    expect(at?.getUTCHours()).toBe(12);
  });

  it('reads a blank next action as nothing scheduled', () => {
    expect(
      edited(parseApplicationEdit(EDIT)).application.nextActionAt,
    ).toBeNull();
  });

  it.each([
    ['a sentence', 'next tuesday'],
    ['the wrong order', '20-11-2026'],
    ['a date that is not one', '2026-13-45'],
  ])('refuses %s as a next action date', (_label, value) => {
    expect(refused(parseApplicationEdit(edit({nextActionAt: value})))).toEqual([
      'The next action date must be a date, or blank.',
    ]);
  });

  it('refuses an unknown region rather than defaulting to one', () => {
    expect(refused(parseApplicationEdit(edit({region: 'fr'})))[0]).toContain(
      'Region must be one of',
    );
  });

  it.each([
    ['an invented work mode', {workMode: 'wfh'}],
    ['an invented sponsorship answer', {sponsorship: 'maybe'}],
    ['a link that is not one', {sourceUrl: 'saw it on LinkedIn'}],
  ])('refuses %s', (_label, overrides) => {
    expect(refused(parseApplicationEdit(edit(overrides)))).toHaveLength(1);
  });

  it('reports every problem at once', () => {
    expect(
      refused(
        parseApplicationEdit({
          region: 'fr',
          workMode: 'wfh',
          sponsorship: 'maybe',
          sourceUrl: 'nope',
          notes: '',
          nextActionAt: 'soon',
          recordedSponsorshipSource: '',
        }),
      ),
    ).toHaveLength(5);
  });
});
