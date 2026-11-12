/**
 * The eight dimensions the insight library is organised on, and how far any
 * one insight has got through the pipeline.
 *
 * Module 6 of docs/product-spec.md is the differentiating one: everything the
 * author learns is filed along sales dimensions and turned into a rehearsal.
 * The dimensions are an enum in the database
 * (supabase/migrations/20261105160000) for the reason that matters here —
 * they are the axis the whole library is searched on, so a tagger that could
 * invent a ninth would quietly make it unsearchable.
 *
 * The progress half of this file exists because the table's columns are
 * nullable on purpose. Capture has to be nearly free, which means a row that
 * is raw text and nothing else is a finished row as far as the person is
 * concerned, and every later step — the summary, the principle, the tags, the
 * cluster, the drills — may not have happened yet. What a surface must never
 * do is render that as though it had: an insight with no tags is untagged,
 * not tagged with nothing (CLAUDE.md rule 8).
 */

import {assertExhaustive} from '../regions/region.ts';

/**
 * The sales dimensions, in the order docs/product-spec.md lists them.
 *
 * The order is the product's, not alphabetical: it runs from the start of a
 * conversation to what happens after it, so a list of chips reads as a
 * sequence rather than a bag.
 */
export const SALES_DIMENSIONS = [
  'opening',
  'discovery',
  'storytelling',
  'value_proposition',
  'objections',
  'trust',
  'closing',
  'following_up',
] as const;

/** One of the eight dimensions. */
export type SalesDimension = (typeof SALES_DIMENSIONS)[number];

/** Whether a stored or model-written string is one of the eight. */
export function isSalesDimension(value: string): value is SalesDimension {
  return (SALES_DIMENSIONS as readonly string[]).includes(value);
}

/**
 * How a dimension is named to a person.
 *
 * Three of the eight do not read as their column values: `objections` is
 * "Handling objections", `trust` is "Building trust", and
 * `value_proposition` is one word in the database and two on screen. The
 * enum value is what is stored and queried; this is what is shown.
 */
export function salesDimensionLabel(dimension: SalesDimension): string {
  switch (dimension) {
    case 'opening':
      return 'Opening';
    case 'discovery':
      return 'Discovery';
    case 'storytelling':
      return 'Storytelling';
    case 'value_proposition':
      return 'Value proposition';
    case 'objections':
      return 'Handling objections';
    case 'trust':
      return 'Building trust';
    case 'closing':
      return 'Closing';
    case 'following_up':
      return 'Following up';
    default:
      return assertExhaustive(dimension);
  }
}

/**
 * The parts of a stored insight that say how far it has been processed.
 *
 * Not the whole row: the raw text, the link and the clock are not evidence
 * about the pipeline, and a function that took them could be read as
 * deciding something about them.
 */
export interface InsightProcessing {
  /** The one-sentence point, model-written, or null before it was written. */
  readonly summary: string | null;
  /** The actionable principle, which the table allows only with a summary. */
  readonly principle: string | null;
  /** The dimensions it was filed under. Empty is the pre-tagger state. */
  readonly dims: readonly SalesDimension[];
}

/**
 * Where an insight has got to.
 *
 * Four states rather than three, because the two halves of processing are
 * written by separate steps and the database constrains them separately: it
 * requires a principle to have a summary, and says nothing at all about tags.
 * An insight that was tagged but never summarised is therefore a shape the
 * table permits, and folding it in with either neighbour would mean a surface
 * claiming a summary exists when it does not.
 */
export type InsightProgress = 'captured' | 'read' | 'tagged' | 'filed';

/** Derives how far one insight has been processed. */
export function insightProgress(insight: InsightProcessing): InsightProgress {
  const read = insight.summary !== null;
  const tagged = insight.dims.length > 0;
  if (read && tagged) {
    return 'filed';
  }
  if (read) {
    return 'read';
  }
  if (tagged) {
    return 'tagged';
  }
  return 'captured';
}

/**
 * What to say about an insight in that state.
 *
 * Each sentence names what has not happened yet rather than what has, since
 * the thing a reader of this list needs to know is whether the library is
 * working on their captures or just holding them.
 */
export function insightProgressLabel(progress: InsightProgress): string {
  switch (progress) {
    case 'captured':
      return 'Captured — not read yet';
    case 'read':
      return 'Read — not tagged yet';
    case 'tagged':
      return 'Tagged — not read yet';
    case 'filed':
      return 'Read and tagged';
    default:
      return assertExhaustive(progress);
  }
}

/** What the library as a whole has got through. */
export interface LibraryTotals {
  /** Every insight captured. */
  readonly captured: number;
  /** How many carry a model-written summary. */
  readonly read: number;
  /** How many carry at least one dimension. */
  readonly tagged: number;
}

/**
 * Counts what has been captured against what has been processed.
 *
 * Three numbers rather than one, because "41 insights" is the number that
 * flatters: a library of 41 captures and no summaries is a notebook, and the
 * difference between the first number and the other two is the only thing on
 * the page that says so.
 */
export function summariseLibrary(
  insights: readonly InsightProcessing[],
): LibraryTotals {
  return {
    captured: insights.length,
    read: insights.filter(insight => insight.summary !== null).length,
    tagged: insights.filter(insight => insight.dims.length > 0).length,
  };
}
