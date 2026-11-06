import {describe, expect, it} from 'vitest';

import {
  BOARD_LANES,
  buildLanes,
  longestWaitingFirst,
  summariseBoard,
  summariseStage,
} from './board.ts';
import {
  APPLICATION_STAGES,
  type ApplicationStage,
  type StageEvent,
} from './stage.ts';

const at = (iso: string): Date => new Date(iso);

const event = (stage: ApplicationStage, iso: string): StageEvent => ({
  stage,
  at: at(iso),
});

const NOW = at('2026-11-05T12:00:00Z');

describe('BOARD_LANES', () => {
  it('is every stage, in the order the spec lists them', () => {
    expect(BOARD_LANES).toEqual(APPLICATION_STAGES);
  });

  it('has no lane for ghosted, which is derived rather than entered', () => {
    expect(BOARD_LANES).not.toContain('ghosted');
  });
});

describe('summariseStage', () => {
  it('reads unknown, not zero, from an empty history', () => {
    expect(summariseStage([], NOW)).toEqual({
      stage: null,
      enteredAt: null,
      daysInStage: null,
      ghosted: false,
      appliedAt: null,
    });
  });

  it('derives all five values from one history', () => {
    const history = [
      event('saved', '2026-10-01T12:00:00Z'),
      event('applied', '2026-10-06T12:00:00Z'),
      event('interview', '2026-11-01T12:00:00Z'),
    ];
    expect(summariseStage(history, NOW)).toEqual({
      stage: 'interview',
      enteredAt: at('2026-11-01T12:00:00Z'),
      daysInStage: 4,
      ghosted: false,
      appliedAt: at('2026-10-06T12:00:00Z'),
    });
  });

  it('marks an application ghosted after the default silence', () => {
    const history = [event('applied', '2026-10-01T12:00:00Z')];
    expect(summariseStage(history, NOW).ghosted).toBe(true);
  });

  it('un-ghosts it the moment a later event is appended', () => {
    const history = [
      event('applied', '2026-10-01T12:00:00Z'),
      event('assessment', '2026-11-04T12:00:00Z'),
    ];
    expect(summariseStage(history, NOW).ghosted).toBe(false);
  });

  it('honours a market-specific threshold', () => {
    const history = [event('applied', '2026-10-28T12:00:00Z')];
    expect(summariseStage(history, NOW, 5).ghosted).toBe(true);
    expect(summariseStage(history, NOW, 40).ghosted).toBe(false);
  });

  it('never ghosts a finished search', () => {
    const history = [event('rejected', '2026-01-01T12:00:00Z')];
    expect(summariseStage(history, NOW).ghosted).toBe(false);
  });

  it('reports no applied date for a role that was only saved', () => {
    expect(
      summariseStage([event('saved', '2026-11-01T12:00:00Z')], NOW).appliedAt,
    ).toBeNull();
  });
});

describe('longestWaitingFirst', () => {
  const days = (card: {days: number | null}): number | null => card.days;

  it('puts the longest wait first', () => {
    const cards = [{days: 2}, {days: 30}, {days: 9}];
    expect(longestWaitingFirst(cards, days)).toEqual([
      {days: 30},
      {days: 9},
      {days: 2},
    ]);
  });

  it('sorts unknown last, because unknown is not a long wait', () => {
    const cards = [{days: null}, {days: 1}];
    expect(longestWaitingFirst(cards, days)).toEqual([{days: 1}, {days: null}]);
  });

  it('keeps the order of cards that have waited the same time', () => {
    const cards = [
      {days: 5, id: 'a'},
      {days: 5, id: 'b'},
      {days: 5, id: 'c'},
    ];
    expect(
      longestWaitingFirst(cards, card => card.days).map(card => card.id),
    ).toEqual(['a', 'b', 'c']);
  });

  it('does not modify the array it was given', () => {
    const cards = [{days: 1}, {days: 2}];
    longestWaitingFirst(cards, days);
    expect(cards[0]?.days).toBe(1);
  });

  it('handles an empty board', () => {
    expect(longestWaitingFirst([], days)).toEqual([]);
  });
});

