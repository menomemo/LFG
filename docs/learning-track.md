# Learning track

|                   |            |
| ----------------- | ---------- |
| **Status**        | Active     |
| **Last reviewed** | 2026-11-04 |

This project has two deliverables: a product that ships, and an engineer who can design
systems. The second one does not happen automatically. Building something that works
teaches you that it works; it does not teach you why it works or what you traded away,
unless you deliberately stop and write that down.

So this document is the explicit version of the second deliverable: which system-design
topic each phase is a real instance of, what the evidence of learning is, and what it
means to have actually learned it rather than to have shipped past it.

## How learning gets recorded

Three mechanisms, all of them already part of the workflow — nothing extra to maintain:

1. **ADRs.** Every non-obvious decision gets one, including the alternatives and the
   consequences you accept. Writing the consequences section honestly is where most of the
   learning happens, because it forces you to name the cost.
2. **PR descriptions.** What changed, why, how verified, what was left out.
3. **A phase retrospective**, appended to this document when a gate is passed: what the
   design got right, what it got wrong, and what you would do differently. Dated.

The test for "learned" is not "it works". It is: **could you defend the decision to a
sceptical interviewer, including the cost?** That is also, not coincidentally, the format
of a system-design interview.

## Phase 1 — Foundation

| Topic                        | The real instance in this project                                                                                                                 |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Data modelling               | Fifteen tables with a hub-and-spoke shape. Why `applications` is the hub; why `stage_history` is append-only rather than a mutable `stage` column |
| Multi-tenancy                | RLS as the enforcement point. Where tenancy is enforced, and why "the app filters by user_id" is not an answer                                    |
| Event sourcing, in the small | Deriving every metric from an append-only history instead of storing computed state                                                               |
| Module boundaries            | `core` with no framework imports, enforced by lint, so the boundary is real rather than aspirational                                              |
| Idempotency                  | The offline capture queue. Why the client generates the id                                                                                        |

**Evidence of learning:** you can explain, without looking, why stage history is append-only
and what breaks the day someone updates a row in place. ADRs 0002–0004 exist.

**Trap:** reaching for RLS as a checkbox without ever writing the test that proves isolation.
Then you have the feeling of security and not the property.

## Phase 2 — Precision applying

| Topic                      | The real instance                                                                                                          |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Caching                    | 30-day company profiles, parse-once JDs. Choosing the cache key, choosing the TTL, and deciding what a stale profile costs |
| External dependency design | Four flaky sources behind one interface, with partial results and per-item confidence instead of all-or-nothing            |
| Data fusion                | Cross-validating three stack signals. What confidence means when sources disagree                                          |
| Rate limiting and backoff  | Third-party APIs that will cut you off                                                                                     |
| Idempotent pipelines       | Re-running research without duplicating rows or re-paying for inference                                                    |
| Provenance as a constraint | A `NOT NULL` column making a class of bug unreachable, rather than a code review catching it                               |

**Evidence of learning:** you can state your cache invalidation policy and what it is wrong
about, and name what happens when two sources disagree.

**Trap:** caching by URL and then discovering the same JD at three URLs.

## Phase 3 — Capability

| Topic                                        | The real instance                                                                                              |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Algorithm design under real constraints      | Time-decayed weighted scoring. Picking λ, and what the score means with two data points                        |
| Confidence and uncertainty                   | "Unknown" as a first-class value, distinct from zero, all the way to the UI                                    |
| Using a library instead of building          | FSRS via `ts-fsrs`. Knowing enough about spaced repetition to integrate it correctly, not enough to rewrite it |
| Schema evolution                             | Adding a competency axis after data exists                                                                     |
| Deterministic cores, non-deterministic edges | Keeping scoring pure and testable while the inputs come from a model                                           |

**Evidence of learning:** your scoring functions are pure, the clock is an argument, and you
can defend the source weights as calibrated rather than invented.

**Trap:** letting a model produce the score directly. Then there is no system to reason
about, just a vibe with a number attached.

