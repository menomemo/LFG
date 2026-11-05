/**
 * The shape of a validation result.
 *
 * docs/code-standards.md allows two ways to refuse bad input: narrow it, or
 * return a typed error. Core's parsers of database values throw, because a
 * malformed `jsonb` column is a fault nobody can act on from a form. Input a
 * person just typed is the other case: it has somewhere to be displayed, and
 * throwing would turn a typo into a stack trace.
 *
 * Problems are plural on purpose. A form that reveals one mistake at a time
 * makes the person submit four times to learn four things.
 */

/** Input that passed every rule. */
export interface Accepted<T> {
  readonly ok: true;
  readonly value: T;
}

/** Input that did not, with every reason found rather than the first. */
export interface Rejected {
  readonly ok: false;
  /** Complete sentences: these are shown to the person who typed the input. */
  readonly problems: readonly string[];
}

/** The result of validating untrusted input. */
export type Validated<T> = Accepted<T> | Rejected;

/** Wraps a value that passed validation. */
export function accept<T>(value: T): Accepted<T> {
  return {ok: true, value};
}

/**
 * Collects the reasons input was refused.
 *
 * @throws RangeError If called with no problems. A rejection that cannot say
 *   what was wrong is a silent failure wearing a type.
 */
export function reject(problems: readonly string[]): Rejected {
  if (problems.length === 0) {
    throw new RangeError('A rejection must carry at least one problem.');
  }
  return {ok: false, problems};
}
