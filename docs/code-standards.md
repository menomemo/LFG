# Code standards

| | |
| --- | --- |
| **Status** | Active |
| **Last reviewed** | 2026-11-04 |
| **Baseline** | [Google TypeScript Style Guide](https://google.github.io/styleguide/tsguide.html) |

The baseline is Google's TypeScript style guide. This document records the deltas, the
things the guide does not cover (SQL, migrations, prompts, plugins), and the process
around the code. Where this document and the Google guide disagree, this document wins —
but a disagreement should be rare enough to be worth a sentence of justification.

Formatting is not a matter of opinion here: `prettier` and `eslint --fix` decide, they run
in CI, and style comments in review are reserved for things a linter cannot catch.

## Language rules

**TypeScript strict, everywhere.** `strict: true`, plus `noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes`, `noImplicitOverride`. No build ships with type errors.

**`any` is banned.** Use `unknown` and narrow it. If an external library forces your hand,
write `// eslint-disable-next-line @typescript-eslint/no-explicit-any` with a reason on the
line above — the comment is the point, not the suppression.

**No non-null assertions (`!`) in `packages/core`.** Narrow, or return a typed error. The
module that computes someone's competency scores does not get to assume.

**Parse at the boundary.** Every external input — JD text, API response, model output, form
body — is validated by a schema (zod) at the edge, and the rest of the code works with
parsed types. Model output in particular is untrusted input: it is parsed, not cast.

**`type` for shapes, `interface` only when declaration merging is actually needed.**
Prefer discriminated unions over optional-field soup, and `as const` objects over enums
(with the exception of database enums, which mirror the Postgres type).

**Immutability by default.** `readonly` on fields and arrays in `core`; return new objects
rather than mutating arguments. Scoring functions must be pure — same inputs, same outputs,
no clock, no network. The clock is an argument.

**No floating promises.** Every promise is awaited, returned, or explicitly `void`-ed with
a comment saying why.

**Errors.** Throw `Error` subclasses with a stable `code`; never throw strings or plain
objects. An error crossing a module boundary carries enough context to act on and no
user's personal data in its message.

## Naming

Google's rules, which are worth restating because they are the ones most often broken:

| Thing | Case | Example |
| --- | --- | --- |
| Type, class, enum, React component | `UpperCamelCase` | `ApplicationStage`, `RadarChart` |
| Variable, function, method, property | `lowerCamelCase` | `computeHhi`, `nextActionAt` |
| Module-level constant, genuinely deeply immutable | `CONST_CASE` | `MAX_TIER_A_IN_FLIGHT` |
| File, directory | `kebab-case` | `portfolio-metrics.ts`, `company-research/` |
| React component file | `UpperCamelCase.tsx` | `ApplicationBoard.tsx` |
| Database table, column | `snake_case`, tables plural | `resume_versions.source_bullet_id` |
| Test file | matches the subject | `portfolio-metrics.test.ts` |

Names say what a thing is, not how it is stored or what type it has: `applications`, not
`applicationList`; `dueAt`, not `dueAtTimestamp`. No abbreviations beyond the ones already
in the domain (`jd`, `ats`, `hhi`, `fsrs`, `rls`), and those are spelled out the first time
they appear in a file's documentation comment.

## Structure

**Functions are small and do one thing.** If a function needs a comment explaining its
second half, that half is a function.

**Module boundaries are the ones in [architecture.md](architecture.md#layer-responsibilities),
enforced by lint:**

- `packages/core` imports no framework, no runtime, no Next.js, no Supabase client, no
  `process.env`. It takes its dependencies as arguments.
- `plugins/*` contains no business rule. If a plugin has a function worth unit-testing on
  its own, that function is in the wrong package.
- `apps/*` contains no scoring, scheduling or region logic.

**Dependencies.** Prefer the standard library, then a small well-maintained package, then
writing it. Adding a dependency that is hard to remove later needs an
[ADR](adr/README.md). Never add a dependency to save fewer than about thirty lines.

## Comments and documentation

Comments explain **why**. The code already says what.

Every exported symbol in `packages/core` has a JSDoc comment. For anything non-obvious it
states the units, the valid range, and what happens at the edges:

```ts
/**
 * Weighted, time-decayed competency score for one sub-skill.
 *
 * Evidence is weighted by source reliability and decayed exponentially, so a strong
 * signal from a year ago does not outrank a weak one from last week. Weights live in
 * configuration, not here, because they are calibrated against real interview outcomes.
 *
 * @param evidence Non-empty. An empty set is "unknown", which is a different thing from
 *   a score of zero and is represented by `null` upstream, not by calling this.
 *   The caller is responsible for that distinction.
 * @param now Injected rather than read from the clock, so scores are reproducible.
 * @returns A score in [0, 1].
 */
```

`TODO(username): description` with a linked issue, or delete it. An undated, unowned TODO
is a lie about intent.

Commented-out code is deleted. Git remembers.

## Tests

**A new feature ships with a test or a runnable example.** Not both required, not neither
allowed.

| Layer | What is tested | Tooling |
| --- | --- | --- |
| `packages/core` | Every rule: scoring, HHI, ghost detection, FSRS wiring, region policy. Pure functions, table-driven cases, edge cases first | vitest |
| `plugins/*` | A regression test per plugin against recorded fixtures, so a runtime upgrade fails loudly. Prompts are asserted on shape and invariants, never on exact model prose | vitest |
| `apps/*` | The flows that lose data if they break: stage changes, capture, diff acceptance | vitest + Playwright |
| Database | RLS policies — a test that proves user A cannot read user B's rows | SQL tests against a local Supabase |

Test names read as sentences: `returns unknown when there is no evidence`. No test depends
on the wall clock, on network access, or on the order the suite runs in. Model calls are
never made in tests; they are fixtures.

The RLS test is not optional. It is the one test whose absence could leak another person's
résumé.

## Database and migrations

- Every migration is forward-only, checked in, and reviewed like code
- A table's first migration creates it **and** enables RLS **and** adds its policies —
  never a follow-up
- Every table has `user_id`, `created_at`, `updated_at`
- `timestamptz` only, UTC in the database
- No destructive migration without a written rollback plan in the PR description
- Index what the UI actually queries, and say which query in the migration's comment
- Generated TypeScript types are committed, so a schema drift shows up as a diff

## AI-specific rules

These exist because this project's failure modes are mostly here.

1. **No provider or model name in business code.** Backends are configuration; `core` sees
   an interface.
2. **Every model call is metered** into `llm_usage` before its result is used.
3. **Every plugin declares a daily call cap and a maximum step count.** No exceptions,
   including for local models.
4. **Model output is parsed, never trusted.** Validate against a schema; on failure, retry
   once with the validation error, then fail visibly. Never silently fall back to prose.
5. **Provenance columns are `NOT NULL`.** Anything generated carries `generated_by` and a
   source. A résumé bullet without a `source_bullet_id` is a bug that must not be
   reachable.
6. **Prompts are versioned files**, not inline strings, so a change to one shows up in a
   diff and can be bisected.
7. **No personal data in logs.** Log ids, not résumé text.

## Commits

[Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <subject in the imperative, lowercase, no trailing period>

<body: why, not what>

<footer: BREAKING CHANGE, Refs #123>
```

Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `perf`, `build`, `ci`, `revert`.
Scopes are package or module names: `core`, `web`, `mobile`, `plugins/resume-tailor`,
`supabase`, `docs`.

One logical change per commit. "wip" and "fix stuff" do not reach `main`. A commit that
changes behaviour and also reformats three files is two commits.

## Pull requests and review

Even as a single author, work goes through a PR. The PR description is where the thinking is
recorded, and it is the thing worth re-reading in six months.

A PR must say what changed, why, how it was verified, and what it deliberately leaves out.
See [`.github/PULL_REQUEST_TEMPLATE.md`](../.github/PULL_REQUEST_TEMPLATE.md).

**Review checklist**

- [ ] Does it hold the module boundaries, or does logic leak out of `core`?
- [ ] Is external and model input parsed at the boundary?
- [ ] Are new tables RLS-enabled, with a test proving isolation?
- [ ] Are model calls metered and capped?
- [ ] Do generated fields carry provenance?
- [ ] Are the documents this PR made wrong fixed in this PR?
- [ ] Does any failure mode fail loudly rather than producing a confident wrong answer?
- [ ] Is anything here a decision a future reader would reverse by accident? If so, is
      there an ADR?

Self-review counts, but it happens on the diff in the PR view, not in the editor where the
code was written. Different surface, different mistakes caught.

## Tooling

| Concern | Tool | Gate |
| --- | --- | --- |
| Format | prettier | CI |
| Lint | eslint with `@typescript-eslint`, plus import-boundary rules | CI |
| Types | `tsc --noEmit` | CI |
| Tests | vitest, Playwright | CI |
| Commit format | commitlint | pre-commit hook |
| Dependency hygiene | `npm audit`, dependabot | Weekly |

CI configuration lands with Phase 1. Until it exists, these run locally before every
commit — the standard is not conditional on the automation being built.
