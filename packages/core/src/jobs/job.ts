/**
 * The attributes of a role that decide whether applying is worth it.
 *
 * Both of these mirror Postgres enums (supabase/migrations/20261105090000)
 * and both are closed sets for the same reason `Region` is: they feed match
 * scoring and the sponsorship coverage metric, and a free-text column asks no
 * questions of whoever fills it in.
 */

/** How the role is worked. */
export const WORK_MODES = ['onsite', 'hybrid', 'remote'] as const;

/** Where the work happens, as recorded in `jobs.work_mode`. */
export type WorkMode = (typeof WORK_MODES)[number];

/**
 * Narrows an untrusted value to a {@link WorkMode}.
 *
 * @param value Anything, including `null` and `undefined`.
 */
export function isWorkMode(value: unknown): value is WorkMode {
  return (
    typeof value === 'string' &&
    (WORK_MODES as readonly string[]).includes(value)
  );
}

/**
 * Whether the role sponsors a visa.
 *
 * Tri-state on purpose. `unknown` is the default and is a different claim
 * from `no`: the sponsorship coverage metric counts only confirmed values, so
 * collapsing the two would quietly inflate it (docs/product-spec.md, module
 * 7). Unknown is not zero.
 */
export const SPONSORSHIP_VALUES = ['yes', 'no', 'unknown'] as const;

/** A sponsorship answer, as recorded in `jobs.visa_sponsorship`. */
export type Sponsorship = (typeof SPONSORSHIP_VALUES)[number];

/**
 * Narrows an untrusted value to a {@link Sponsorship}.
 *
 * @param value Anything, including `null` and `undefined`.
 */
export function isSponsorship(value: unknown): value is Sponsorship {
  return (
    typeof value === 'string' &&
    (SPONSORSHIP_VALUES as readonly string[]).includes(value)
  );
}
