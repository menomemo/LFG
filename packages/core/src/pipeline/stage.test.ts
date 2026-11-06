import {describe, expect, it} from 'vitest';

import {
  APPLICATION_STAGES,
  appliedAt,
  currentStage,
  daysInCurrentStage,
  enteredCurrentStageAt,
  firstEnteredStageAt,
  isApplicationStage,
  isGhosted,
  parseStageHistory,
  type ApplicationStage,
  type StageEvent,
} from './stage.ts';

const at = (iso: string): Date => new Date(iso);

const event = (stage: ApplicationStage, iso: string): StageEvent => ({
  stage,
  at: at(iso),
});

const NOW = at('2026-11-04T12:00:00Z');

describe('isApplicationStage', () => {
  it.each([...APPLICATION_STAGES])('accepts %s', stage => {
    expect(isApplicationStage(stage)).toBe(true);
  });

  it.each([
    ['ghosted, which is derived rather than stored', 'ghosted'],
    ['an invented stage', 'negotiating'],
    ['the wrong case', 'Applied'],
    ['null', null],
    ['a number', 3],
  ])('rejects %s', (_label, value) => {
    expect(isApplicationStage(value)).toBe(false);
  });
});

describe('currentStage', () => {
  it('returns null for an empty history, not a plausible default', () => {
    expect(currentStage([])).toBeNull();
  });

  it('returns the only stage of a one-event history', () => {
    expect(currentStage([event('saved', '2026-10-01T00:00:00Z')])).toBe(
      'saved',
    );
  });

  it('returns the latest stage', () => {
    const history = [
      event('saved', '2026-10-01T00:00:00Z'),
      event('applied', '2026-10-03T00:00:00Z'),
      event('interview', '2026-10-20T00:00:00Z'),
    ];
    expect(currentStage(history)).toBe('interview');
  });

  it('is independent of array order', () => {
    const ordered = [
      event('saved', '2026-10-01T00:00:00Z'),
      event('applied', '2026-10-03T00:00:00Z'),
      event('offer', '2026-10-30T00:00:00Z'),
    ];
    const shuffled = [ordered[2]!, ordered[0]!, ordered[1]!];
    expect(currentStage(shuffled)).toBe('offer');
    expect(currentStage(ordered)).toBe(currentStage(shuffled));
  });

  it('breaks a timestamp tie in favour of the later entry', () => {
    const history = [
      event('applied', '2026-10-03T00:00:00Z'),
      event('rejected', '2026-10-03T00:00:00Z'),
    ];
    expect(currentStage(history)).toBe('rejected');
  });
});

describe('enteredCurrentStageAt', () => {
  it('returns null for an empty history', () => {
    expect(enteredCurrentStageAt([])).toBeNull();
  });

  it('returns the timestamp of the latest event', () => {
    const history = [
      event('saved', '2026-10-01T00:00:00Z'),
      event('applied', '2026-10-03T09:30:00Z'),
    ];
    expect(enteredCurrentStageAt(history)?.toISOString()).toBe(
      '2026-10-03T09:30:00.000Z',
    );
  });
});

describe('daysInCurrentStage', () => {
  it('returns null for an empty history', () => {
    expect(daysInCurrentStage([], NOW)).toBeNull();
  });

  it('counts whole days only', () => {
    const history = [event('applied', '2026-11-01T18:00:00Z')];
    expect(daysInCurrentStage(history, NOW)).toBe(2);
  });

  it('returns 0 on the day the stage was entered', () => {
    const history = [event('applied', '2026-11-04T06:00:00Z')];
    expect(daysInCurrentStage(history, NOW)).toBe(0);
  });

  it('measures from the latest event, not the first', () => {
    const history = [
      event('saved', '2026-01-01T00:00:00Z'),
      event('applied', '2026-10-31T12:00:00Z'),
    ];
    expect(daysInCurrentStage(history, NOW)).toBe(4);
  });

  it('throws when the history is ahead of the clock', () => {
    const history = [event('applied', '2026-12-01T00:00:00Z')];
    expect(() => daysInCurrentStage(history, NOW)).toThrow(RangeError);
  });
});

describe('isGhosted', () => {
  it('is false for an empty history: unknown is not ghosted', () => {
    expect(isGhosted([], NOW)).toBe(false);
  });

  it('is false while the application is still moving', () => {
    const history = [event('applied', '2026-11-01T00:00:00Z')];
    expect(isGhosted(history, NOW)).toBe(false);
  });

  it('is true after the threshold of silence', () => {
    const history = [event('applied', '2026-10-10T00:00:00Z')];
    expect(isGhosted(history, NOW)).toBe(true);
  });

  it('is true exactly on the threshold', () => {
    const history = [event('applied', '2026-10-14T12:00:00Z')];
    expect(daysInCurrentStage(history, NOW)).toBe(21);
    expect(isGhosted(history, NOW)).toBe(true);
  });

  it('is false one day before the threshold', () => {
    const history = [event('applied', '2026-10-15T12:00:00Z')];
    expect(isGhosted(history, NOW)).toBe(false);
  });

  it.each([
    ['offer', 'offer'],
    ['rejected', 'rejected'],
    ['withdrawn', 'withdrawn'],
  ])('is false in the terminal stage %s however long the silence', (_l, s) => {
    const history = [event(s as ApplicationStage, '2026-01-01T00:00:00Z')];
    expect(isGhosted(history, NOW)).toBe(false);
  });

  it('reverses itself when a later event is appended', () => {
    const silent = [event('applied', '2026-09-01T00:00:00Z')];
    expect(isGhosted(silent, NOW)).toBe(true);

    const replied = [...silent, event('interview', '2026-11-03T00:00:00Z')];
    expect(isGhosted(replied, NOW)).toBe(false);
  });

  it('honours a market-specific threshold', () => {
    const history = [event('applied', '2026-10-10T00:00:00Z')];
    expect(isGhosted(history, NOW, 21)).toBe(true);
    expect(isGhosted(history, NOW, 40)).toBe(false);
  });

  it.each([
    ['zero', 0],
    ['a negative threshold', -1],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
  ])('throws RangeError on %s', (_label, bad) => {
    const history = [event('applied', '2026-10-10T00:00:00Z')];
    expect(() => isGhosted(history, NOW, bad)).toThrow(RangeError);
  });
});

