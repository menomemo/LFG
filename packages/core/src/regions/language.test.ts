import {describe, expect, it} from 'vitest';

import {formatLanguageRequirement, parseLanguageRequirement} from './language';

describe('parseLanguageRequirement', () => {
  it.each([
    ['null', null],
    ['undefined', undefined],
  ])(
    'returns null for %s: nothing recorded is not "none required"',
    (_l, v) => {
      expect(parseLanguageRequirement(v)).toBeNull();
    },
  );

  it('parses a complete requirement', () => {
    expect(
      parseLanguageRequirement({
        language: 'ja',
        level: 'JLPT N2',
        evidence: 'stated in the job description',
      }),
    ).toStrictEqual({
      language: 'ja',
      level: 'JLPT N2',
      evidence: 'stated in the job description',
    });
  });

  it('normalises the language code to lowercase', () => {
    expect(
      parseLanguageRequirement({language: 'DE', level: 'B2'})?.language,
    ).toBe('de');
  });

  it('treats missing evidence as inferred rather than failing', () => {
    expect(
      parseLanguageRequirement({language: 'ja', level: 'N2'})?.evidence,
    ).toBeNull();
  });

  it('preserves the level verbatim: markets use their own vocabularies', () => {
    expect(parseLanguageRequirement({language: 'de', level: 'B2'})?.level).toBe(
      'B2',
    );
  });

  it.each([
    ['an array', ['ja']],
    ['a string', 'ja'],
    ['a number', 2],
  ])('throws TypeError when the value is %s', (_label, bad) => {
    expect(() => parseLanguageRequirement(bad)).toThrow(TypeError);
  });

  it.each([
    ['a missing language', {level: 'N2'}],
    ['a missing level', {language: 'ja'}],
    ['an empty language', {language: '', level: 'N2'}],
    ['a blank level', {language: 'ja', level: '   '}],
    ['a numeric level', {language: 'ja', level: 2}],
    ['non-string evidence', {language: 'ja', level: 'N2', evidence: 7}],
  ])('throws TypeError on %s rather than dropping the gate', (_l, bad) => {
    expect(() => parseLanguageRequirement(bad)).toThrow(TypeError);
  });

  it('names the offending field', () => {
    expect(() => parseLanguageRequirement({level: 'N2'})).toThrow(
      /language_required\.language/,
    );
  });
});

describe('formatLanguageRequirement', () => {
  it('renders one line', () => {
    expect(
      formatLanguageRequirement({
        language: 'ja',
        level: 'JLPT N2',
        evidence: null,
      }),
    ).toBe('JA JLPT N2');
  });
});
