/**
 * Reading a company's ATS board, and deciding what is worth keeping.
 *
 * A company publishes a role to its own applicant tracking system first;
 * aggregators ingest afterwards, in batches, only for postings the company
 * chose to syndicate. Reading the board reads the original
 * ([ADR-0010](../../../../docs/adr/0010-poll-ats-boards-and-store-leads-as-jobs.md)).
 *
 * Two jobs live here and nowhere else, because both are rules rather than
 * plumbing: turning a provider's JSON into one shape, and deciding whether a
 * posting is one the author would want. The caller fetches bytes.
 *
 * The filter matters more than the parsing. Monzo's board returned 64 roles
 * on 2026-11-11 and Deliveroo's 194, almost none of them engineering and
 * none of them filtered by market at the source. Storing everything would
 * bury the signal in the thing this exists to find. So the filter runs
 * before anything is written, and it is a pure function with tests, because
 * a role it wrongly discards leaves no trace anywhere.
 */

import {isRegion, type Region} from '../regions/region.ts';

/**
 * The boards this knows how to read.
 *
 * A subset of the `ats_type` enum in the database on purpose: `workday` and
 * `other` are real values a company row may carry, and there is no public
 * JSON endpoint for them. A company set to one of those is skipped rather
 * than failed.
 */
export const POLLABLE_ATS = ['greenhouse', 'lever', 'ashby'] as const;

/** An ATS whose board can be read without a key. */
export type PollableAts = (typeof POLLABLE_ATS)[number];

/** Narrows a stored `ats_type` to one this module can poll. */
export function isPollableAts(value: unknown): value is PollableAts {
  return (POLLABLE_ATS as readonly unknown[]).includes(value);
}

/**
 * One posting, in the shape the `jobs` table wants.
 *
 * `region` is resolved here rather than stored as the provider's location
 * string, because `jobs.region` is `NOT NULL` and is the dimension every
 * downstream decision turns on (ADR-0004). A posting whose location cannot
 * be resolved to one of our markets is not a posting we keep.
 */
export interface BoardPosting {
  readonly title: string;
  readonly sourceUrl: string;
  readonly region: Region;
  /** The provider's location text, kept verbatim for the UI. */
  readonly location: string;
  /**
   * When the company first published it, if the provider says.
   *
   * The whole premise of polling is that this leads the aggregators by some
   * amount nobody has measured. Keeping it is what makes the question
   * answerable later instead of arguable.
   */
  readonly firstPublishedAt: string | null;
}

/** What a poll of one board produced. */
export interface BoardReading {
  /** Postings that passed every rule, in the order the provider gave them. */
  readonly kept: readonly BoardPosting[];
  /**
   * How many postings were read and discarded.
   *
   * Counted rather than dropped silently. A filter that is too narrow finds
   * nothing and looks exactly like a company that is not hiring, and this
   * number is the only thing that tells those apart.
   */
  readonly discarded: number;
}

/**
 * Location text that resolves to one of our markets.
 *
 * Substrings, lower-cased, checked in order. This is a lookup table and not
 * a cleverness: a provider's location field is free text written by whoever
 * posted the role, and every attempt to parse it structurally meets
 * "Cardiff, London or Remote (UK)" and gives up.
 *
 * Deliberately not exhaustive. An unmatched location means the posting is
 * discarded, which is the safe direction: a role in a market we do not
 * support is not a miss, and a role we wrongly discard is visible in the
 * discarded count.
 */
const LOCATION_HINTS: readonly (readonly [string, Region])[] = [
  // United Kingdom. 'uk' before 'ukraine' would be wrong, so the test
  // checks that too.
  ['united kingdom', 'uk'],
  ['london', 'uk'],
  ['manchester', 'uk'],
  ['edinburgh', 'uk'],
  ['glasgow', 'uk'],
  ['cardiff', 'uk'],
  ['bristol', 'uk'],
  ['cambridge', 'uk'],
  ['oxford', 'uk'],
  ['leeds', 'uk'],
  ['birmingham', 'uk'],
  ['belfast', 'uk'],
  ['england', 'uk'],
  ['scotland', 'uk'],
  ['wales', 'uk'],
  // Ireland
  ['ireland', 'ie'],
  ['dublin', 'ie'],
  ['cork', 'ie'],
  ['galway', 'ie'],
  // Estonia
  ['estonia', 'ee'],
  ['tallinn', 'ee'],
  ['tartu', 'ee'],
  // Japan
  ['japan', 'jp'],
  ['tokyo', 'jp'],
  ['osaka', 'jp'],
  ['kyoto', 'jp'],
  ['yokohama', 'jp'],
  // Germany
  ['germany', 'de'],
  ['berlin', 'de'],
  ['munich', 'de'],
  ['münchen', 'de'],
  ['hamburg', 'de'],
  ['frankfurt', 'de'],
  ['cologne', 'de'],
  ['köln', 'de'],
];

