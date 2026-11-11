import type {CompanyWatchFields} from '@lfg/core';

/**
 * What the watch-a-company form carries between submissions.
 *
 * The same shape as `CreateApplicationState` and for the same reason: React
 * resets an uncontrolled form once its action returns, so a refused
 * submission would clear the fields and leave the person to retype them.
 * `attempt` is the remount key — it changes on every submission, which is
 * what makes a successful one clear the form.
 */
export interface WatchCompanyState {
  /** Every reason the submission was refused, joined, or null. */
  readonly problem: string | null;
  /** What was submitted, so a refusal does not empty the form. */
  readonly fields: CompanyWatchFields;
  /** How many submissions have returned. */
  readonly attempt: number;
  /**
   * The company now being watched, when the last submission succeeded.
   *
   * Said out loud because the next thing to happen is a button press, and
   * "Monzo is now watched" is the only confirmation that the slug was
   * accepted at all — the poll itself happens later and can fail for its own
   * reasons.
   */
  readonly watching: string | null;
}

/** A blank form. */
export const EMPTY_WATCH_FORM: WatchCompanyState = {
  problem: null,
  fields: {name: '', ats: '', board: ''},
  attempt: 0,
  watching: null,
};
