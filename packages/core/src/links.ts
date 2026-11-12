/**
 * What counts as a link someone pasted.
 *
 * Extracted from `pipeline/draft.ts` when insight capture needed the same
 * test. The rule is not interesting; having one copy of it is. A link is a
 * deduplication key in two tables — `jobs.source_url` is what stops one
 * advert being parsed and paid for twice, and `insights.source_url` is what
 * a later pipeline step fetches — so two validators that disagree would
 * accept a string in one place that the other refuses, and the row that
 * results is wrong in a way nothing complains about.
 *
 * Deliberately not `new URL()`. That accepts `mailto:`, `javascript:` and
 * `data:`, resolves nothing about whether the host is plausible, and treats
 * `https://x` as valid. What is wanted here is narrower than a URL parser:
 * the shape of an address a person can paste out of a browser's address bar.
 */

/**
 * An http or https address with a dotted host.
 *
 * The dot is the part that does the work: it refuses `https://localhost` and
 * `https://x`, which are the two shapes a mistyped paste takes.
 */
const HTTP_URL = /^https?:\/\/[^\s/]+\.[^\s/]+(?:\/\S*)?$/;

/**
 * Whether this is an address worth storing as a link.
 *
 * @param text Trimmed input. Leading or trailing whitespace fails, because
 *   the caller trimming is also the caller deciding what it stored.
 */
export function isHttpUrl(text: string): boolean {
  return HTTP_URL.test(text);
}