describe('parseStageHistory', () => {
  it('parses an empty history', () => {
    expect(parseStageHistory([])).toStrictEqual([]);
  });

  it('parses ISO strings into Dates, preserving order', () => {
    const parsed = parseStageHistory([
      {stage: 'saved', at: '2026-10-01T00:00:00Z'},
      {stage: 'applied', at: '2026-10-03T09:30:00Z'},
    ]);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]!.stage).toBe('saved');
    expect(parsed[1]!.at.toISOString()).toBe('2026-10-03T09:30:00.000Z');
  });

  it('accepts an entry that already holds a Date', () => {
    const parsed = parseStageHistory([
      {stage: 'offer', at: at('2026-10-01T00:00:00Z')},
    ]);
    expect(parsed[0]!.at.toISOString()).toBe('2026-10-01T00:00:00.000Z');
  });

  it('ignores unknown extra properties rather than failing', () => {
    const parsed = parseStageHistory([
      {stage: 'applied', at: '2026-10-03T00:00:00Z', by: 'user', note: 'x'},
    ]);
    expect(parsed[0]!.stage).toBe('applied');
  });

  it('feeds straight into the derivations', () => {
    const history = parseStageHistory([
      {stage: 'saved', at: '2026-09-01T00:00:00Z'},
      {stage: 'applied', at: '2026-10-01T00:00:00Z'},
    ]);
    expect(currentStage(history)).toBe('applied');
    expect(isGhosted(history, NOW)).toBe(true);
  });

  it.each([
    ['not an array', {stage: 'saved', at: '2026-10-01T00:00:00Z'}],
    ['a string', '[]'],
    ['null', null],
  ])('throws TypeError when the value is %s', (_label, bad) => {
    expect(() => parseStageHistory(bad)).toThrow(TypeError);
  });

  it.each([
    ['a scalar entry', [3]],
    ['a nested array', [[]]],
    ['a null entry', [null]],
    ['an unknown stage', [{stage: 'ghosted', at: '2026-10-01T00:00:00Z'}]],
    ['a missing stage', [{at: '2026-10-01T00:00:00Z'}]],
    ['a missing timestamp', [{stage: 'applied'}]],
    ['an unparseable timestamp', [{stage: 'applied', at: 'last tuesday'}]],
    ['a numeric timestamp', [{stage: 'applied', at: 1_700_000_000}]],
  ])('throws TypeError on %s rather than dropping it', (_label, bad) => {
    expect(() => parseStageHistory(bad)).toThrow(TypeError);
  });

  it('names the offending index', () => {
    expect(() =>
      parseStageHistory([
        {stage: 'saved', at: '2026-10-01T00:00:00Z'},
        {stage: 'nope', at: '2026-10-02T00:00:00Z'},
      ]),
    ).toThrow(/stage_history\[1\]/);
  });
});

describe('firstEnteredStageAt', () => {
  it('returns null for an empty history', () => {
    expect(firstEnteredStageAt([], 'applied')).toBeNull();
  });

  it('returns null for a stage the application never entered', () => {
    const history = [event('saved', '2026-10-01T00:00:00Z')];
    expect(firstEnteredStageAt(history, 'offer')).toBeNull();
  });

  it('returns the timestamp of the matching entry', () => {
    const history = [
      event('saved', '2026-10-01T00:00:00Z'),
      event('applied', '2026-10-03T00:00:00Z'),
    ];
    expect(firstEnteredStageAt(history, 'applied')).toStrictEqual(
      at('2026-10-03T00:00:00Z'),
    );
  });

  it('returns the earliest when a stage was entered twice', () => {
    const history = [
      event('applied', '2026-10-03T00:00:00Z'),
      event('rejected', '2026-10-20T00:00:00Z'),
      event('applied', '2027-01-05T00:00:00Z'),
    ];
    expect(firstEnteredStageAt(history, 'applied')).toStrictEqual(
      at('2026-10-03T00:00:00Z'),
    );
  });

  it('is independent of array order', () => {
    const forwards = [
      event('saved', '2026-10-01T00:00:00Z'),
      event('applied', '2026-10-03T00:00:00Z'),
    ];
    expect(
      firstEnteredStageAt([...forwards].reverse(), 'applied'),
    ).toStrictEqual(firstEnteredStageAt(forwards, 'applied'));
  });
});

describe('appliedAt', () => {
  it('returns null for a saved role nobody applied to', () => {
    expect(appliedAt([event('saved', '2026-10-01T00:00:00Z')])).toBeNull();
  });

  it('returns the first application date, not the most recent one', () => {
    const history = [
      event('applied', '2026-10-03T00:00:00Z'),
      event('rejected', '2026-10-20T00:00:00Z'),
      event('applied', '2027-01-05T00:00:00Z'),
    ];
    expect(appliedAt(history)).toStrictEqual(at('2026-10-03T00:00:00Z'));
  });
});
