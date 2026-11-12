import type {InsightCaptureFields} from '@lfg/core';

/**
 * What the capture box carries between submissions.
 *
 * The same shape as the other two form states and for the same reason: React
 * resets an uncontrolled form once its action returns, so a refused
 * submission would throw away the paste. A paste is the one input in this
 * project that cannot be retyped — it came from somewhere else, and whatever
 * it was copied from may already be closed.
 */
export interface CaptureInsightState {
  /** Every reason the submission was refused, joined, or null. */
  readonly problem: string | null;
  /** What was submitted, so a refusal does not empty the box. */
  readonly fields: InsightCaptureFields;
  /** How many submissions have returned; the form's remount key. */
  readonly attempt: number;
  /**
   * Whether the last submission stored something.
   *
   * Said out loud because capture is meant to be the end of the
   * interaction — there is nothing else to look at and no stage to watch it
   * move to, so without a sentence the person cannot tell a stored capture
   * from a cleared form.
   */
  readonly captured: boolean;
}

/** An empty capture box. */
export const EMPTY_CAPTURE_FORM: CaptureInsightState = {
  problem: null,
  fields: {text: '', sourceUrl: ''},
  attempt: 0,
  captured: false,
};
