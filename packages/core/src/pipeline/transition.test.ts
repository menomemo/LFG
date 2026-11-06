import {describe, expect, it} from 'vitest';

import type {Validated} from '../validation.ts';
import {parseStageHistory, type StageEvent} from './stage.ts';
import {
  appendStageEvent,
  movesFrom,
  serialiseStageHistory,
} from './transition.ts';

const at = (iso: string): Date => new Date(iso);

const event = (stage: StageEvent['stage'], iso: string): StageEvent => ({
  stage,
  at: at(iso),
});

/** Unwraps an accepted result, failing the test if it was refused. */
const accepted = <T>(result: Validated<T>): T => {
  if (!result.ok) {
    throw new Error(`Expected acceptance, got: ${result.problems.join(' ')}`);
  }
  return result.value;
};

/** Reads the problems off a refused result, failing the test if it passed. */
const problems = <T>(result: Validated<T>): readonly string[] => {
  if (result.ok) {
    throw new Error('Expected a rejection.');
  }
  return result.problems;
};

describe('movesFrom', () => {
  it('offers every stage except the one the application is in', () => {
    expect(movesFrom('applied')).toEqual([
      'saved',
      'assessment',
      'interview',
      'offer',
      'rejected',
      'withdrawn',
    ]);
  });

  it('offers every stage to an application with no history', () => {
    expect(movesFrom(null)).toHaveLength(7);
  });

  it('allows moving backwards, because a search is not a one-way funnel', () => {
    expect(movesFrom('interview')).toContain('assessment');
  });

  it('allows re-applying after a rejection', () => {
    expect(movesFrom('rejected')).toContain('applied');
  });
});

describe('appendStageEvent', () => {
  it('appends to an empty history', () => {
    const result = appendStageEvent([], 'saved', at('2026-11-05T09:00:00Z'));
    expect(accepted(result)).toEqual([event('saved', '2026-11-05T09:00:00Z')]);
  });

  it('keeps every earlier entry, because history is append-only', () => {
    const history = [
      event('saved', '2026-10-01T00:00:00Z'),
      event('applied', '2026-10-03T00:00:00Z'),
    ];
    const result = accepted(
      appendStageEvent(history, 'interview', at('2026-10-20T00:00:00Z')),
    );
    expect(result).toHaveLength(3);
    expect(result.slice(0, 2)).toEqual(history);
  });

  it('does not modify the history it was given', () => {
    const history = [event('saved', '2026-10-01T00:00:00Z')];
    appendStageEvent(history, 'applied', at('2026-10-02T00:00:00Z'));
    expect(history).toHaveLength(1);
  });

  it('refuses a move to the stage the application is already in', () => {
    const history = [event('applied', '2026-10-03T00:00:00Z')];
    const result = appendStageEvent(
      history,
      'applied',
      at('2026-10-10T00:00:00Z'),
    );
    expect(problems(result)).toEqual([
      'This application is already at applied.',
    ]);
  });

  it('allows the same stage again once another stage intervened', () => {
    const history = [
      event('applied', '2026-10-03T00:00:00Z'),
      event('rejected', '2026-10-10T00:00:00Z'),
    ];
    expect(
      appendStageEvent(history, 'applied', at('2026-11-01T00:00:00Z')).ok,
    ).toBe(true);
  });

  it('refuses a move dated before the stage it leaves', () => {
    const history = [event('applied', '2026-10-03T00:00:00Z')];
    const result = appendStageEvent(
      history,
      'interview',
      at('2026-10-01T00:00:00Z'),
    );
    expect(problems(result)).toHaveLength(1);
    expect(problems(result)[0]).toContain('cannot be dated before');
  });

  it('accepts a move dated exactly when the current stage began', () => {
    const history = [event('applied', '2026-10-03T00:00:00Z')];
    expect(
      appendStageEvent(history, 'assessment', at('2026-10-03T00:00:00Z')).ok,
    ).toBe(true);
  });

  it('refuses an unparseable timestamp rather than storing it', () => {
    const result = appendStageEvent([], 'saved', new Date('not a date'));
    expect(problems(result)).toEqual([
      'The time of the move is not a valid date.',
    ]);
  });

  it('reports both problems at once', () => {
    const history = [event('applied', '2026-10-03T00:00:00Z')];
    const result = appendStageEvent(
      history,
      'applied',
      at('2026-10-01T00:00:00Z'),
    );
    expect(problems(result)).toHaveLength(2);
  });
});

describe('serialiseStageHistory', () => {
  it('writes timestamps as ISO strings, because jsonb holds JSON', () => {
    expect(
      serialiseStageHistory([event('saved', '2026-10-01T00:00:00Z')]),
    ).toEqual([{stage: 'saved', at: '2026-10-01T00:00:00.000Z'}]);
  });

  it('keeps an empty history empty', () => {
    expect(serialiseStageHistory([])).toEqual([]);
  });

  it('round-trips through parseStageHistory', () => {
    const history = [
      event('saved', '2026-10-01T00:00:00Z'),
      event('applied', '2026-10-03T08:30:00Z'),
      event('interview', '2026-10-20T14:15:00Z'),
    ];
    expect(parseStageHistory(serialiseStageHistory(history))).toEqual(history);
  });

  it('round-trips what appendStageEvent produced', () => {
    const appended = accepted(
      appendStageEvent(
        [event('saved', '2026-10-01T00:00:00Z')],
        'applied',
        at('2026-10-03T00:00:00Z'),
      ),
    );
    expect(parseStageHistory(serialiseStageHistory(appended))).toEqual(
      appended,
    );
  });
});
