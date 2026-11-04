/**
 * Deriving an application's state from its stage history.
 *
 * `stage_history` is append-only, and every conversion rate, time-in-stage
 * median, ghost determination and funnel flow in the product is computed from
 * it (docs/data-model.md). Nothing stores "the current stage" as mutable
 * state, because the moment something rewrites that column the metrics stop
 * being reconstructable. These functions are the derivation.
 *
 * All of them are pure and take the clock as an argument, so a score computed
 * today can be recomputed identically tomorrow.
 */

/**
 * Stages an application can be recorded as having entered.
 *
 * Note what is absent: `ghosted`. Ghosting is not an event anybody performs,
 * it is the absence of events — and the product's rule says it reverses
 * itself the moment a reply arrives. Storing it would mean writing a row into
 * an append-only history and later needing to unwrite it. It is derived
 * instead, by {@link isGhosted}.
 */
export const APPLICATION_STAGES = [
  'saved',
  'applied',
  'assessment',
  'interview',
  'offer',
  'rejected',
  'withdrawn',
] as const;

/** A stage an application has entered. */
export type ApplicationStage = (typeof APPLICATION_STAGES)[number];

/**
 * Stages from which an application does not move again.
 *
 * Silence here means the search ended, not that anyone went quiet, so the
 * ghost rule does not apply to them.
 */
export const TERMINAL_STAGES: readonly ApplicationStage[] = [
  'offer',
  'rejected',
  'withdrawn',
];

/** One entry in an application's append-only stage history. */
export interface StageEvent {
  readonly stage: ApplicationStage;
  /** When the application entered this stage. */
  readonly at: Date;
}

/** Default days of silence before an application counts as ghosted. */
export const DEFAULT_GHOST_AFTER_DAYS = 21;

const MS_PER_DAY = 86_400_000;

/**
 * Narrows an untrusted value to an {@link ApplicationStage}.
 *
 * Rows arrive from Postgres as JSON, so the stage in a history entry is a
 * string until something checks it. This is that check.
 */
export function isApplicationStage(value: unknown): value is ApplicationStage {
  return (
    typeof value === 'string' &&
    (APPLICATION_STAGES as readonly string[]).includes(value)
  );
}

/**
 * The most recent entry in a stage history.
 *
 * History is append-only, so in practice the last element is the latest. This
 * picks the latest by timestamp anyway, with a tie broken in favour of the
 * later array position: ordering that depends on how a row came back from the
 * database is ordering waiting to be wrong.
 *
 * @returns The latest event, or `null` for an empty history.
 */
function latestEvent(history: readonly StageEvent[]): StageEvent | null {
  let latest: StageEvent | null = null;
  for (const event of history) {
    if (latest === null || event.at.getTime() >= latest.at.getTime()) {
      latest = event;
    }
  }
  return latest;
}

/**
 * The stage an application is in now.
 *
 * @param history The application's stage history, in any order.
 * @returns The current stage, or `null` when the history is empty. `null`
 *   means unknown — it is not `'saved'`. An application with no recorded
 *   history is a data problem, and quietly reporting a plausible stage would
 *   hide it.
 */
export function currentStage(
  history: readonly StageEvent[],
): ApplicationStage | null {
  return latestEvent(history)?.stage ?? null;
}

/**
 * When the application entered the stage it is in now.
 *
 * @returns The timestamp, or `null` for an empty history.
 */
export function enteredCurrentStageAt(
  history: readonly StageEvent[],
): Date | null {
  return latestEvent(history)?.at ?? null;
}

/**
 * Whole days the application has sat in its current stage.
 *
 * @param history The application's stage history.
 * @param now The current time, injected so the result is reproducible.
 * @returns Whole days elapsed, or `null` for an empty history.
 * @throws RangeError If the latest event is in the future relative to `now`.
 *   That is a clock or data fault, and a negative duration silently rendered
 *   as "0 days" would be a confident wrong answer.
 */
export function daysInCurrentStage(
  history: readonly StageEvent[],
  now: Date,
): number | null {
  const enteredAt = enteredCurrentStageAt(history);
  if (enteredAt === null) {
    return null;
  }

  const elapsedMs = now.getTime() - enteredAt.getTime();
  if (elapsedMs < 0) {
    throw new RangeError(
      `Stage history is ahead of the clock: entered ${enteredAt.toISOString()}, ` +
        `now ${now.toISOString()}.`,
    );
  }
  return Math.floor(elapsedMs / MS_PER_DAY);
}

/**
 * Whether an application counts as ghosted.
 *
 * The rule from docs/product-spec.md: no movement in a stage for longer than
 * the threshold. It reverses itself — because this is derived rather than
 * stored, appending any later event makes the application un-ghosted with no
 * special handling.
 *
 * @param history The application's stage history.
 * @param now The current time, injected so the result is reproducible.
 * @param ghostAfterDays Days of silence before ghosting. Configurable because
 *   the right threshold differs by market: Japanese funnels run slower than
 *   British ones (docs/regions.md).
 * @returns `false` for an empty history — unknown is not ghosted — and
 *   `false` in a terminal stage, where silence means the search ended.
 * @throws RangeError If `ghostAfterDays` is not a positive finite number, or
 *   if the latest event is in the future.
 */
export function isGhosted(
  history: readonly StageEvent[],
  now: Date,
  ghostAfterDays: number = DEFAULT_GHOST_AFTER_DAYS,
): boolean {
  if (!Number.isFinite(ghostAfterDays) || ghostAfterDays <= 0) {
    throw new RangeError(
      `ghostAfterDays must be a positive finite number, got ${String(ghostAfterDays)}.`,
    );
  }

  const stage = currentStage(history);
  if (stage === null || TERMINAL_STAGES.includes(stage)) {
    return false;
  }

  const days = daysInCurrentStage(history, now);
  return days !== null && days >= ghostAfterDays;
}

/**
 * Parses a `stage_history` value that came out of Postgres as JSON.
 *
 * This is the boundary. A `jsonb` column is `unknown` until something checks
 * it: the database guarantees only that the value is an array, so the shape
 * of each entry is verified here rather than cast and hoped for
 * (docs/code-standards.md).
 *
 * @param value The raw column value, typically `unknown` from a database
 *   client or a parsed JSON body.
 * @returns The events, in the order given. An empty array is valid and means
 *   an application with no recorded history.
 * @throws TypeError If the value is not an array, or any entry is not an
 *   object with a known stage and a parseable timestamp. Failing here is the
 *   point: a silently dropped malformed entry would quietly change every
 *   metric derived from this history.
 */
export function parseStageHistory(value: unknown): readonly StageEvent[] {
  if (!Array.isArray(value)) {
    throw new TypeError(`stage_history must be an array, got ${typeof value}.`);
  }

  return value.map((entry, index) => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      throw new TypeError(`stage_history[${String(index)}] must be an object.`);
    }

    const {stage, at} = entry as {stage?: unknown; at?: unknown};

    if (!isApplicationStage(stage)) {
      throw new TypeError(
        `stage_history[${String(index)}].stage is not a known stage: ` +
          `${JSON.stringify(stage)}.`,
      );
    }

    if (typeof at !== 'string' && !(at instanceof Date)) {
      throw new TypeError(
        `stage_history[${String(index)}].at must be an ISO string or a Date.`,
      );
    }

    const parsed = at instanceof Date ? at : new Date(at);
    if (Number.isNaN(parsed.getTime())) {
      throw new TypeError(
        `stage_history[${String(index)}].at is not a valid timestamp: ` +
          `${JSON.stringify(at)}.`,
      );
    }

    return {stage, at: parsed};
  });
}
