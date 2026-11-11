import {describe, expect, it} from 'vitest';

import {
  boardUrl,
  isPollableAts,
  isWantedTitle,
  readBoard,
  regionFromLocation,
  type BoardCriteria,
} from './board';

const WAVE_ONE: BoardCriteria = {regions: ['uk', 'ie', 'ee', 'jp']};

/**
 * Real entries from `boards-api.greenhouse.io/v1/boards/monzo/jobs`, read on
 * 2026-11-11 and trimmed to the fields this module looks at. Copied rather
 * than invented: the whole risk in this file is assuming a response shape,
 * and a fixture written from imagination would assume the same wrong one.
 */
const GREENHOUSE_REAL = {
  jobs: [
    {
      absolute_url: 'https://job-boards.greenhouse.io/monzo/jobs/7343996',
      location: {name: 'Barcelona'},
      title: 'Android Engineer',
      first_published: '2025-10-21T08:12:57-04:00',
      updated_at: '2026-11-03T06:35:51-05:00',
    },
    {
      absolute_url: 'https://job-boards.greenhouse.io/monzo/jobs/7000001',
      location: {name: 'Cardiff, London or Remote (UK)'},
      title: 'Backend Engineer III ',
      first_published: '2026-11-09T09:00:00-05:00',
    },
    {
      absolute_url: 'https://job-boards.greenhouse.io/monzo/jobs/7000002',
      location: {name: 'Cardiff, London or Remote (UK)'},
      title: 'Engineering Manager',
      first_published: '2026-11-08T09:00:00-05:00',
    },
    {
      absolute_url: 'https://job-boards.greenhouse.io/monzo/jobs/7000003',
      location: {name: 'Barcelona; Cardiff, London or Remote (UK)'},
      title: 'Engineering Director, EU',
      first_published: '2026-11-07T09:00:00-05:00',
    },
    {
      absolute_url: 'https://job-boards.greenhouse.io/monzo/jobs/7000004',
      location: {name: 'Cardiff, London or Remote (UK)'},
      title: 'Senior Backend Engineer',
      first_published: '2026-11-06T09:00:00-05:00',
    },
    {
      absolute_url: 'https://job-boards.greenhouse.io/monzo/jobs/7000005',
      location: {name: 'Cardiff, London or Remote (UK)'},
      title: 'Complaints Policy Manager',
      first_published: '2026-11-05T09:00:00-05:00',
    },
  ],
};

describe('readBoard against a real Greenhouse response', () => {
  it('keeps the one role a graduate search wants, out of six', () => {
    const reading = readBoard(GREENHOUSE_REAL, WAVE_ONE);

    expect(reading.kept).toHaveLength(1);
    expect(reading.kept[0]?.title).toBe('Backend Engineer III');
    expect(reading.kept[0]?.region).toBe('uk');
    expect(reading.discarded).toBe(5);
  });

  it('keeps the provider location verbatim and the first-published date', () => {
    const [posting] = readBoard(GREENHOUSE_REAL, WAVE_ONE).kept;

    /* The location is not parseable into anything tidier, and pretending
       otherwise loses what the company actually said. */
    expect(posting?.location).toBe('Cardiff, London or Remote (UK)');
    /* The premise of polling at all is that this leads the aggregators.
       Dropping it would make the claim permanently unmeasurable. */
    expect(posting?.firstPublishedAt).toBe('2026-11-09T09:00:00-05:00');
  });

  it('counts what it threw away rather than discarding it silently', () => {
    /* A filter that is too narrow finds nothing and looks exactly like a
       company that is not hiring. This number is what tells them apart. */
    const reading = readBoard(GREENHOUSE_REAL, {regions: ['jp']});

    expect(reading.kept).toHaveLength(0);
    expect(reading.discarded).toBe(6);
  });
});

describe('readBoard across providers', () => {
  it('reads a bare array, as Lever returns', () => {
    const reading = readBoard(
      [
        {
          hostedUrl: 'https://jobs.lever.co/acme/abc',
          categories: {location: 'Dublin, Ireland'},
          title: 'Backend Engineer',
          createdAt: 1794338400000,
        },
      ],
      WAVE_ONE,
    );

    expect(reading.kept[0]?.region).toBe('ie');
    expect(reading.kept[0]?.sourceUrl).toBe('https://jobs.lever.co/acme/abc');
    /* Lever sends epoch milliseconds where Greenhouse sends a string. */
    expect(reading.kept[0]?.firstPublishedAt).toBe('2026-11-10T19:20:00.000Z');
  });

  it('reads a flat location string, as Ashby returns', () => {
    const reading = readBoard(
      [
        {
          jobUrl: 'https://jobs.ashbyhq.com/acme/xyz',
          location: 'Tallinn, Estonia',
          title: 'Software Engineer, Platform',
          publishedAt: '2026-11-10T00:00:00Z',
        },
      ],
      WAVE_ONE,
    );

    expect(reading.kept[0]?.region).toBe('ee');
  });

  describe('keeps nothing rather than throwing', () => {
    /* A poll runs on a schedule with nobody watching. A crash there is a
       feature that silently stops working, so a malformed response has to be
       an empty reading. */
    it.each([
      ['a string', 'not json at all'],
      ['null', null],
      ['an object with no jobs', {totalCount: 0}],
      ['entries that are not objects', [1, 'two', null]],
      [
        'an entry missing a url',
        [{title: 'Backend Engineer', location: 'London'}],
      ],
      [
        'an entry missing a title',
        [{absolute_url: 'https://x.test/1', location: 'London'}],
      ],
    ])('%s', (_name, input) => {
      const reading = readBoard(input, WAVE_ONE);

      expect(reading.kept).toHaveLength(0);
    });
  });
});

