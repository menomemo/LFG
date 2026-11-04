/**
 * Concentration arithmetic for the portfolio risk dashboard.
 *
 * A job search spread across four markets and several industries is a hedge; a
 * search that believes it is diversified while 90% of it sits in one market is
 * a hidden bet. These functions are what turn that intuition into a number the
 * weekly report can act on. See docs/product-spec.md, module 7.
 */

/**
 * Herfindahl–Hirschman index over a set of category counts.
 *
 * The index is the sum of squared shares, so it runs from `1 / n` for `n`
 * equally sized categories up to `1` for everything in one category. It is
 * scale-invariant: doubling every count leaves it unchanged, which is what
 * makes it comparable week to week as a pipeline grows.
 *
 * Thresholds are not here. They are configuration, because they are tuned
 * against this user's actual outcomes rather than derived (docs/regions.md
 * explains the same rule for market figures).
 *
 * @param counts Applications per category — per region, per industry, per
 *   company size. Keys are opaque to this function. Counts must not be
 *   negative; zero-valued categories are permitted and contribute nothing,
 *   which lets a caller pass every known category without filtering first.
 * @returns The index in `[0, 1]`, or `null` when the total is zero. `null`
 *   means "unknown", which is a different statement from "perfectly
 *   diversified" and must stay distinguishable all the way to the UI — an
 *   empty pipeline has no concentration, it has no data.
 * @throws RangeError If any count is negative or not finite.
 */
export function herfindahlIndex(
  counts: ReadonlyMap<string, number>,
): number | null {
  let total = 0;
  for (const [category, count] of counts) {
    if (!Number.isFinite(count) || count < 0) {
      throw new RangeError(
        `Count for category ${JSON.stringify(category)} must be a ` +
          `non-negative finite number, got ${String(count)}.`,
      );
    }
    total += count;
  }

  if (total === 0) {
    return null;
  }

  let index = 0;
  for (const count of counts.values()) {
    const share = count / total;
    index += share * share;
  }
  return index;
}

/**
 * Share of the total held by each category.
 *
 * The companion to {@link herfindahlIndex}: the index says how concentrated
 * the pipeline is, this says where the concentration sits, which is what a
 * rebalancing suggestion needs in order to name a market.
 *
 * @param counts As in {@link herfindahlIndex}.
 * @returns Shares in `[0, 1]` summing to 1, keyed as the input was, with
 *   categories in the input's iteration order. Empty when the total is zero.
 * @throws RangeError If any count is negative or not finite.
 */
export function shareByCategory(
  counts: ReadonlyMap<string, number>,
): ReadonlyMap<string, number> {
  let total = 0;
  for (const [category, count] of counts) {
    if (!Number.isFinite(count) || count < 0) {
      throw new RangeError(
        `Count for category ${JSON.stringify(category)} must be a ` +
          `non-negative finite number, got ${String(count)}.`,
      );
    }
    total += count;
  }

  const shares = new Map<string, number>();
  if (total === 0) {
    return shares;
  }
  for (const [category, count] of counts) {
    shares.set(category, count / total);
  }
  return shares;
}
