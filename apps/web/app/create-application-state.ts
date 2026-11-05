import type {ApplicationDraftFields} from '@lfg/core';

/**
 * What the create form shows after a submission.
 *
 * The fields are echoed back because React resets an uncontrolled form once
 * its action returns, which on a refusal would throw away everything the
 * person typed and ask them to type it again. They are re-seeded as the
 * form's defaults instead, so a refusal costs one correction rather than
 * eight fields.
 *
 * This lives beside the action rather than in it: a `'use server'` module may
 * only export async functions, and both the action and the form need the
 * blank state below.
 */
export interface CreateApplicationState {
  /** Every reason the form was refused, or `null` when it was accepted. */
  readonly problem: string | null;
  /** What was submitted, to fill the form back in. */
  readonly fields: ApplicationDraftFields;
  /**
   * How many times the form has been submitted.
   *
   * The form is keyed on this so that every submission mounts a fresh one.
   * React applies a `<select>`'s `defaultValue` only when it mounts, so
   * without a remount the text fields would come back filled and the market
   * and work mode would come back blank — the half-restored form that is
   * worse than either whole one.
   */
  readonly attempt: number;
}

/**
 * An untouched create form.
 *
 * Market is blank on purpose: a pre-selected region is a guess about where
 * someone is applying, and a guess that lands silently picks the wrong résumé
 * template and the wrong visa question (ADR-0004).
 */
export const EMPTY_CREATE_FORM: CreateApplicationState = {
  problem: null,
  attempt: 0,
  fields: {
    company: '',
    domain: '',
    role: '',
    region: '',
    workMode: '',
    sponsorship: 'unknown',
    sourceUrl: '',
    stage: 'saved',
  },
};