describe('buildLanes', () => {
  const stageOf = (card: {
    stage: ApplicationStage | null;
  }): ApplicationStage | null => card.stage;

  it('returns every stage lane even when the board is empty', () => {
    const lanes = buildLanes([], stageOf);
    expect(lanes.map(lane => lane.stage)).toEqual([...BOARD_LANES]);
    expect(lanes.every(lane => lane.cards.length === 0)).toBe(true);
  });

  it('keeps an empty lane rather than closing the gap', () => {
    const lanes = buildLanes([{stage: 'interview'}], stageOf);
    expect(lanes.find(lane => lane.stage === 'applied')?.cards).toEqual([]);
  });

  it('places each card in its own lane', () => {
    const cards = [
      {stage: 'applied', id: 'a'},
      {stage: 'offer', id: 'b'},
      {stage: 'applied', id: 'c'},
    ] as const;
    const lanes = buildLanes([...cards], card => card.stage);
    expect(lanes.find(lane => lane.stage === 'applied')?.cards).toEqual([
      cards[0],
      cards[2],
    ]);
    expect(lanes.find(lane => lane.stage === 'offer')?.cards).toEqual([
      cards[1],
    ]);
  });

  it('preserves the order it was handed within a lane', () => {
    const cards = [
      {stage: 'applied', id: 'first'},
      {stage: 'applied', id: 'second'},
    ] as const;
    expect(
      buildLanes([...cards], card => card.stage)[1]?.cards.map(card => card.id),
    ).toEqual(['first', 'second']);
  });

  it('omits the unknown lane when nothing is unknown', () => {
    const lanes = buildLanes([{stage: 'saved'}], stageOf);
    expect(lanes.some(lane => lane.stage === null)).toBe(false);
  });

  it('puts the unknown lane first when something lands in it', () => {
    const lanes = buildLanes([{stage: 'saved'}, {stage: null}], stageOf);
    expect(lanes[0]?.stage).toBeNull();
    expect(lanes[0]?.cards).toEqual([{stage: null}]);
    expect(lanes).toHaveLength(BOARD_LANES.length + 1);
  });

  it('places every card exactly once', () => {
    const cards = [
      {stage: 'saved'},
      {stage: null},
      {stage: 'withdrawn'},
      {stage: 'saved'},
    ] as const;
    const placed = buildLanes([...cards], card => card.stage).flatMap(
      lane => lane.cards,
    );
    expect(placed).toHaveLength(cards.length);
  });
});

describe('summariseBoard', () => {
  const summary = (
    stage: ApplicationStage | null,
    ghosted = false,
  ): ReturnType<typeof summariseStage> => ({
    stage,
    enteredAt: null,
    daysInStage: null,
    ghosted,
    appliedAt: null,
  });

  it('counts nothing on an empty board', () => {
    expect(summariseBoard([])).toEqual({
      total: 0,
      active: 0,
      closed: 0,
      ghosted: 0,
      unknown: 0,
    });
  });

  it('separates what is still moving from what has finished', () => {
    expect(
      summariseBoard([
        summary('saved'),
        summary('applied'),
        summary('interview'),
        summary('offer'),
        summary('rejected'),
        summary('withdrawn'),
      ]),
    ).toEqual({total: 6, active: 3, closed: 3, ghosted: 0, unknown: 0});
  });

  it('counts an application with no history as unknown, not as active', () => {
    expect(summariseBoard([summary(null), summary('applied')])).toEqual({
      total: 2,
      active: 1,
      closed: 0,
      ghosted: 0,
      unknown: 1,
    });
  });

  it('counts ghosted applications inside active rather than beside it', () => {
    const totals = summariseBoard([summary('applied', true), summary('saved')]);
    expect(totals.active).toBe(2);
    expect(totals.ghosted).toBe(1);
  });
});
