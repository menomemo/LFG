/**
 * What the detail view shows after a save.
 *
 * Beside the action rather than in it: a `'use server'` module may only
 * export async functions, and both the action and the panel need the blank
 * state below.
 */
export interface ApplicationEditState {
  /** Every reason the save was refused, or `null`. */
  readonly problem: string | null;
  /**
   * How many saves have succeeded.
   *
   * A count rather than a flag, so that saving twice with nothing changed in
   * between still registers as something having happened.
   */
  readonly saved: number;
}

/** A detail view that has not been saved yet. */
export const UNSAVED: ApplicationEditState = {problem: null, saved: 0};