## Phase 4 — Risk

| Topic                    | The real instance                                                                                              |
| ------------------------ | -------------------------------------------------------------------------------------------------------------- |
| Batch and scheduled work | Weekly reports and signal scans. At-least-once delivery, and what a duplicate report costs versus a missed one |
| Time series              | Weekly ATS headcount, and detecting a real decline rather than noise                                           |
| Derived metrics          | HHI, coverage, conversion. Recompute on read or materialise?                                                   |
| Alert design             | Thresholds that produce action instead of fatigue                                                              |
| Degradation              | A scheduler outage must not drop a follow-up reminder; this is why Supabase cron is the fallback               |

**Evidence of learning:** you can say which jobs are idempotent and which are
at-least-once, and why that is the right choice for each.

**Trap:** alerting on everything, then ignoring the alerts. A threshold nobody acts on is
worse than no threshold.

## Phase 5 — Launch

| Topic                  | The real instance                                                                                            |
| ---------------------- | ------------------------------------------------------------------------------------------------------------ |
| Multi-tenant hardening | Someone else's résumé in the same database as yours                                                          |
| Quotas and abuse       | Per-user caps where the marginal cost is inference you pay for                                               |
| Observability          | Error tracking, uptime, cost per user — the first time you are debugging something you cannot reproduce      |
| Billing                | Subscription state as a source of truth you do not own                                                       |
| Release engineering    | Migrations against a database with real users; App Store review latency as a constraint on the release train |
| Compliance as design   | GDPR export and deletion as features, in four jurisdictions                                                  |

**Evidence of learning:** a runbook exists, you know your cost per active user, and you have
debugged one problem using only telemetry.

**Trap:** launching with no observability and learning about outages from users.

## The full lifecycle

The other half of the goal: not one stage done well, but the whole chain touched on
purpose. Tick these as they genuinely happen.

- [ ] Requirement written as a spec that can be checked against a build
- [ ] Design document and ADR before implementation, not after
- [ ] Schema migration reviewed like code
- [ ] Implementation behind real module boundaries
- [ ] Unit tests for rules, integration tests for flows, an RLS isolation test
- [ ] CI running format, lint, types and tests on every PR
- [ ] Deploy with a rollback you have actually performed once, deliberately
- [ ] Observability: logs, errors, uptime, cost
- [ ] A real incident diagnosed and written up
- [ ] A deprecation carried out: something removed cleanly, not left to rot
- [ ] User feedback changing a design decision, with the ADR to show it
- [ ] A dependency upgraded across a breaking change (the runtime will force this)

## Tech-stack depth

Superficial familiarity is using it; depth is knowing where it bites. One line per item,
filled in as it is earned.

| Technology      | Depth target                                                                                                |
| --------------- | ----------------------------------------------------------------------------------------------------------- |
| TypeScript      | Strict-mode generics and discriminated unions without reaching for `any`                                    |
| Postgres        | Indexes, query plans, transactions, and RLS as a security boundary                                          |
| pgvector        | Index types and their recall/latency trade-off; why a shared vector space may be wrong for JDs and insights |
| Supabase        | Auth, RLS, Realtime, migrations, and where the managed abstraction leaks                                    |
| Next.js         | Server/client boundary, caching, and where data fetching belongs                                            |
| Expo            | Share extensions, background sync, push, OTA updates                                                        |
| Agent runtimes  | Tool and skill design, step limits, cost control, evaluating non-deterministic output                       |
| LLM engineering | Prompt versioning, structured output, fallback ladders, regression testing against fixtures                 |
| Typst           | Templating documents from structured data                                                                   |
| CI/CD           | Pipelines, environments, release gates                                                                      |

## Retrospectives

Appended when a gate is passed. Dated, honest, and specific enough to be uncomfortable.

<!-- ### 2026-xx-xx — Phase 1
What the design got right:
What it got wrong:
What I would do differently:
What I now know that I did not before:
-->
