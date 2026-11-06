import {describe, expect, it} from 'vitest';

import type {Validated} from '../validation.ts';
import {parseApplicationDraft} from '../pipeline/draft.ts';
import {
  ADVERT_FIELDS,
  parseJobAdvert,
  type JobAdvertExtraction,
} from './advert.ts';
import {jobAdvertPrompt, JOB_ADVERT_TASK} from './advert-prompt.ts';

/** A realistic advert, with a domain and a URL genuinely present in it. */
const ADVERT = [
  'Software Engineer, Graduate (Backend) - London, UK',
  'Monzo Bank Ltd. Apply at https://monzo.com/careers/4821',
  'Hybrid, three days in the office.',
  'We are a licensed sponsor and can sponsor Skilled Worker visas.',
].join('\n');

const accepted = (
  result: Validated<JobAdvertExtraction>,
): JobAdvertExtraction => {
  if (!result.ok) {
    throw new Error(`Expected acceptance, got: ${result.problems.join(' ')}`);
  }
  return result.value;
};

const problems = (
  result: Validated<JobAdvertExtraction>,
): readonly string[] => {
  if (result.ok) {
    throw new Error('Expected a rejection.');
  }
  return result.problems;
};

describe('parseJobAdvert', () => {
  it('reads every field a good response supplies', () => {
    const extraction = accepted(
      parseJobAdvert(
        {
          company: 'Monzo Bank Ltd.',
          domain: 'monzo.com',
          role: 'Software Engineer, Graduate (Backend)',
          region: 'uk',
          workMode: 'hybrid',
          sponsorship: 'yes',
          sourceUrl: 'https://monzo.com/careers/4821',
        },
        ADVERT,
      ),
    );

    expect(extraction.fields.company).toBe('Monzo Bank Ltd.');
    expect(extraction.fields.domain).toBe('monzo.com');
    expect(extraction.fields.sponsorship).toBe('yes');
    expect(extraction.unestablished).toEqual([]);
  });

  describe('refuses a response that broke the contract', () => {
    it('when it is not an object', () => {
      expect(
        problems(parseJobAdvert('Software Engineer at Monzo', ADVERT)),
      ).toHaveLength(1);
      expect(problems(parseJobAdvert(null, ADVERT))).toHaveLength(1);
      expect(
        problems(parseJobAdvert([{company: 'Monzo'}], ADVERT)),
      ).toHaveLength(1);
    });

    it('rather than stringifying a nested object into a name', () => {
      const result = parseJobAdvert({company: {name: 'Monzo'}}, ADVERT);

      expect(problems(result)[0]).toContain('object');
      /* The failure this test exists for: String({name:'Monzo'}) is
         '[object Object]', which is a perfectly valid company name. */
      expect(problems(result)[0]).not.toContain('[object Object]');
    });

    it('when an enum value is not in the enum', () => {
      expect(problems(parseJobAdvert({region: 'france'}, ADVERT))[0]).toContain(
        'france',
      );
      expect(
        problems(parseJobAdvert({workMode: 'flexible'}, ADVERT))[0],
      ).toContain('flexible');
      expect(
        problems(parseJobAdvert({sponsorship: 'maybe'}, ADVERT))[0],
      ).toContain('maybe');
    });

    it('reporting every problem rather than the first', () => {
      const result = parseJobAdvert(
        {region: 'france', workMode: 'flexible', sponsorship: 'maybe'},
        ADVERT,
      );

      expect(problems(result)).toHaveLength(3);
    });
  });

  describe('treats absence as an answer', () => {
    it('accepting an empty object and naming every field as unestablished', () => {
      const extraction = accepted(parseJobAdvert({}, ADVERT));

      expect(extraction.unestablished).toEqual([...ADVERT_FIELDS]);
      expect(extraction.fields.company).toBe('');
    });

    it('treating null exactly like a missing key', () => {
      const extraction = accepted(
        parseJobAdvert({company: 'Monzo Bank Ltd.', domain: null}, ADVERT),
      );

      expect(extraction.unestablished).toContain('domain');
      expect(extraction.unestablished).not.toContain('company');
    });

    it('listing unestablished fields in a stable order', () => {
      const extraction = accepted(
        parseJobAdvert({role: 'Software Engineer, Graduate (Backend)'}, ADVERT),
      );

      expect(extraction.unestablished).toEqual(
        ADVERT_FIELDS.filter(field => field !== 'role'),
      );
    });
  });

  describe('drops a key the advert never mentioned', () => {
    it('for an invented domain', () => {
      const extraction = accepted(
        parseJobAdvert(
          {company: 'Monzo Bank Ltd.', domain: 'monzo-careers.co.uk'},
          ADVERT,
        ),
      );

      expect(extraction.fields.domain).toBe('');
      expect(extraction.unestablished).toContain('domain');
      /* Dropped, not refused: the company name is still worth showing. */
      expect(extraction.fields.company).toBe('Monzo Bank Ltd.');
    });

    it('for an invented URL', () => {
      const extraction = accepted(
        parseJobAdvert(
          {sourceUrl: 'https://boards.greenhouse.io/monzo/jobs/4821'},
          ADVERT,
        ),
      );

      expect(extraction.fields.sourceUrl).toBe('');
      expect(extraction.unestablished).toContain('sourceUrl');
    });

    it('but keeps one the advert does contain', () => {
      const extraction = accepted(
        parseJobAdvert({domain: 'https://www.monzo.com/'}, ADVERT),
      );

      expect(extraction.fields.domain).toBe('monzo.com');
      expect(extraction.unestablished).not.toContain('domain');
    });

    it('and does not ground a role title, which may be tidied', () => {
      const extraction = accepted(
        parseJobAdvert({role: 'Software Engineer, Graduate'}, ADVERT),
      );

      expect(extraction.fields.role).toBe('Software Engineer, Graduate');
    });
  });

  it('produces a form the ordinary create path accepts', () => {
    const extraction = accepted(
      parseJobAdvert(
        {
          company: 'Monzo Bank Ltd.',
          domain: 'monzo.com',
          role: 'Software Engineer, Graduate (Backend)',
          region: 'uk',
          workMode: 'hybrid',
          sponsorship: 'yes',
          sourceUrl: 'https://monzo.com/careers/4821',
        },
        ADVERT,
      ),
    );

    /* The claim the whole design rests on: an extraction is a filled-in form,
       so it goes through the same validation a typed-in form does. If this
       ever needs its own parser, the model has gained a private path to the
       database. */
    const draft = parseApplicationDraft({...extraction.fields, stage: ''});

    expect(draft.ok).toBe(true);
  });
});

describe('jobAdvertPrompt', () => {
  it('names every field the validator will accept', () => {
    const prompt = jobAdvertPrompt();

    for (const field of ADVERT_FIELDS) {
      expect(prompt).toContain(field);
    }
  });

  it('lists the regions the product actually supports', () => {
    /* Guards the dullest way a parser rots: a region is added to REGIONS, the
       prompt keeps describing the old set, and the new market silently never
       extracts. Interpolated rather than typed out, so this cannot drift. */
    expect(jobAdvertPrompt()).toContain('uk, ie, ee, jp, de, other');
    /* And says they are codes. Without this line a model answers
       "Estonia", which the validator refuses outright -- one unreadable
       word would sink an otherwise perfect extraction. */
    expect(jobAdvertPrompt()).toContain('codes, not country names');
  });

  it('carries a version that reaches the meter', () => {
    expect(JOB_ADVERT_TASK).toBe('parse-advert@v1');
  });
});
