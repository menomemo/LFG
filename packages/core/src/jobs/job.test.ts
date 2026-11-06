import {describe, expect, it} from 'vitest';

import {
  isSponsorship,
  isWorkMode,
  SPONSORSHIP_VALUES,
  WORK_MODES,
} from './job.ts';

describe('isWorkMode', () => {
  it.each([...WORK_MODES])('accepts %s', mode => {
    expect(isWorkMode(mode)).toBe(true);
  });

  it.each([
    ['the wrong case', 'Remote'],
    ['an invented mode', 'wfh'],
    ['the empty string, which means unstated', ''],
    ['null', null],
    ['undefined', undefined],
  ])('rejects %s', (_label, value) => {
    expect(isWorkMode(value)).toBe(false);
  });
});

describe('isSponsorship', () => {
  it.each([...SPONSORSHIP_VALUES])('accepts %s', value => {
    expect(isSponsorship(value)).toBe(true);
  });

  it('accepts unknown, which is an answer and not an absence', () => {
    expect(isSponsorship('unknown')).toBe(true);
  });

  it.each([
    ['a boolean, which is the shape this column refuses to be', true],
    ['the string true', 'true'],
    ['maybe', 'maybe'],
    ['null', null],
  ])('rejects %s', (_label, value) => {
    expect(isSponsorship(value)).toBe(false);
  });
});
