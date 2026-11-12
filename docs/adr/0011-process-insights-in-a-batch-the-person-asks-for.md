# ADR-0011: Process insights in a batch the person asks for, never at capture

|                |            |
| -------------- | ---------- |
| **Status**     | Accepted   |
| **Date**       | 2026-11-12 |
| **Deciders**   | @menomemo  |
| **Supersedes** | —          |

## Context

Module 6 of [product-spec.md](../product-spec.md) stores something the author learned and
later turns it into a rehearsal. Between those two is a pipeline: extract a one-sentence
point and an actionable principle, tag one to three sales dimensions, cluster by
similarity, generate drills. The first two of those are now the next thing to build, and
they are the first model call in the product that is not about a job advert.

Four facts constrain where that call can run.

**Capture must not wait for it.** The premise the table was built on is that capture is
nearly free — `supabase/migrations/20261105160000` makes every column after `raw_text`
nullable and says so in its comment. A capture that is three seconds from a share sheet
cannot become a capture that is three seconds plus however long a provider takes, and it
cannot fail because a provider is down. The offline queue in the product spec makes this
harder still: a capture written on the Underground has no network at all.

**The call costs money and must be metered.** [CLAUDE.md](../../CLAUDE.md) rule 4 requires
an `llm_usage` row and a declared ceiling for every model call, and
[ADR-0009](0009-run-model-calls-from-supabase-not-the-web-host.md) puts the call and the
meter in one Supabase function with no path between them, for the reason that a call site
which _can_ return without metering eventually will.

**The answer must be checkable before it is stored.** Rule 5 is parse, never trust: the
response is schema-validated, retried once with the error, then fails visibly. Rule 3 is
that an AI-written field carries `generated_by`, which the `insights` table enforces by
tying it to `summary` in a check constraint.

**There is no scheduler.** Polling's cron was cut on 2026-11-11 and recorded in
[roadmap.md](../roadmap.md); nothing in this project runs on a timer yet. A design that
needs one is a design that does not run.

The open question is therefore not where the call goes — ADR-0009 settled that — but
_when_ it goes, and what one invocation covers.

## Decision

> We will process insights only when the person asks, over the captures that have not been
> processed yet, one model call per insight, up to a fixed number of insights per
> invocation. Capture itself never calls a model, and a capture whose processing failed
> stays exactly as it was: raw text with nothing written over it.

The surface is one button on the insight library saying how many unprocessed captures
there are. The `tag-insights` Edge Function selects that many of the person's insights
with no summary, calls the model once per insight, validates each answer in
`packages/core`, and writes `summary`, `principle`, `sales_dims` and `generated_by`
together in one update per insight. Insights that failed are named in the response and
left untouched, so pressing the button again retries exactly those.

## Alternatives considered

| Option                                        | What it would give us                                                                                                   | Why not                                                                                                                                                                                                                                                                 |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tag at capture, in the capture action         | An insight is complete the moment it is stored; no second step to remember, no button, no "unprocessed" state in the UI | Breaks the premise the table was designed around. Capture becomes as slow and as fallible as a provider, which is the one thing module 6 is specifically built not to be — and the offline path cannot work at all                                                      |
| A database trigger or webhook on insert       | Automatic, invisible, no surface at all                                                                                 | A trigger that spends money is a trigger nobody can see spending it. The meter and the cap would live behind an insert, where neither the person nor a failing call has anywhere to appear, and a loop in it would be found on the bill                                 |
| One model call for the whole batch            | Fewer requests, one system prompt instead of N                                                                          | One malformed answer loses every insight in the batch, and the single retry rule 5 allows cannot say which item was wrong. Per-insight calls make the retry specific and the failure partial. Provider-side prompt caching removes most of what the shared prompt saved |
| Process everything unprocessed, with no limit | One press clears the backlog                                                                                            | An unbounded loop over rows is how a cheap per-item cost becomes an expensive invocation, and a function with a wall-clock limit would fail halfway with no record of where. A fixed ceiling per press is a cost the person can see before paying it                    |
| Do nothing — leave captures raw               | No cost, no provider, no prompt to maintain                                                                             | The library is a notebook until something reads it. Tagging is what makes an insight findable by dimension, which is what the sparring and pre-interview steps are built on                                                                                             |

## Consequences

**What this makes easier**

- Capture stays what it was: two columns, one insert, no network beyond Supabase. The
  mobile share sheet and the offline queue inherit that unchanged.
- The cost is visible before it is incurred. The button says how many captures it would
  process, and the ceiling is a number in configuration rather than a loop's appetite.
- A failure is partial and retryable by pressing the same button. Nothing has to track
  which insight failed, because "has no summary" already means exactly that.
- `generated_by` is written in the same statement as the summary it belongs to, so the
  table's own constraint enforces rule 3 rather than this codebase remembering it.

**What this makes harder**

- The library is stale until the person presses the button. An insight captured on Monday
  and never processed is invisible to anything that searches by dimension, and nothing
  reminds them.
- Per-insight calls mean per-insight overhead. A batch of twenty is twenty requests, and
  the saving from a shared system prompt depends on provider-side caching rather than on
  anything this project controls.
- The button is a step the product spec does not have. The spec's pipeline is implicitly
  automatic, and this is the version of it that works without a scheduler.

**What this commits us to**

- A `tag-insights` function that is safe to run twice: it must select only unprocessed
  insights and must not write a partial result over a capture.
- Reversing this is cheap in one direction and not the other. Moving to automatic
  processing later means adding a scheduled invocation of the same function — the
  function does not change, only who presses it. Moving the call into capture would mean
  giving up the offline path, which is why that direction is the one to be suspicious of.

**What to watch**

- Whether the button gets pressed. If the author captures for two weeks and never
  processes, the batch is not the problem — the step is — and a schedule (or processing on
  read) becomes the answer.
- Whether the per-insight cost stays negligible. The advert parser runs at about $0.0002 a
  call; if an insight costs meaningfully more than that, the batch ceiling is the number
  to revisit first.