describe('regionFromLocation', () => {
  it.each([
    ['Cardiff, London or Remote (UK)', 'uk'],
    ['United Kingdom', 'uk'],
    ['Dublin', 'ie'],
    ['Tallinn, Estonia', 'ee'],
    ['Tokyo, Japan', 'jp'],
    ['Berlin, Germany', 'de'],
    ['München', 'de'],
  ])('resolves %s to %s', (location, region) => {
    expect(regionFromLocation(location)).toBe(region);
  });

  it('reads Northern Ireland as the UK, not Ireland', () => {
    /* The two answer differently on the visa question and on which CV
       template applies, so the substring order in the table is load-bearing
       and this test is what holds it in place. */
    expect(regionFromLocation('Belfast, Northern Ireland')).toBe('uk');
    expect(regionFromLocation('Northern Ireland')).toBe('uk');
  });

  it.each([['Barcelona'], ['Remote'], ['New York, NY'], ['']])(
    'returns null for %s, which names no market we support',
    location => {
      expect(regionFromLocation(location)).toBeNull();
    },
  );
});

describe('isWantedTitle', () => {
  it.each([
    'Software Engineer',
    'Backend Engineer III',
    'Graduate Software Engineer — Backend',
    'Junior Full-Stack Developer',
    'Machine Learning Engineer',
    'Site Reliability Engineer',
  ])('wants %s', title => {
    expect(isWantedTitle(title)).toBe(true);
  });

  it.each([
    'Senior Backend Engineer',
    'Staff Software Engineer',
    'Principal Engineer',
    'Engineering Manager',
    'Engineering Director, EU',
    'Head of Platform',
    'Software Engineering Intern',
    'Sales Engineer',
    'QA Engineer',
    'Complaints Policy Manager',
    'CRM Manager',
  ])('refuses %s', title => {
    expect(isWantedTitle(title)).toBe(false);
  });

  it('refuses a disqualified title that also matches a wanted fragment', () => {
    /* Order matters: checked the other way round, "backend" would carry
       "Staff Backend Engineer" straight through. */
    expect(isWantedTitle('Staff Backend Engineer')).toBe(false);
  });
});

describe('boardUrl', () => {
  it.each([
    ['greenhouse', 'monzo', 'boards-api.greenhouse.io/v1/boards/monzo/jobs'],
    ['lever', 'acme', 'api.lever.co/v0/postings/acme'],
    ['ashby', 'acme', 'api.ashbyhq.com/posting-api/job-board/acme'],
  ] as const)('builds a %s url', (ats, slug, expected) => {
    expect(boardUrl(ats, slug)).toContain(expected);
  });

  it('lower-cases and trims a slug', () => {
    expect(boardUrl('greenhouse', '  Monzo ')).toContain('/boards/monzo/');
  });

  it.each([
    ['empty', ''],
    ['a path escape', '../../admin'],
    ['a slash', 'acme/jobs'],
    ['a query', 'acme?x=1'],
    ['a full url', 'https://evil.test/'],
    ['a space', 'two words'],
  ])('refuses %s rather than escaping it', (_name, slug) => {
    /* A slug becomes a path segment. There is no legitimate board whose name
       needs any of these, so refusing is cheaper than escaping correctly. */
    expect(boardUrl('greenhouse', slug)).toBeNull();
  });
});

describe('isPollableAts', () => {
  it('accepts the three with a public endpoint', () => {
    expect(isPollableAts('greenhouse')).toBe(true);
    expect(isPollableAts('lever')).toBe(true);
    expect(isPollableAts('ashby')).toBe(true);
  });

  it('refuses the stored values that have no public endpoint', () => {
    /* `workday` and `other` are real ats_type values. A company set to one
       is skipped, not failed. */
    expect(isPollableAts('workday')).toBe(false);
    expect(isPollableAts('other')).toBe(false);
    expect(isPollableAts(null)).toBe(false);
  });
});
