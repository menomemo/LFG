/**
 * The markets LFG supports, as a closed set.
 *
 * Region is a modelled dimension rather than a location label: it selects the
 * résumé template, decides how a language requirement is read, drives the
 * sponsorship question, and slices every portfolio metric (ADR-0004).
 *
 * Keeping it closed is the point. Adding a market is a deliberate act that the
 * compiler then forces you to finish — every exhaustive `switch` over `Region`
 * will fail until you have answered, for the new market, what a résumé looks
 * like there. A free-text column asks no questions.
 *
 * Mirrors the Postgres enum of the same name; see docs/data-model.md.
 */

/**
 * Supported markets, in the order used for display.
 *
 * `other` is the deliberate escape hatch for a job outside the playbook. It is
 * expected to stay rare: if it grows past a few percent of rows, the enum is
 * the wrong shape and that is a signal to revisit ADR-0004, not to widen this
 * list quietly.
 */
export const REGIONS = ['uk', 'ie', 'ee', 'jp', 'de', 'other'] as const;

/** A market LFG has a playbook for. See docs/regions.md. */
export type Region = (typeof REGIONS)[number];

/**
 * Narrows an untrusted value to a {@link Region}.
 *
 * Use this at every boundary — parsed JD payloads, model output, form bodies,
 * database rows read through an untyped client. Model output in particular is
 * untrusted input: it gets parsed, never cast (docs/code-standards.md).
 *
 * @param value Anything, including `null` and `undefined`.
 * @returns `true` when `value` is one of {@link REGIONS}.
 */
export function isRegion(value: unknown): value is Region {
  return (
    typeof value === 'string' && (REGIONS as readonly string[]).includes(value)
  );
}

/**
 * Fails loudly on a case that the type system believed was unreachable.
 *
 * Call it in the `default` branch of a `switch` over a closed union. If a new
 * `Region` is added and a `switch` is left incomplete, compilation fails here —
 * which is the behaviour we want from a region policy, because the alternative
 * is a market silently falling through to another market's résumé template.
 *
 * @param value The value the compiler has narrowed to `never`.
 * @throws Always. The thrown error names the value, so a mismatch between the
 *   TypeScript union and the Postgres enum is diagnosable from the message.
 */
export function assertExhaustive(value: never): never {
  throw new Error(
    `Unhandled case: ${JSON.stringify(value)}. A closed union gained a member ` +
      'without every switch over it being updated.',
  );
}
