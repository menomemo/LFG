# ADR-0007: Enforce the Google TypeScript style with ESLint and Prettier

|              |            |
| ------------ | ---------- |
| **Status**   | Accepted   |
| **Date**     | 2026-11-04 |
| **Deciders** | @Yihong    |

## Context

[../code-standards.md](../code-standards.md) names the
[Google TypeScript Style Guide](https://google.github.io/styleguide/tsguide.html) as the
baseline, and the project's own rule is that a standard nobody enforces is a wish. Google
publishes `gts`, a package that bundles its ESLint config, its Prettier config and a CLI,
which is the most literal way to comply.

Two things complicate taking it. First, `gts` pins its own ESLint and plugin versions,
and this repository is on ESLint 10 with `typescript-eslint` 8 — the combination needed
for flat config and for type-aware linting. Second, and more important, the rules this
project most needs enforced are not in any style guide: `packages/core` must not import a
framework or a database client, must not read the environment, and must not call the
clock. Those are ADR-0003 and the reproducibility requirement on scoring, and they have to
live in the same ESLint config as everything else.

## Decision

> We will track the Google TypeScript Style Guide through our own ESLint flat config and
> Prettier configuration rather than by depending on `gts`. Prettier is configured to
> Google's settings — 80 columns, two-space indent, single quotes, no bracket spacing,
> trailing commas, arrow parentheses omitted. ESLint carries Google's naming-convention
> casing table and the correctness rules the standards document names, alongside the
> project-specific boundary rules. Every non-obvious rule carries a comment naming the
> document or ADR it comes from.

## Alternatives considered

| Option                                                | What it would give us                                      | Why not                                                                                                                                                                                 |
| ----------------------------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Depend on `gts`                                       | Literal compliance, maintained by Google, no config to own | Pins ESLint and plugin versions that conflict with flat config and type-aware linting here, and leaves the boundary rules needing a second config anyway. Two configs is worse than one |
| `eslint-config-google` only                           | The naming and style rules without the CLI                 | Predates flat config and does not cover TypeScript types; would still need the type-aware rules added by hand                                                                           |
| Just `typescript-eslint` recommended, no Google guide | Less to maintain                                           | The standards document would stop matching the tooling, and "Google style" would become a claim with nothing behind it                                                                  |
| No formatter, review comments instead                 | Nothing to configure                                       | Style arguments in review, on a solo project, with no second reviewer to have them with                                                                                                 |

## Consequences

**What this makes easier**

- Boundary rules and style rules live in one config, so there is one place to look and one
  command to run
- Rule messages cite the decision they enforce, so a future reader who hits an error is
  told why instead of being tempted to delete the rule
- Free movement on ESLint and `typescript-eslint` versions, which matters because
  type-aware linting is where the useful rules are

**What this makes harder**

- The Google guide is now tracked by hand. If it changes, nothing tells us
- Rules are a surface we own and must justify, rather than inherit
- Someone familiar with `gts` will not find the file they expect

**What this commits us to**

- Reviewing the config against the published guide at each phase boundary, and recording
  deliberate deviations in [../code-standards.md](../code-standards.md)
- Keeping Prettier as the only authority on formatting, with no stylistic ESLint rules
  fighting it
- The exit cost is low: adopting `gts` later means deleting most of one config file and
  moving the boundary rules into an override

**What to watch**

- Divergence between the config and the standards document — the document is the one that
  should win, and if it stops matching, this ADR has failed
- Any stylistic rule that starts producing disagreements with Prettier
