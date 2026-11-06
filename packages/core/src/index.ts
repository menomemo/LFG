/**
 * Public surface of the business-rule package.
 *
 * Everything LFG knows how to decide lives behind this file: scoring, region
 * policy, portfolio arithmetic, scheduling. It depends on no framework, no
 * database client and no clock — those arrive as arguments (ADR-0003).
 */

export {
  REGIONS,
  isRegion,
  regionLabel,
  assertExhaustive,
} from './regions/region';
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
  firstEnteredStageAt,
  appliedAt,
  isGhosted,
  parseStageHistory,
} from './pipeline/stage';
export type {ApplicationStage, StageEvent} from './pipeline/stage';

export {
  movesFrom,
  appendStageEvent,
  serialiseStageHistory,
} from './pipeline/transition';
export type {StoredStageEvent} from './pipeline/transition';

export {
  BOARD_LANES,
  summariseStage,
  longestWaitingFirst,
  buildLanes,
  summariseBoard,
} from './pipeline/board';
export type {StageSummary, BoardLane, BoardTotals} from './pipeline/board';

export {
  SELF_REPORTED,
  parseApplicationDraft,
  parseApplicationEdit,
} from './pipeline/draft';
export type {
  ApplicationDraftFields,
  ApplicationDraft,
  ApplicationEditFields,
  ApplicationEdit,
  CompanyDraft,
  JobDraft,
} from './pipeline/draft';

export {
  WORK_MODES,
  SPONSORSHIP_VALUES,
  isWorkMode,
  isSponsorship,
} from './jobs/job';
export type {WorkMode, Sponsorship} from './jobs/job';

export {normaliseDomain} from './companies/domain';

export {accept, reject} from './validation';
export type {Validated, Accepted, Rejected} from './validation';

export {
  parseLanguageRequirement,
  formatLanguageRequirement,
} from './regions/language';
export type {LanguageRequirement} from './regions/language';

export {ADVERT_FIELDS, parseJobAdvert} from './jobs/advert';
export type {
  AdvertField,
  JobAdvertExtraction,
  ApplicationDraftFieldsFromAdvert,
} from './jobs/advert';

export {
  jobAdvertPrompt,
  JOB_ADVERT_TASK,
  JOB_ADVERT_PROMPT_VERSION,
} from './jobs/advert-prompt';
