import {describe, expect, it} from 'vitest';

import {herfindahlIndex, shareByCategory} from './concentration.ts';

const counts = (entries: Record<string, number>): ReadonlyMap<string, number> =>
  new Map(Object.entries(entries));

describe('herfindahlIndex', () => {
  it('returns null when the pipeline is empty', () => {
    expect(herfindahlIndex(new Map())).toBeNull();
  });

  it('returns null when every category is zero, rather than zero', () => {
    expect(herfindahlIndex(counts({uk: 0, jp: 0}))).toBeNull();
  });

  it('returns 1 when everything sits in one market', () => {
    expect(herfindahlIndex(counts({uk: 12}))).toBe(1);
  });

  it('returns 1 when one market holds all of several known categories', () => {
    expect(herfindahlIndex(counts({uk: 12, ie: 0, jp: 0}))).toBe(1);
  });

  it('returns 1/n for n equally sized categories', () => {
    expect(herfindahlIndex(counts({uk: 5, ie: 5, jp: 5, de: 5}))).toBeCloseTo(
      0.25,
      10,
    );
  });

  it('is invariant to scale', () => {
    const small = herfindahlIndex(counts({uk: 3, ie: 1}));
    const large = herfindahlIndex(counts({uk: 300, ie: 100}));
    expect(small).toBeCloseTo(large ?? Number.NaN, 10);
  });

  it('rises as the pipeline concentrates', () => {
    const spread = herfindahlIndex(counts({uk: 5, ie: 5, jp: 5, de: 5}));
    const skewed = herfindahlIndex(counts({uk: 17, ie: 1, jp: 1, de: 1}));
    expect(skewed).toBeGreaterThan(spread ?? Number.NaN);
  });

  it.each([
    ['a negative count', -1],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
  ])('throws RangeError on %s', (_label, bad) => {
    expect(() => herfindahlIndex(counts({uk: 5, ie: bad}))).toThrow(RangeError);
  });

  it('names the offending category in the error', () => {
    expect(() => herfindahlIndex(counts({uk: 5, jp: -2}))).toThrow(/"jp"/);
  });
});

describe('shareByCategory', () => {
  it('is empty when the pipeline is empty', () => {
    expect([...shareByCategory(new Map())]).toStrictEqual([]);
  });

  it('is empty when every category is zero', () => {
    expect([...shareByCategory(counts({uk: 0}))]).toStrictEqual([]);
  });

  it('returns shares that sum to 1', () => {
    const shares = shareByCategory(counts({uk: 3, ie: 1, jp: 4}));
    const total = [...shares.values()].reduce((sum, n) => sum + n, 0);
    expect(total).toBeCloseTo(1, 10);
  });

  it('keeps the input iteration order', () => {
    const shares = shareByCategory(counts({jp: 1, uk: 3}));
    expect([...shares.keys()]).toStrictEqual(['jp', 'uk']);
  });

  it('computes the share of each market', () => {
    const shares = shareByCategory(counts({uk: 3, ie: 1}));
    expect(shares.get('uk')).toBeCloseTo(0.75, 10);
    expect(shares.get('ie')).toBeCloseTo(0.25, 10);
  });

  it('throws RangeError on a negative count', () => {
    expect(() => shareByCategory(counts({uk: -1}))).toThrow(RangeError);
  });
});
