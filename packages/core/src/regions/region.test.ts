import {describe, expect, it} from 'vitest';

import {REGIONS, assertExhaustive, isRegion, regionLabel} from './region.ts';
import type {Region} from './region.ts';

describe('REGIONS', () => {
  it('contains the wave-one markets and the escape hatch', () => {
    expect(REGIONS).toStrictEqual(['uk', 'ie', 'ee', 'jp', 'de', 'other']);
  });

  it('has no duplicates', () => {
    expect(new Set(REGIONS).size).toBe(REGIONS.length);
  });
});

describe('isRegion', () => {
  it.each([...REGIONS])('accepts the known market %s', region => {
    expect(isRegion(region)).toBe(true);
  });

  it.each([
    ['an unsupported country code', 'fr'],
    ['a display name', 'United Kingdom'],
    ['the wrong case', 'UK'],
    ['an empty string', ''],
  ])('rejects %s', (_label, value) => {
    expect(isRegion(value)).toBe(false);
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['a number', 1],
    ['an object', {region: 'uk'}],
    ['an array', ['uk']],
  ])('rejects %s without throwing', (_label, value) => {
    expect(isRegion(value)).toBe(false);
  });
});

describe('assertExhaustive', () => {
  it('throws, naming the unhandled value', () => {
    const unexpected = 'fr' as unknown as never;
    expect(() => assertExhaustive(unexpected)).toThrow(/Unhandled case: "fr"/);
  });

  it('lets a complete switch over Region compile and run', () => {
    const describeRegion = (region: Region): string => {
      switch (region) {
        case 'uk':
        case 'ie':
        case 'ee':
          return 'english-cv';
        case 'jp':
          return 'japanese-documents';
        case 'de':
          return 'lebenslauf';
        case 'other':
          return 'no-playbook';
        default:
          return assertExhaustive(region);
      }
    };

    expect(REGIONS.map(describeRegion)).toStrictEqual([
      'english-cv',
      'english-cv',
      'english-cv',
      'japanese-documents',
      'lebenslauf',
      'no-playbook',
    ]);
  });
});

describe('regionLabel', () => {
  it.each([...REGIONS])('names %s', region => {
    expect(regionLabel(region).length).toBeGreaterThan(0);
  });

  it('gives every market a distinct name', () => {
    expect(new Set(REGIONS.map(regionLabel)).size).toBe(REGIONS.length);
  });

  it('names the escape hatch without pretending it is a market', () => {
    expect(regionLabel('other')).toBe('Elsewhere');
  });
});
