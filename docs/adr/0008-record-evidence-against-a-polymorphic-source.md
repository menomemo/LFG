# ADR-0008: Record evidence against a polymorphic source

|              |            |
| ------------ | ---------- |
| **Status**   | Accepted   |
| **Date**     | 2026-11-05 |
| **Deciders** | @Yihong    |

## Context

The competency radar is the feature that distinguishes this product from a spreadsheet, and
the thing that makes it defensible is that every score traces to something that actually
happened. `docs/product-spec.md` module 4 states the rule plainly: scores come from
aggregated evidence, and a sub-skill with no evidence reads "unknown" rather than zero. The
Phase 3 gate is passed only when every score on the radar traces to real evidence.

Evidence arrives from everything else in the product, and the list is not closed:

| Source                                   | Written by                     | Arrives in |
| ---------------------------------------- | ------------------------------ | ---------- |
| Real interview feedback                  | `interviews.feedback`          | Phase 1    |
| A mock interview scored against a rubric | `mock-interviewer`             | Phase 3    |
| A flashcard review                       | `review_logs`                  | Phase 3    |
| A practice drill                         | `drills`                       | Phase 1    |
| An insight debrief                       | `insights`                     | Phase 1    |
| A project                                | nothing — the user types it in | Phase 3    |
| A self-assessment                        | the user                       | Phase 3    |

Two of those seven have no row anywhere to point at. The rest point at five different
tables, and the scoring function does not care which: it reads a score, a weight and a
timestamp, and the source only decides the weight.

The alternative shapes were all available. This is a one-database product with foreign keys
used everywhere else in the schema, including two cross-tenant checks added specifically
because a reference leaks more than it looks like it does, so declining a foreign key here
needs an argument.

## Decision

> We will record evidence with `source_type` as an enum and `source_id` as a bare `uuid`
> with no foreign key, and we will resolve a source to a row in `packages/core` rather
> than in the schema. `source_id` is nullable, because two of the source types have no row
> to point at.

The invariant the schema does enforce is the one that matters for scoring: a row carries a
`competency_id` that belongs to the same user, a score, a weight, a timestamp, and
provenance when a model produced the score.

## Alternatives considered

| Option                                               | What it would give us                                            | Why not                                                                                                                                                                                                                                                                    |
| ---------------------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One nullable foreign-key column per source type      | Real referential integrity, and `on delete` behaviour per source | Seven nullable columns, five of them null in any given row, plus a check constraint asserting that exactly one is set — and a schema migration every time a new kind of practice is added. The constraint is the kind nobody maintains, and the table stops being readable |
| A join table per source type                         | Integrity, and no nullable columns                               | Seven tables, seven sets of RLS policies, seven isolation tests, and every scoring query becomes a seven-way union. The cost is paid on every read forever to protect against a bad write                                                                                  |
| Postgres inheritance, or a `sources` supertype table | One foreign key, and the supertype row carries the tenancy       | Every source table would have to be rewritten to insert its supertype row first, which means retrofitting `interviews`, `review_logs` and `drills` — and inheritance in Postgres does not carry foreign keys or unique constraints into the children anyway                |
| Do nothing — store only a text description           | No integrity problem at all                                      | "Click a sub-skill to see the evidence behind the number" is in the spec, and the drill-down has to be able to open the interview it came from                                                                                                                             |

## Consequences

**What this makes easier**

- Adding a source of evidence is an enum value, not a migration plus a policy plus a test.
- The scoring function stays what it should be: a pure fold over `{score, weight, observed_at}`.
- The two sourceless kinds — a project, a self-assessment — are representable without
  pretending a row exists.

**What this makes harder**

- The database will not stop a dangling `source_id`, so deleting an interview can leave
  evidence pointing at nothing. The drill-down has to render that as "source no longer
  available" rather than crashing, and the score stays valid, because the score was never
  derived from the source row.
- A cross-tenant `source_id` cannot be refused by a policy. It is a weaker leak than the
  foreign keys elsewhere — there is no join from it the database will perform, and
  resolution happens in `core` against rows RLS has already filtered, so a foreign id
  resolves to nothing. It is still a hole the other tables do not have, and the isolation
  suite asserts the shape of what it can and cannot do rather than leaving it unstated.
- Nothing cascades. Evidence is deliberately not deleted when its source is, which is the
  right default for a history table and a surprise for anyone expecting otherwise.

**What this commits us to**

- Resolution lives in one place in `core`, keyed on `source_type`, with an exhaustiveness
  check so a new source type fails to compile until it is handled.
- Exit cost is low and one-directional: adding real foreign keys later means seven
  nullable columns, a backfill keyed on `source_type`, and a check constraint. The data
  does not need to move. Going the other way — from seven columns back to this — is the
  expensive direction, which is the argument for starting here.

**What to watch**

- Dangling `source_id` values appearing in normal use rather than after a deliberate
  delete. That would mean something is deleting sources that evidence still refers to, and
  the fix is `on delete` behaviour the schema cannot currently express.
- A source type that needs its own queryable fields on the evidence row. The first time
  something wants "all evidence from interviews at tier-A companies" and has to resolve
  every row in `core` to answer, this decision is costing more than it saves.
