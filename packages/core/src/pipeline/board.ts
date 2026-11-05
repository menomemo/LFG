/**
 * What the board shows, derived from stage history alone.
 *
 * The board is a view over `stage_history` and nothing else: no column stores
 * which lane an application sits in, how long it has been there, or whether it
 * has gone quiet. All three are computed here, which is why a reply arriving
 * un-ghosts an application with no code having to remember to undo anything
 * (docs/product-spec.md, module 1).
 *
 * Everything in this file is pure and takes the clock as an argument, so the
 * board a person sees can be reproduced exactly from the rows behind it.
 */

import {
  APPLICATION_STAGES,
  TERMINAL_STAGES,
  currentStage,
  daysInCurrentStage,
  enteredCurrentStageAt,
  appliedAt,
  isGhosted,
  type ApplicationStage,
  type StageEvent,
} from './stage';

/**
 * The lanes of the board, left to right.
 *
 * The stage order from the spec: saved → applied → assessment → interview →
 * offer / rejected / withdrawn. Applications with no recorded history belong
 * to no lane and are handled separately by {@link buildLanes}.
 */
export const BOARD_LANES: readonly ApplicationStage[] = APPLICATION_STAGES;

/** Everything the board knows about one application's position. */
export interface StageSummary {
  /** The lane it sits in, or `null` when its history is empty. */
  readonly stage: ApplicationStage | null;
  /** When it entered that stage, or `null` when its history is empty. */
  readonly enteredAt: Date | null;
  /** Whole days since then, or `null` when its history is empty. */
  readonly daysInStage: number | null;
  /** Whether silence has lasted past the threshold. */
  readonly ghosted: boolean;
  /** When it was first applied to, or `null` for a role only saved. */
  readonly appliedAt: Date | null;
}

/**
 * Derives one application's position on the board.
 *
 * Four calls that every surface would otherwise make in the same order, with
 * the same chance of forgetting one. `null` throughout means unknown rather
 * than zero: an application whose history is empty is a data problem, and the
 * board shows it as such instead of parking it in `saved`.
 *
 * @param history The application's stage history, in any order.
 * @param now The current time, injected so the result is reproducible.
 * @param ghostAfterDays Days of silence before ghosting, if not the default.
 */
export function summariseStage(
  history: readonly StageEvent[],
  now: Date,
  ghostAfterDays?: number,
): StageSummary {
  return {
    stage: currentStage(history),
    enteredAt: enteredCurrentStageAt(history),
    daysInStage: daysInCurrentStage(history, now),
    ghosted: isGhosted(history, now, ghostAfterDays),
    appliedAt: appliedAt(history),
  };
}

/** One lane of the board, with the cards in it. */
export interface BoardLane<T> {
  /** The stage this lane holds, or `null` for the unknown lane. */
  readonly stage: ApplicationStage | null;
  readonly cards: readonly T[];
}

/**
 * Sorts cards so the ones that have waited longest come first.
 *
 * Days in stage is the number the board exists to surface — it is what the
 * ghost rule reads and what tells a person which application needs a chase
 * today. Newest-first would bury exactly those.
 *
 * @param cards The cards to order. The input array is not modified.
 * @param daysInStageOf Reads the day count from a card; `null` for an
 *   application with no history, which sorts last. Unknown is not a large
 *   number any more than it is zero, so it does not get to claim the top.
 * @returns A new array. The sort is stable, so cards that have waited the
 *   same number of days keep the order they arrived in.
 */
export function longestWaitingFirst<T>(
  cards: readonly T[],
  daysInStageOf: (card: T) => number | null,
): readonly T[] {
  return [...cards].sort((a, b) => {
    const left = daysInStageOf(a);
    const right = daysInStageOf(b);
    if (left === null) {
      return right === null ? 0 : 1;
    }
    if (right === null) {
      return -1;
    }
    return right - left;
  });
}

/**
 * Places cards into the board's lanes.
 *
 * Every stage lane is returned whether or not it holds anything: a board that
 * hides its empty columns changes shape as a search progresses, and the gap
 * between `applied` and `interview` is itself worth seeing.
 *
 * The unknown lane is the exception — it is returned, first, only when it has
 * cards in it, because an application with no recorded history is a fault to
 * fix rather than a stage to aim for.
 *
 * @param cards The cards to place, in the order they should appear.
 * @param stageOf Reads a card's current stage; `null` sends it to the unknown
 *   lane.
 * @returns The lanes, left to right. Order within a lane is the input order.
 */
export function buildLanes<T>(
  cards: readonly T[],
  stageOf: (card: T) => ApplicationStage | null,
): readonly BoardLane<T>[] {
  const unknown = cards.filter(card => stageOf(card) === null);

  const lanes = BOARD_LANES.map(stage => ({
    stage,
    cards: cards.filter(card => stageOf(card) === stage),
  }));

  return unknown.length === 0
    ? lanes
    : [{stage: null, cards: unknown}, ...lanes];
}

/** Counts for the line above the board. */
export interface BoardTotals {
  readonly total: number;
  /** Still moving: a known stage that is not terminal. */
  readonly active: number;
  /** Finished, one way or another: offer, rejected or withdrawn. */
  readonly closed: number;
  /** Active and silent past the threshold. A subset of {@link active}. */
  readonly ghosted: number;
  /** No recorded history, so no stage. Counted, never assumed. */
  readonly unknown: number;
}

/**
 * Totals the board, so the header can say more than how many rows exist.
 *
 * `unknown` is its own count rather than being folded into `active`, for the
 * reason it is counted at all: twelve applications of which one has no
 * history is a different situation from twelve that are all understood, and
 * the summary is the only place a person would notice.
 *
 * @param summaries One per application, from {@link summariseStage}.
 */
export function summariseBoard(
  summaries: readonly StageSummary[],
): BoardTotals {
  let active = 0;
  let closed = 0;
  let ghosted = 0;
  let unknown = 0;

  for (const summary of summaries) {
    if (summary.stage === null) {
      unknown += 1;
    } else if (TERMINAL_STAGES.includes(summary.stage)) {
      closed += 1;
    } else {
      active += 1;
    }
    if (summary.ghosted) {
      ghosted += 1;
    }
  }

  return {total: summaries.length, active, closed, ghosted, unknown};
}