/* 'ireland' would otherwise match 'Northern Ireland', which is the UK, and
   the right answer for a sponsorship question and a CV template both. Checked
   before the table. */
const NORTHERN_IRELAND = /\bnorthern\s+ireland\b/;

/**
 * Resolves a provider's location text to one of our markets.
 *
 * @param location Free text, as the provider wrote it.
 * @returns The market, or `null` when nothing in the text names one.
 */
export function regionFromLocation(location: string): Region | null {
  const text = location.toLowerCase();
  if (text.trim() === '') {
    return null;
  }
  if (NORTHERN_IRELAND.test(text)) {
    return 'uk';
  }
  for (const [hint, region] of LOCATION_HINTS) {
    if (text.includes(hint)) {
      return region;
    }
  }
  return null;
}

/**
 * Title fragments that mark a role as one worth seeing.
 *
 * Matched case-insensitively against the whole title. Broad on purpose: a
 * posting discarded here is invisible, so the cost of being slightly too
 * broad is a row to ignore, and the cost of being slightly too narrow is a
 * role the author never learns existed.
 */
const WANTED_TITLE = [
  'software engineer',
  'software developer',
  'backend',
  'back end',
  'back-end',
  'frontend',
  'front end',
  'front-end',
  'full stack',
  'fullstack',
  'full-stack',
  'platform engineer',
  'infrastructure engineer',
  'site reliability',
  'sre',
  'data engineer',
  'machine learning',
  'ml engineer',
  'ai engineer',
  'research engineer',
  'graduate engineer',
  'developer',
  'programmer',
];

/**
 * Title fragments that disqualify a role however well it otherwise matches.
 *
 * Seniority is the point of most of these. The author is applying at
 * graduate and junior level, and a staff or principal posting is not a near
 * miss — it is noise that makes the list unreadable. `manager` catches the
 * engineering-adjacent roles that carry an engineering word in the title.
 */
const UNWANTED_TITLE = [
  /* The most likely entry to need tuning. In these markets "senior"
     generally means several years in, so for a graduate search it is not a
     near miss. If the discarded count turns out to be hiding roles worth
     seeing, this is the first line to reconsider. */
  'senior',
  'staff',
  'principal',
  'director',
  'head of',
  'vp ',
  'vice president',
  'manager',
  'lead ',
  ' lead',
  'architect',
  'intern',
  'internship',
  'placement',
  'apprentice',
  'contract',
  'sales engineer',
  'solutions engineer',
  'support engineer',
  'customer engineer',
  'field engineer',
  'test engineer',
  'qa engineer',
];

/**
 * Decides whether a title is one the author would want to see.
 *
 * Disqualifiers are checked first, so "Staff Backend Engineer" is refused
 * rather than kept on the strength of "backend".
 *
 * @param title The posting's title.
 * @returns Whether it should be kept.
 */
export function isWantedTitle(title: string): boolean {
  const text = title.toLowerCase();
  if (UNWANTED_TITLE.some(fragment => text.includes(fragment))) {
    return false;
  }
  return WANTED_TITLE.some(fragment => text.includes(fragment));
}

/** The markets a poll will keep postings for. */
export interface BoardCriteria {
  readonly regions: readonly Region[];
}

function readString(source: Record<string, unknown>, key: string): string {
  const value = source[key];
  return typeof value === 'string' ? value : '';
}

/**
 * Pulls the location text out of a provider's posting.
 *
 * Three shapes, because three providers: Greenhouse nests it under
 * `location.name`, Lever under `categories.location`, Ashby gives a flat
 * `location`. Handled here rather than in three parsers because everything
 * else about the three is identical and three near-copies of this file would
 * drift.
 */
