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
} from './regions/region.ts';
export type {Region} from './regions/region.ts';

export {herfindahlIndex, shareByCategory} from './portfolio/concentration.ts';

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
} from './pipeline/stage.ts';
export type {ApplicationStage, StageEvent} from './pipeline/stage.ts';

export {
  movesFrom,
  appendStageEvent,
  serialiseStageHistory,
} from './pipeline/transition.ts';
export type {StoredStageEvent} from './pipeline/transition.ts';

export {
  BOARD_LANES,
  summariseStage,
  longestWaitingFirst,
  buildLanes,
  summariseBoard,
} from './pipeline/board.ts';
export type {StageSummary, BoardLane, BoardTotals} from './pipeline/board.ts';

export {
  SELF_REPORTED,
  parseApplicationDraft,
  parseApplicationEdit,
} from './pipeline/draft.ts';
export type {
  ApplicationDraftFields,
  ApplicationDraft,
  ApplicationEditFields,
  ApplicationEdit,
  CompanyDraft,
  JobDraft,
} from './pipeline/draft.ts';

export {
  WORK_MODES,
  SPONSORSHIP_VALUES,
  isWorkMode,
  isSponsorship,
} from './jobs/job.ts';
export type {WorkMode, Sponsorship} from './jobs/job.ts';

export {normaliseDomain} from './companies/domain.ts';

export {accept, reject} from './validation.ts';
export type {Validated, Accepted, Rejected} from './validation.ts';

export {
  parseLanguageRequirement,
  formatLanguageRequirement,
} from './regions/language.ts';
export type {LanguageRequirement} from './regions/language.ts';

export {ADVERT_FIELDS, parseJobAdvert} from './jobs/advert.ts';
export type {
  AdvertField,
  JobAdvertExtraction,
  ApplicationDraftFieldsFromAdvert,
} from './jobs/advert.ts';

export {
  jobAdvertPrompt,
  JOB_ADVERT_TASK,
  JOB_ADVERT_PROMPT_VERSION,
} from './jobs/advert-prompt.ts';

export {
  POLLABLE_ATS,
  isPollableAts,
  isWantedTitle,
  regionFromLocation,
  readBoard,
  boardUrl,
  regionsFrom,
} from './jobs/board.ts';
export type {
  PollableAts,
  BoardPosting,
  BoardReading,
  BoardCriteria,
} from './jobs/board.ts';

export {parseCompanyWatch} from './companies/watch.ts';
export type {CompanyWatch, CompanyWatchFields} from './companies/watch.ts';

export {isHttpUrl} from './links.ts';

export {
  SALES_DIMENSIONS,
  isSalesDimension,
  salesDimensionLabel,
  insightProgress,
  insightProgressLabel,
  summariseLibrary,
} from './insights/insight.ts';
export type {
  SalesDimension,
  InsightProcessing,
  InsightProgress,
  LibraryTotals,
} from './insights/insight.ts';

export {parseInsightCapture} from './insights/capture.ts';
export type {InsightCaptureFields, InsightCapture} from './insights/capture.ts';
