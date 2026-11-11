# ADR-0010: Poll ATS boards on a schedule, and store a lead as a job

|                |            |
| -------------- | ---------- |
| **Status**     | Accepted   |
| **Date**       | 2026-11-11 |
| **Deciders**   | @menomemo  |
| **Supersedes** | —          |

## Context

The author's stated want is to see a role before it reaches LinkedIn. That is achievable,
and the mechanism is not clever: a company publishes to its own applicant tracking system
first, and aggregators ingest afterwards — in batches, only for postings the company chose
to syndicate, and often through more than one hop. Reading the ATS reads the original.

Measured on 2026-11-11, `boards-api.greenhouse.io/v1/boards/monzo/jobs` returns 64 roles,
each with `first_published` and `updated_at`. Deliveroo returns 194. These are documented
public endpoints requiring no key, which matters because [CLAUDE.md](../../CLAUDE.md) rule 7
permits public APIs and user input and forbids scraping. Polling a published JSON endpoint
is the former.

Three constraints shape what follows.

**Most of what comes back is irrelevant.** Monzo's 64 roles are mostly not engineering, and
none of them are filtered by region at the source. Storing everything would bury the
signal in the thing the product exists to find.

**It only works per company.** There is no endpoint that lists every board, so this needs
a company list. Broad discovery is a different source with a different latency profile —
an aggregator search API — and is deliberately out of scope here.

**The lag this is built to exploit has not been measured.** The claim that the ATS is
earlier is an argument from how syndication works, not a measurement, and measuring it
requires catching a posting as it appears — which is what this feature does. So the feature
is also the experiment, and it has to record enough to settle the question later.

## Decision

> We will poll the ATS board of every company that has both `ats_type` and `ats_slug`, on
> a schedule, from a Supabase Edge Function. Relevance is decided in `packages/core`
> before anything is written. A posting that survives becomes a row in `jobs` with no
> `applications` row — which is what a lead already is — written with
> `on conflict do nothing` against the existing `(user_id, source_url)` unique index.

`jobs` is described in its own migration as "a specific role at a company, parsed once,
keyed on `source_url`". A discovered posting is exactly that, and the index that stops the
JD parser paying twice for one posting is the same index that stops the poller storing one
twice.

## Alternatives considered

| Option                                                    | What it would give us                                     | Why not                                                                                                                                                                                                                                                 |
| --------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A new `leads` or `discovered_jobs` table (chosen against) | A clean separation between "found" and "considered"       | Two tables holding the same thing, and the question "is this already known" would have to be asked twice. `jobs` without an application is already the representation of a role nobody has acted on                                                     |
| Store every posting, filter in the UI                     | No filtering logic to get wrong; the full history is kept | Monzo alone is 64 rows per poll, ~95% irrelevant. The table that holds the signal would be mostly noise, and every later query would carry the filter instead                                                                                           |
| `signals` rather than `jobs`                              | It already exists and already takes a `source_url`        | `signals` is about the company — funding, layoffs, news. A posting is about a role, and its fields are a job's fields                                                                                                                                   |
| Poll from Netlify scheduled functions                     | One fewer deployment target                               | Charges the web host for work that has nothing to do with serving a page, which is the mistake [ADR-0009](0009-run-model-calls-from-supabase-not-the-web-host.md) was written to avoid. The poller also writes rows, so it belongs next to the database |
| Aggregator search API instead (Adzuna, Reed, Arbeitnow)   | Finds companies the author has never heard of             | It is as late as LinkedIn, because it is fed the same way. Complementary, not a substitute — it is how the company list gets populated later, and it needs its own decision                                                                             |
| Do nothing — keep pasting adverts by hand                 | The JD parser already works, and nothing new can break    | The want is explicit, the mechanism is cheap, and the per-company endpoint is free                                                                                                                                                                      |

## Consequences

**What this makes easier**

- A role at a watched company reaches the board without the author reading a job site.
- The lag question becomes answerable: every stored posting keeps `first_published`, so
  "how much earlier than LinkedIn" turns into a query rather than an argument.
- Nothing new is needed to deduplicate, promote a lead to an application, or render it —
  it is a `jobs` row, and everything that handles those already works.

**What this makes harder**

- `jobs` now has two kinds of row with different provenance: one the author pasted, one a
  poller inserted. Nothing in the schema distinguishes them, and a query that assumes
  every job was deliberately added is now wrong.
- Relevance is a judgement encoded in code. Too narrow and the feature silently finds
  nothing; too broad and it floods. It will be wrong at first in a way that is invisible
  — a role that was filtered out leaves no trace.
- The company list is now load-bearing and manual until discovery lands.

**What this commits us to**

- A schedule, which is a thing that runs whether or not anyone is watching it, and
  therefore needs a record of when it last ran and what it did.
- Politeness toward endpoints nobody is charging us for: one request per company per
  interval, no retries in a tight loop.
- Exit cost if wrong: low. The parsing and the filter are pure functions in `core`; the
  poller is a wrapper; the rows are ordinary `jobs` rows that can be deleted by their
  `source_url` prefix.

**What to watch**

- Whether the filter is throwing away roles the author would have wanted. The honest
  signal is the author finding a role elsewhere that the poller had already seen and
  discarded, which is only detectable if discards are counted.
- Whether `first_published` actually leads the aggregators. If it does not, the premise of
  this ADR is wrong and the cheaper aggregator API is the better source.
- Row growth in `jobs` relative to applications. A thousand leads and ten applications is
  a filter that is too broad, not a productive pipeline.
