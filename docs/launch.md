# Launch

|                   |                                                     |
| ----------------- | --------------------------------------------------- |
| **Status**        | Planning — Phase 5                                  |
| **Last reviewed** | 2026-11-04                                          |
| **Shape**         | Public web first, mobile app to the App Store after |

Three goals in a fixed order, because skipping one makes the next meaningless: it works for
its author, it is available to other people, it reaches people who would want it. This
document covers the second and third; [roadmap.md](roadmap.md) covers the first.

## Why web first

The mobile app is already the better capture surface, but shipping it first would mean
App Store review latency in the release loop and a store listing for a product with one
user. The web app can go from private to public in an afternoon, takes feedback the same
day, and is linkable — which matters because every distribution channel here is a link.

The sequence: web app public with signup and subscriptions → mobile on TestFlight for the
author throughout → App Store once the web product has real users and the capture flow has
stopped changing.

## Readiness: web

Nothing here is optional, and all of it is cheaper before there are users than after.

### Correctness and safety

- [ ] Multi-tenant verification: an automated test proving user A cannot reach user B's
      data through any surface, plus one manual attempt to break it
- [ ] Every table's RLS policies reviewed as a set, not individually
- [ ] Service-key usage audited — confined to scheduler plugins with explicit user context
- [ ] Rate limits on every endpoint that triggers inference
- [ ] Per-user quotas enforced server-side, with a clear message when one is hit
- [ ] Secrets only in environment configuration; a scan of history for leaked keys before
      the repository is made public

### Legal and compliance

GDPR applies in all four wave-1 markets. These are features, with a deadline, not a page
of text:

- [ ] Privacy policy: what is collected, why, where it is processed, which sub-processors
      (model providers, search APIs, email, hosting), retention
- [ ] Terms of service, including an explicit statement that the product never applies or
      sends messages on a user's behalf
- [ ] Data export: everything a user has, in a usable format, self-service
- [ ] Account deletion: self-service, actually deletes, including derived rows and
      embeddings
- [ ] Cookie and analytics stance: privacy-preserving analytics, nothing requiring a
      consent wall if avoidable
- [ ] A sub-processor list that is kept current — it changes whenever a model backend does
- [ ] Clear handling of third-party contact data users store, since `contacts` holds other
      people's information

### Operations

- [ ] Error tracking
- [ ] Uptime monitoring with an alert that reaches a phone
- [ ] A cost dashboard from `llm_usage`, with cost per active user
- [ ] Backups verified by performing one restore
- [ ] A runbook: model backend down, database at capacity, quota exhausted, a stuck
      scheduler, a bad migration
- [ ] A rollback performed once on purpose, before it is needed in anger

### Product

- [ ] Onboarding that reaches first value fast — paste a JD, get a parsed application
- [ ] Empty states that explain what to do, since a new account has no data and most of
      this product is computed from data
- [ ] A support address that is answered
- [ ] `CHANGELOG.md` kept current, because build-in-public needs something to point at

## Readiness: mobile

- [ ] App Store privacy disclosures matching what the app actually collects
- [ ] Account deletion reachable from inside the app, which the store requires
- [ ] A review account and a reviewer-facing note, since the product is useless with an
      empty database
- [ ] Subscription handling: either in-app purchase with the platform's cut, or web-only
      billing with nothing in the app that could read as steering users around it — decide
      deliberately, the rules here are specific
- [ ] OTA update strategy so a fix does not wait on review
- [ ] Push permission asked at the moment it is obviously useful, not on launch

## Commercial model

| Tier               | Who                             | What limits it                               |
| ------------------ | ------------------------------- | -------------------------------------------- |
| Free               | Trying it out, light searchers  | A daily inference allowance                  |
| Paid subscription  | Active searchers                | Generous caps, heavy-tier models available   |
| Bring your own key | Power users, the cost-sensitive | Their key, their spend, near-zero cost to us |

Inference is our cost, not the user's, which is the whole reason the cost controls in
[architecture.md](architecture.md#cost-control) exist from day one rather than being
retrofitted when the first bill arrives. Price is set after there is a measured cost per
active user — a number Phase 5's dashboard exists to produce.

## Distribution

The product has one unusually good property: it generates artefacts people already share.
A funnel Sankey diagram showing 180 applications, 12 interviews and 2 offers is the kind of
post that circulates in job-search communities on its own merits. The export is designed
for that — company names hidden by default, numbers kept, a small watermark.

| Channel                                             | Form                                     | Cadence               |
| --------------------------------------------------- | ---------------------------------------- | --------------------- |
| Build in public                                     | Development log, short video or carousel | 1–2 per week          |
| Job-search insights, drawn from the insight library | Carousel                                 | 1–2 per week          |
| Cross-border hiring observations (UK, EU, Japan)    | Short video                              | Every two weeks       |
| Feature demos                                       | Screen recording                         | On each release       |
| Shareable artefacts                                 | Sankey and weekly-report exports         | When the user chooses |

**Division of labour.** AI drafts: topics, scripts, carousel copy, image drafts — produced
in batches on a schedule. The author reviews, appears or narrates, and publishes. Accounts
belong to the author; publishing is confirmed every time, through official APIs only, never
by automating a login. AI-generated content is labelled per platform rules.

**Where the first twenty users come from** is an open question in
[architecture.md](architecture.md#10-open-questions), and it needs an answer in Phase 4,
before launch, not after. The candidates: university and alumni communities, local tech
meetups, the communities where the Sankey posts land, and the agent-runtime plugin
community.

## Influence, measured honestly

Vanity metrics are easy to accumulate and teach nothing. These are the ones worth watching:

- Active users who are not the author, week over week
- Retention at week 4 — in a job-search product, churn to "got the job" is a success, so
  separate those at the exit survey
- Applications per active user per week, the actual proof the cost collapsed
- Inbound: people arriving because someone else mentioned it
- If the repository is public: stars, forks, and whether any issue comes from a real user

## Open decisions

| Decision                                                            | Blocks                          | Needed by                                                        |
| ------------------------------------------------------------------- | ------------------------------- | ---------------------------------------------------------------- |
| Licence, and public repository before or after launch               | Everything about distribution   | Before the first push ([ADR-0005](adr/0005-choose-a-license.md)) |
| Product name as presented to users, and the handles to match        | Domain, store listing, accounts | Phase 4                                                          |
| In-app purchase or web-only billing                                 | Mobile launch, pricing          | Before App Store submission                                      |
| Whether a free tier is viable at all once cost per user is measured | Pricing                         | Phase 5                                                          |
