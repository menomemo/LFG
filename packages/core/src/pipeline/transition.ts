/**
 * Moving an application from one stage to the next.
 *
 * A move is an append, never an overwrite. `stage_history` is the single
 * source of truth for every conversion rate and time-in-stage median in the
 * product (docs/data-model.md), so a move that rewrote the latest entry would
 * destroy the only record that the earlier stage ever happened.
 *
 * The rules a move has to satisfy live here rather than in the surface that
 * renders the board, because they are the same rules for the web app, the
 * mobile app and the email classifier that will later propose moves of its
 * own (docs/product-spec.md, module 1).
 */

import {accept, reject, type Validated} from '../validation.ts';
import {
  APPLICATION_STAGES,
  currentStage,
  enteredCurrentStageAt,
  type ApplicationStage,
  type StageEvent,
} from './stage.ts';

/**
 * A stage event in the shape Postgres stores it.
 *
 * `at` is an ISO 8601 string because a `jsonb` column holds JSON, and JSON has
 * no date type. {@link parseStageHistory} is the matching reader.
 */
/* eslint-disable-next-line @typescript-eslint/consistent-type-definitions --
   A type alias rather than an interface on purpose, and not a style slip:
   only an alias of an object literal type gets TypeScript's implicit index
   signature, and without one this is not assignable to the generated `Json`
   type of a `jsonb` column. The alternative is an assertion at every call
   site, which is a cast standing in for validation. */
export type StoredStageEvent = {
  readonly stage: ApplicationStage;
  readonly at: string;
};

/**
 * The stages a move from `from` may land on.
 *
 * Every stage except the one the application is already in. Deliberately not
 * forward-only: a search is not a funnel that people only fall down. A second
 * assessment after a first interview is ordinary, re-applying after a
 * rejection is a thing people do, and a mistyped stage has to be correctable
 * by recording the truth rather than by editing history.
 *
 * @param from The current stage, or `null` for an application with no
 *   recorded history, from which every stage is reachable.
 */
export function movesFrom(
  from: ApplicationStage | null,
): readonly ApplicationStage[] {
  return APPLICATION_STAGES.filter(stage => stage !== from);
}

/**
 * Appends a stage entry to an application's history.
 *
 * @param history The existing history, in any order.
 * @param stage The stage being entered.
 * @param at When it was entered — normally the clock read at the surface,
 *   passed in so the result is reproducible (ADR-0003).
 * @returns The new history, with the entry appended, or the reasons the move
 *   was refused. The input array is never modified.
 */
export function appendStageEvent(
  history: readonly StageEvent[],
  stage: ApplicationStage,
  at: Date,
): Validated<readonly StageEvent[]> {
  const problems: string[] = [];

  if (Number.isNaN(at.getTime())) {
    problems.push('The time of the move is not a valid date.');
  }

  const from = currentStage(history);
  if (from === stage) {
    /* Allowing it would reset days-in-stage without anything having happened,
       which is worse than refusing: the ghost rule reads that number. */
    problems.push(`This application is already at ${stage}.`);
  }

  const enteredAt = enteredCurrentStageAt(history);
  if (
    enteredAt !== null &&
    !Number.isNaN(at.getTime()) &&
    at.getTime() < enteredAt.getTime()
  ) {
    problems.push(
      `A move cannot be dated before the stage it leaves: ${stage} at ` +
        `${at.toISOString()} is earlier than ${enteredAt.toISOString()}.`,
    );
  }

  if (problems.length > 0) {
    return reject(problems);
  }

  return accept([...history, {stage, at}]);
}

/**
 * Renders a history for storage in a `jsonb` column.
 *
 * The inverse of {@link parseStageHistory}, and tested as a round trip: the
 * two are only useful if they agree, and they are written far apart.
 *
 * @param history The events to store, in the order given.
 */
export function serialiseStageHistory(
  history: readonly StageEvent[],
): readonly StoredStageEvent[] {
  return history.map(({stage, at}) => ({stage, at: at.toISOString()}));
}
