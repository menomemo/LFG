/**
 * Turning what someone pasted into the two columns a capture needs.
 *
 * The premise of module 6 is that capture costs nothing: three seconds from a
 * share sheet, offline if need be, and a row that has only been captured is a
 * valid row (supabase/migrations/20261105160000). A validator in front of
 * that premise has exactly one job it is allowed to do — refuse a capture
 * that could not be stored at all — and a long list of jobs it is not. It
 * does not ask which dimensions this is, or what the point of it is, or
 * whether it is about work. Those are the pipeline's, and asking the person
 * instead would make capture cost something.
 *
 * What is left is small and still worth testing, because the one shape that
 * matters most is the one with no prose in it at all. The mobile share sheet
 * sends a link and nothing else, and so does pasting a URL into the box; the
 * link is then both the source and, until something fetches the page, all the
 * text there is.
 */

import {isHttpUrl} from '../links.ts';
import {accept, reject, type Validated} from '../validation.ts';

/** What the capture box submits. */
export interface InsightCaptureFields {
  /** The paste: a quote, a thought, a link, or a link with a note after it. */
  readonly text: string;
  /** Where it came from, when the person filled that in separately. */
  readonly sourceUrl: string;
}

/** The two columns an `insights` row is created with. */
export interface InsightCapture {
  /** `insights.raw_text`, which the table requires to be non-empty. */
  readonly rawText: string;
  /** `insights.source_url`, or null when nothing established one. */
  readonly sourceUrl: string | null;
}

/**
 * Parses a capture.
 *
 * Whitespace is trimmed and nothing else is touched. A paste is likely to be
 * several lines of someone else's writing, and collapsing the blank line
 * between two paragraphs would be this module improving a quote — which is
 * the one thing a quote must not have happen to it.
 *
 * A capture that is nothing but a link has that link lifted into
 * `source_url`, and keeps it as its text as well. Storing the link twice
 * looks redundant and is not: `raw_text` is `NOT NULL` and this is honestly
 * everything that was captured, while `source_url` is the column a later
 * pipeline step reads to fetch the page. Clearing either one would mean
 * losing something — what the person did, or what to do about it.
 *
 * @param fields Straight from the form.
 * @returns The row to insert, or every reason it was refused.
 */
export function parseInsightCapture(
  fields: InsightCaptureFields,
): Validated<InsightCapture> {
  const problems: string[] = [];

  const text = fields.text.trim();
  const typedUrl = fields.sourceUrl.trim();

  if (typedUrl !== '' && !isHttpUrl(typedUrl)) {
    problems.push('The source link must be an http or https address.');
  }

  /* The whole paste, and only if the whole paste is a link. `isHttpUrl` is
     anchored and forbids whitespace, so "https://x.com/a — worth reading" is
     not one: the note after the link is content, and a capture with content
     is not a bare link. */
  const pastedUrl = isHttpUrl(text) ? text : null;

  if (text === '') {
    if (typedUrl === '') {
      problems.push(
        'There is nothing to capture yet. Paste what you learned, or a ' +
          'link to it.',
      );
    } else if (isHttpUrl(typedUrl)) {
      /* A link in the source field and an empty box is the share sheet's
         shape arriving through the web form. It is a capture, and the link is
         what was captured. */
      return accept({rawText: typedUrl, sourceUrl: typedUrl});
    }
  }

  if (problems.length > 0) {
    return reject(problems);
  }

  /* The field someone filled in wins over one inferred from the paste: both
     are the same person's input, and the explicit one was the later thought.
     They are allowed to differ — a quote from an article and the link to it
     are two different strings, and that is the normal case. */
  return accept({
    rawText: text,
    sourceUrl: typedUrl === '' ? pastedUrl : typedUrl,
  });
}