function readLocation(posting: Record<string, unknown>): string {
  const flat = posting.location;
  if (typeof flat === 'string') {
    return flat;
  }
  if (typeof flat === 'object' && flat !== null) {
    const named = (flat as {name?: unknown}).name;
    if (typeof named === 'string') {
      return named;
    }
  }
  const categories = posting.categories;
  if (typeof categories === 'object' && categories !== null) {
    const nested = (categories as {location?: unknown}).location;
    if (typeof nested === 'string') {
      return nested;
    }
  }
  return '';
}

/** Pulls the posting's own address out of a provider's posting. */
function readUrl(posting: Record<string, unknown>): string {
  for (const key of ['absolute_url', 'hostedUrl', 'jobUrl', 'applyUrl']) {
    const value = posting[key];
    if (typeof value === 'string' && value !== '') {
      return value;
    }
  }
  return '';
}

/** Pulls a first-published timestamp, which not every provider sends. */
function readFirstPublished(posting: Record<string, unknown>): string | null {
  for (const key of ['first_published', 'createdAt', 'publishedAt']) {
    const value = posting[key];
    if (typeof value === 'string' && value !== '') {
      return value;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return new Date(value).toISOString();
    }
  }
  return null;
}

/**
 * Reads a board's response into the postings worth keeping.
 *
 * Takes `unknown` for the same reason `parseJobAdvert` does: this is a
 * provider's response body and nothing about its shape is guaranteed
 * (CLAUDE.md rule 5). A malformed response yields nothing kept rather than
 * throwing — a poll runs on a schedule with nobody watching, and a crash
 * there is a feature that silently stops working.
 *
 * @param raw The parsed response body. Greenhouse wraps its array in
 *   `{jobs: [...]}`; Lever and Ashby return a bare array. Both are accepted.
 * @param criteria The markets to keep.
 * @returns What was kept, and how many were read and discarded.
 */
export function readBoard(raw: unknown, criteria: BoardCriteria): BoardReading {
  const list: readonly unknown[] = Array.isArray(raw)
    ? raw
    : typeof raw === 'object' &&
        raw !== null &&
        Array.isArray((raw as {jobs?: unknown}).jobs)
      ? (raw as {jobs: readonly unknown[]}).jobs
      : [];

  const kept: BoardPosting[] = [];
  let discarded = 0;

  for (const entry of list) {
    if (typeof entry !== 'object' || entry === null) {
      discarded++;
      continue;
    }
    const posting = entry as Record<string, unknown>;

    const title = readString(posting, 'title').trim();
    const sourceUrl = readUrl(posting);
    const location = readLocation(posting).trim();
    const region = regionFromLocation(location);

    /* Every one of these is a reason to discard, and none of them is an
       error: a board carries roles for markets we do not cover and levels we
       do not apply at, which is the normal case rather than a fault. */
    if (
      title === '' ||
      sourceUrl === '' ||
      region === null ||
      !criteria.regions.includes(region) ||
      !isWantedTitle(title)
    ) {
      discarded++;
      continue;
    }

    kept.push({
      title,
      sourceUrl,
      region,
      location,
      firstPublishedAt: readFirstPublished(posting),
    });
  }

  return {kept, discarded};
}

/**
 * The URL a board is read from.
 *
 * Kept here beside the parsing so that adding a provider is one change in
 * one file. These are the documented public endpoints; none takes a key,
 * which is what makes polling them compatible with rule 7.
 *
 * @param ats Which provider the company uses.
 * @param slug The company's board identifier.
 * @returns The endpoint, or `null` when the slug is unusable.
 */
export function boardUrl(ats: PollableAts, slug: string): string | null {
  const clean = slug.trim().toLowerCase();
  /* A slug becomes a path segment. Anything that could change what is being
     requested is refused rather than escaped, because there is no legitimate
     board whose name needs it. */
  if (clean === '' || !/^[a-z0-9][a-z0-9._-]*$/.test(clean)) {
    return null;
  }
  switch (ats) {
    case 'greenhouse':
      return `https://boards-api.greenhouse.io/v1/boards/${clean}/jobs?content=false`;
    case 'lever':
      return `https://api.lever.co/v0/postings/${clean}?mode=json`;
    case 'ashby':
      return `https://api.ashbyhq.com/posting-api/job-board/${clean}`;
  }
}

/** Narrows a value to a region we support, for reading stored criteria. */
export function regionsFrom(values: readonly unknown[]): readonly Region[] {
  return values.filter(isRegion);
}
