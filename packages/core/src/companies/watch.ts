/**
 * Turning what someone types about a company's job board into something
 * pollable.
 *
 * ADR-0010 decides that a company carrying both `ats_type` and `ats_slug` is
 * a company to poll. This module is the gate in front of those two columns,
 * and it exists because the slug is not a label: it becomes a path segment
 * in an outbound request, and a wrong one is indistinguishable from a company
 * that is not hiring — the poller fetches, gets a 404, records that against
 * the company and moves on.
 *
 * The other half of its job is accepting a pasted link. Nobody holds a board
 * slug; they hold `https://jobs.lever.co/deliveroo`, because that is what a
 * company's careers page links to. Asking for the slug instead would be
 * asking the person to perform a string operation this file can do, in the
 * one place where getting it wrong fails quietly.
 */

import {accept, reject, type Validated} from '../validation.ts';
import {boardUrl, isPollableAts, type PollableAts} from '../jobs/board.ts';

/** What the form asks for. */
export interface CompanyWatchFields {
  /** The employer's name, as it should appear on a card. */
  readonly name: string;
  /** Which provider, as the select's value. */
  readonly ats: string;
  /** The board's name, or a link to the board. */
  readonly board: string;
}

/** A company the poller can read, once these are stored on its row. */
export interface CompanyWatch {
  readonly name: string;
  readonly ats: PollableAts;
  readonly slug: string;
}

/**
 * Board hosts whose provider is recognisable from the link alone.
 *
 * Matched against the end of the hostname, not anywhere in it: `lever.co`
 * as a substring also matches `lever.co.uk.example.com`, and a link to
 * someone's blog post about Lever must not be read as a board.
 */
const PROVIDER_HOSTS: readonly (readonly [string, PollableAts])[] = [
  ['greenhouse.io', 'greenhouse'],
  ['lever.co', 'lever'],
  ['ashbyhq.com', 'ashby'],
];

/**
 * Path segments that belong to a board URL's structure rather than to the
 * company.
 *
 * `boards-api.greenhouse.io/v1/boards/monzo/jobs` is the endpoint this
 * project fetches, so it is the link a reader of this codebase is most likely
 * to have in hand — and its slug is the third segment, not the first.
 */
const STRUCTURAL_SEGMENTS = new Set([
  'v1',
  'v0',
  'boards',
  'postings',
  'posting-api',
  'job-board',
  'embed',
]);

/**
 * What the board field turned out to be.
 *
 * Four cases rather than an optional slug, because each one needs a
 * different sentence said to the person. A link to the wrong site and a
 * typo'd board name are not the same mistake and do not have the same fix.
 */
type Reference =
  /** Nothing was typed. */
  | {readonly kind: 'empty'}
  /** Not a link, so it says nothing about which provider it belongs to. */
  | {readonly kind: 'slug'; readonly slug: string}
  /** A link to a provider we can read. The slug may still be missing. */
  | {
      readonly kind: 'board';
      readonly ats: PollableAts;
      readonly slug: string | null;
    }
  /** A link to something else entirely. */
  | {readonly kind: 'foreign'; readonly host: string};

/** Reads a provider and a slug out of whatever was typed. */
function readReference(text: string): Reference {
  const trimmed = text.trim();
  if (trimmed === '') {
    return {kind: 'empty'};
  }

  /* A link only if it looks like one. `URL` accepts `mailto:` and more
     besides, and no board name contains a scheme. */
  if (!/^https?:\/\//i.test(trimmed)) {
    return {kind: 'slug', slug: trimmed.toLowerCase()};
  }

  let url;
  try {
    url = new URL(trimmed);
  } catch {
    return {kind: 'slug', slug: trimmed.toLowerCase()};
  }

  const host = url.hostname.toLowerCase();
  const provider =
    PROVIDER_HOSTS.find(([suffix]) => host.endsWith(suffix))?.[1] ?? null;
  if (provider === null) {
    return {kind: 'foreign', host};
  }

  const segments = url.pathname
    .split('/')
    .map(segment => segment.trim().toLowerCase())
    .filter(segment => segment !== '' && !STRUCTURAL_SEGMENTS.has(segment));

  return {kind: 'board', ats: provider, slug: segments[0] ?? null};
}

/** How a provider is named in a sentence shown to a person. */
const ATS_LABELS: Record<PollableAts, string> = {
  greenhouse: 'Greenhouse',
  lever: 'Lever',
  ashby: 'Ashby',
};

/** Every refusal that names the board field ends up pointing here. */
const WHERE_THE_NAME_IS =
  'It is the last part of the board’s own link — jobs.lever.co/deliveroo ' +
  'is “deliveroo”.';

/**
 * Validates a company whose board should be watched.
 *
 * Every refusal names what to do about it, because the alternative is a
 * person who pasted a careers page instead of a board and has no way to tell
 * that apart from a company that is not hiring.
 *
 * A link whose provider contradicts the one selected is refused rather than
 * silently believed. Either could be the mistake — the select or the paste —
 * and this module does not know which, so it says what it found and stops.
 *
 * @param fields Straight from the form.
 * @returns The three values to store, or every reason they were refused.
 */
export function parseCompanyWatch(
  fields: CompanyWatchFields,
): Validated<CompanyWatch> {
  const problems: string[] = [];

  const name = fields.name.trim();
  if (name === '') {
    problems.push('The company needs a name.');
  }

  const selected: PollableAts | null = isPollableAts(fields.ats)
    ? fields.ats
    : null;
  if (selected === null) {
    problems.push(
      'Choose the provider whose board this is: Greenhouse, Lever or Ashby.',
    );
  }

  const reference = readReference(fields.board);

  /* The provider the link names wins where there is one: it is evidence,
     and the select is a choice someone made from a dropdown. */
  let ats = selected;
  let slug: string | null = null;

  switch (reference.kind) {
    case 'empty':
      problems.push(
        'Give the board: either its name, or a link to the company’s board.',
      );
      break;

    case 'slug':
      slug = reference.slug;
      break;

    case 'foreign':
      problems.push(
        `${reference.host} is not a board on Greenhouse, Lever or Ashby. ` +
          'Those are the three with a public board this can read; a careers ' +
          'page on the company’s own site is not one of them.',
      );
      break;

    case 'board':
      ats = reference.ats;
      slug = reference.slug;
      if (selected !== null && selected !== reference.ats) {
        problems.push(
          `That link is a ${ATS_LABELS[reference.ats]} board, but ` +
            `${ATS_LABELS[selected]} is selected. Fix whichever is wrong.`,
        );
      }
      if (reference.slug === null) {
        problems.push(
          `That link does not include the company’s board name. ${WHERE_THE_NAME_IS}`,
        );
      }
      break;
  }

  if (slug !== null && ats !== null && boardUrl(ats, slug) === null) {
    /* Reached by a typo, a name with a space in it, or a deep path pasted
       without its host — and all three look like a board name to whoever
       typed them. `boardUrl` refuses anything that could change what gets
       requested, so this is the one place that failure is explained. */
    problems.push(`“${slug}” is not a board name. ${WHERE_THE_NAME_IS}`);
  }

  if (problems.length > 0) {
    return reject(problems);
  }
  if (ats === null || slug === null) {
    /* Unreachable: every branch that leaves either null pushed a problem. */
    throw new Error('A missing provider or board name was accepted.');
  }

  return accept({name, ats, slug});
}
