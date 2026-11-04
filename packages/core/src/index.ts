/**
 * Public surface of the business-rule package.
 *
 * Everything LFG knows how to decide lives behind this file: scoring, region
 * policy, portfolio arithmetic, scheduling. It depends on no framework, no
 * database client and no clock — those arrive as arguments (ADR-0003).
 */

export {REGIONS, isRegion, assertExhaustive} from './regions/region';
export type {Region} from './regions/region';

export {herfindahlIndex, shareByCategory} from './portfolio/concentration';

export {
  APPLICATION_STAGES,
  TERMINAL_STAGES,
  DEFAULT_GHOST_AFTER_DAYS,
  isApplicationStage,
  currentStage,
  enteredCurrentStageAt,
  daysInCurrentStage,
  isGhosted,
  parseStageHistory,
} from './pipeline/stage';
export type {ApplicationStage, StageEvent} from './pipeline/stage';
