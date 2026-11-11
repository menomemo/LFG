import {describe, expect, it} from 'vitest';

import {parseCompanyWatch, type CompanyWatchFields} from './watch';

/** A submission that passes, so each test can change one thing about it. */
const VALID: CompanyWatchFields = {
  name: 'Monzo',
  ats: 'greenhouse',
  board: 'monzo',
};

function watch(changes: Partial<CompanyWatchFields>) {
  return parseCompanyWatch({...VALID, ...changes});
}

/** The problems, or a failure that says the input was wrongly accepted. */
function problems(result: ReturnType<typeof parseCompanyWatch>): string {
  if (result.ok) {
    throw new Error(`expected a refusal, got ${JSON.stringify(result.value)}`);
  }
  return result.problems.join(' ');
}

describe('parseCompanyWatch', () => {
  it('accepts a name and a bare slug', () => {
    const result = watch({});
    expect(result).toEqual({
      ok: true,
      value: {name: 'Monzo', ats: 'greenhouse', slug: 'monzo'},
    });
  });

  it('trims the company name', () => {
    const result = watch({name: '  Monzo  '});
    expect(result.ok && result.value.name).toBe('Monzo');
  });

  it('lower-cases a slug, because the endpoint is case-sensitive', () => {
    const result = watch({board: 'Monzo'});
    expect(result.ok && result.value.slug).toBe('monzo');
  });

  it('refuses an empty name', () => {
    expect(problems(watch({name: '   '}))).toContain('needs a name');
  });

  it('refuses a provider that is not one we can poll', () => {
    /* A real ats_type value, and deliberately not pollable: there is no
       public Workday endpoint, so storing it would create a company the
       poller skips every run while looking watched. */
    expect(problems(watch({ats: 'workday'}))).toContain('Choose the provider');
  });

  it('refuses an empty board', () => {
    expect(problems(watch({board: ''}))).toContain('Give the board');
  });

  describe('pasted links', () => {
    it.each([
      ['https://jobs.lever.co/deliveroo', 'lever', 'deliveroo'],
      ['https://boards.greenhouse.io/monzo', 'greenhouse', 'monzo'],
      ['https://job-boards.greenhouse.io/monzo', 'greenhouse', 'monzo'],
      ['https://jobs.ashbyhq.com/openai', 'ashby', 'openai'],
      /* The endpoint this project actually fetches. Its slug is the third
         segment, so a reader who copies it out of board.ts gets the right
         answer rather than a company called "v1". */
      [
        'https://boards-api.greenhouse.io/v1/boards/monzo/jobs?content=false',
        'greenhouse',
        'monzo',
      ],
      [
        'https://api.lever.co/v0/postings/deliveroo?mode=json',
        'lever',
        'deliveroo',
      ],
      [
        'https://api.ashbyhq.com/posting-api/job-board/openai',
        'ashby',
        'openai',
      ],
      /* A trailing slash and a deep path both appear on real careers links. */
      ['https://jobs.lever.co/deliveroo/', 'lever', 'deliveroo'],
      ['https://jobs.ashbyhq.com/openai?utm_source=careers', 'ashby', 'openai'],
    ])('reads %s', (link, ats, slug) => {
      const result = parseCompanyWatch({name: 'X', ats, board: link});
      expect(result.ok && result.value).toEqual({name: 'X', ats, slug});
    });

    it('takes the provider from the link when none was selected', () => {
      const result = parseCompanyWatch({
        name: 'Deliveroo',
        ats: 'lever',
        board: 'https://jobs.lever.co/deliveroo',
      });
      expect(result.ok && result.value.ats).toBe('lever');
    });

    it('refuses a link whose provider contradicts the selection', () => {
      const message = problems(
        parseCompanyWatch({
          name: 'Deliveroo',
          ats: 'greenhouse',
          board: 'https://jobs.lever.co/deliveroo',
        }),
      );
      expect(message).toContain('Lever');
      expect(message).toContain('Greenhouse');
    });

    it('does not mistake a hostname that merely contains a provider', () => {
      /* `lever.co` as a plain substring matches this host. Suffix matching
         is what keeps a blog post about hiring from being read as a board,
         and the refusal names the host so the mistake is obvious. */
      expect(
        problems(
          parseCompanyWatch({
            name: 'Blog',
            ats: 'lever',
            board: 'https://lever.co.example.com/how-we-hire',
          }),
        ),
      ).toContain('lever.co.example.com');
    });

    it.each([
      'https://careers.monzo.com/jobs',
      'https://www.linkedin.com/jobs/view/123',
      'https://evil.example.com/monzo',
    ])('refuses %s, which is not a board we can read', board => {
      expect(problems(watch({board}))).toContain(
        'not a board on Greenhouse, Lever or Ashby',
      );
    });

    it('refuses a board link with no company in it', () => {
      expect(
        problems(watch({board: 'https://boards.greenhouse.io/'})),
      ).toContain('does not include the company’s board name');
    });
  });

  describe('board names that would change the outbound request', () => {
    it.each([
      ['monzo/../stripe', 'a path traversal'],
      ['monzo jobs', 'a space'],
      ['monzo?x=1', 'a query'],
      ['-monzo', 'a leading hyphen'],
      ['boards.greenhouse.io/monzo', 'a host pasted without its scheme'],
    ])('refuses %s (%s)', board => {
      expect(problems(watch({board}))).toContain('not a board name');
    });
  });
});
