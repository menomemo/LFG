# ADR-0003: Keep business logic in `packages/core`

| | |
| --- | --- |
| **Status** | Accepted |
| **Date** | 2026-11-04 |
| **Deciders** | @Yihong |

## Context

Every AI capability in this product is implemented as a plugin for an agent runtime
(DeepSeek Harness) that is explicitly in developer preview and will make breaking changes.
At the same time, the rules worth protecting are not in the plugins: competency scoring with
time decay, FSRS scheduling, portfolio metrics, ghost detection, region policy, résumé
provenance. Those are the product.

There are also three consumers of the same rules — the web app, the mobile app, and the
plugins — and they must agree. A conversion rate that differs between the board and the
weekly report is not a cosmetic bug; it destroys trust in every number the product shows.

The natural way to build this is to write the logic where it is first needed, which is
inside a plugin, because that is the shortest path to a working feature.

## Decision

> We will put all business logic in `packages/core`, which imports no framework, no agent
> runtime, no Supabase client and no environment variables, and takes its dependencies —
> including the clock — as arguments. Plugins live in `plugins/*` and only translate
> parameters and call `core` through an adapter layer in `packages/adapters`. The
> operational test: **if a behaviour deserves a unit test, it belongs in `core`.** Import
> boundaries are enforced by lint, not by convention.

## Alternatives considered

| Option | What it would give us | Why not |
| --- | --- | --- |
| Logic inside the plugins | Fewer layers, faster first feature | A preview-stage dependency would own our scoring and rubrics. Every breaking release becomes a rewrite of the product's substance, and the same rule gets reimplemented for the web app |
| Logic in the web app, plugins call its API | One obvious home | Mobile and schedulers then depend on the web app being up, and the rules become entangled with HTTP and framework concerns |
| Logic in Postgres functions | Close to the data, one implementation | Hard to version and test, hostile to the typed client, and unavailable to the mobile app offline |
| A thin `core` for types only, rules duplicated where used | Minimal indirection | Duplicated rules diverge. That divergence shows up as two different numbers on two screens |

## Consequences

**What this makes easier**

- A breaking runtime change costs a rewrite of the adapter layer — days, not a rewrite of
  the product
- Rules are unit-testable without a database, a network or a model, because they are pure
  functions with the clock injected
- Web, mobile and plugins cannot disagree about a number, since there is one implementation

**What this makes harder**

- Every feature crosses a boundary, so the first version of anything takes slightly longer
- The adapter layer is genuine extra code with no user-visible value
- The temptation to "just put it in the plugin, it's only ten lines" never goes away, and
  ten lines is how the boundary dies

**What this commits us to**

- Dependency injection in `core` — the clock, the database, the model backend are all
  arguments. This is also what makes the scoring functions reproducible
- Lint rules for import boundaries, maintained as the packages grow. Without enforcement
  this ADR is a wish
- The exit cost is low in the useful direction: collapsing a boundary later is easy, while
  introducing one after logic has spread is not. That asymmetry is the whole argument

**What to watch**

- Any rule appearing in a plugin or an app — the lint rule should make this loud
- An adapter layer that starts making decisions instead of translating
- `core` growing an import of something environmental; that is the first crack
