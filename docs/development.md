# Development

|                   |                                  |
| ----------------- | -------------------------------- |
| **Status**        | Active — iteration zero complete |
| **Last reviewed** | 2026-11-04                       |

How to work in this repository: what to install, what to run, and what enforces the
standards. The rules themselves are in [code-standards.md](code-standards.md); this
document is the mechanics.

## Prerequisites

| Tool    | Version                           | Why that version                                                                                                        |
| ------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Node.js | ≥ 22.12 (`.nvmrc` pins the major) | Vitest 5 requires 22.12 or newer                                                                                        |
| npm     | ≥ 10                              | Ships with Node 22; workspaces are the monorepo mechanism ([ADR-0006](adr/0006-use-npm-workspaces-for-the-monorepo.md)) |
| git     | any current                       | —                                                                                                                       |
| Docker  | any current, **running**          | The local Supabase stack runs in containers                                                                             |

Docker must actually be running, not merely installed. `supabase start` fails with a
health-check timeout otherwise, and the message does not say so plainly.

Nothing else yet. Supabase CLI, a local model runtime and the agent runtime arrive with
the walking skeleton; see [What is not set up yet](#what-is-not-set-up-yet).

## First time

```bash
git clone git@github.com:menomemo/LFG.git
cd LFG
nvm use          # optional; reads .nvmrc
npm install      # also installs the git hooks, via the prepare script
npm run check    # should be green on a fresh clone

npm run db:start                      # local Supabase; first run pulls images
npx supabase status -o env            # prints API_URL, ANON_KEY and the rest
cp .env.example .env.local            # then fill in from that output:
                                      #   SUPABASE_URL      <- API_URL
                                      #   SUPABASE_ANON_KEY <- ANON_KEY
npm run test:db                       # row-level security isolation, 9 tests
npm run dev -w @lfg/web               # http://localhost:3000
```

Sign in with a seeded account: `alice@lfg.test` / `lfg-dev-password`. Alice has four
applications; Bob has one that Alice must never see, which is what the isolation suite
checks.

`npm run check` passing on a clean clone is the contract. If it fails on a fresh clone,
that is a bug in the repository, not in your machine — please open an issue.

`.env.local` is not needed for the checks above; it matters once there is an app. Every
variable is documented in `.env.example`, including which keys must never reach a browser
bundle.

## Daily commands

| Command                        | Does                                                                         |
| ------------------------------ | ---------------------------------------------------------------------------- |
| `npm run check`                | Format, lint, types, tests — in that order. Run before every commit          |
| `npm run format`               | Prettier in check mode                                                       |
| `npm run format:fix`           | Prettier writes. Also formats Markdown                                       |
| `npm run lint`                 | ESLint, including the boundary rules                                         |
| `npm run lint:fix`             | ESLint with `--fix`                                                          |
| `npm run typecheck`            | `tsc --noEmit` across every workspace that has the script                    |
| `npm run test`                 | Vitest, once                                                                 |
| `npm run test:watch`           | Vitest, watching                                                             |
| `npm run test:db`              | Row-level security isolation, against a running local stack                  |
| `npm run db:start` / `db:stop` | The local Supabase containers                                                |
| `npm run db:reset`             | Drop, re-apply every migration, re-seed. The fastest way to test a migration |
| `npm run db:types`             | Regenerate `supabase/database.types.ts`. Run after every migration           |
| `npm run dev -w @lfg/web`      | The web app on port 3000                                                     |

**CI runs exactly these four, in this order, from
[`.github/workflows/ci.yml`](../.github/workflows/ci.yml).** That is deliberate: a green
local run should mean a green pipeline. If the two ever diverge, the local command is the
one to fix, because that is the one a person actually runs.

## Layout

```
apps/web/          Next.js web client                    (Phase 1)
apps/mobile/       Expo app                              (Phase 1, capture flow)
packages/core/     Business rules. No framework, no I/O, no clock.
packages/adapters/ Agent-runtime adapter layer           (Phase 1)
plugins/<name>/    One directory per plugin, with its own regression tests
supabase/          Migrations, seed data, RLS policies   (Phase 1)
docs/              This documentation
```

Only `packages/core` exists today. The workspace globs already cover the rest, so adding
one is creating the directory with a `package.json`.

### Adding a package

1. `mkdir -p packages/<name>` with a `package.json` named `@lfg/<name>`, `"private": true`
2. A `tsconfig.json` extending `../../tsconfig.base.json`
3. A `typecheck` script — the root `typecheck` fans out with `--if-present`, so a package
   without one is silently skipped, which is worse than an error
4. `npm install` from the root to link it
5. If it needs an import boundary, add it to `eslint.config.mjs` with a comment naming the
   ADR it enforces

## What enforces what

Every standard in [code-standards.md](code-standards.md) is either machine-checked or
honestly marked as a review item. This table is the map, and it is the answer to "is this
rule real or aspirational?".

| Rule                                  | Enforced by                                                     | Source                                                                           |
| ------------------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Formatting                            | `.prettierrc.json`, Google's settings                           | [ADR-0007](adr/0007-enforce-google-typescript-style-with-eslint-and-prettier.md) |
| Strict types, four extra flags        | `tsconfig.base.json`                                            | code-standards.md                                                                |
| `any` is banned                       | `@typescript-eslint/no-explicit-any`                            | code-standards.md                                                                |
| Google naming casing                  | `@typescript-eslint/naming-convention`                          | code-standards.md#naming                                                         |
| No floating promises                  | `no-floating-promises`, `no-misused-promises`                   | code-standards.md                                                                |
| Throw `Error` subclasses only         | `only-throw-error`                                              | code-standards.md                                                                |
| `core` imports no framework           | `no-restricted-imports` in the `packages/core` block            | [ADR-0003](adr/0003-keep-business-logic-in-packages-core.md)                     |
| `core` imports no database client     | same                                                            | ADR-0003                                                                         |
| `core` reads no environment           | `no-restricted-globals` on `process`                            | ADR-0003                                                                         |
| The clock is an argument              | `no-restricted-syntax` on `new Date` and `Date.now`             | code-standards.md                                                                |
| `core` performs no I/O                | `no-restricted-syntax` on `fetch`                               | ADR-0003                                                                         |
| No non-null assertions in `core`      | `no-non-null-assertion`                                         | code-standards.md                                                                |
| Conventional Commits                  | commitlint, via the `commit-msg` hook and in CI                 | code-standards.md#commits                                                        |
| Tests avoid the network and the clock | Convention plus the `core` rules; **not** fully machine-checked | code-standards.md#tests                                                          |
| RLS actually isolates tenants         | `npm run test:db`, and the `database` job in CI                 | [ADR-0002](adr/0002-use-supabase-as-the-primary-datastore.md)                    |
| Generated types match the migrations  | CI regenerates them and fails on a diff                         | code-standards.md                                                                |
| Model calls metered and capped        | **Review only** until there are model calls                     | code-standards.md                                                                |
| Provenance columns                    | Will be `NOT NULL` in the schema                                | data-model.md                                                                    |

The boundary rules were verified by writing a file that violates each one and confirming
ESLint rejects it with the message naming the ADR. A rule that has never been seen to fail
is not known to work.

## Git hooks

`npm install` runs `prepare`, which installs Husky. One hook today:

- `commit-msg` — runs commitlint, so a malformed commit message is rejected locally rather
  than in CI

Hooks are a convenience, not the enforcement; CI is the enforcement. `--no-verify` exists
and is sometimes right, but the commit will fail in CI.

## Dependency notes

- **`overrides.minimatch`** in the root `package.json` forces the patched major. ESLint and
  `typescript-eslint` both depend on `minimatch@^10`, which has a known ReDoS advisory;
  version 11 is API-compatible for their usage, and `npm audit` reports zero
  vulnerabilities with the override in place. Remove it once both packages move to 11 on
  their own.
- **TypeScript stays on 5.9**, not 7.x: `typescript-eslint@8` declares a peer range of
  `>=4.8.4 <6.1.0`, so type-aware linting breaks above it. Revisit when
  `typescript-eslint` supports TypeScript 7.
- **No task runner.** Deliberate; see ADR-0006.
- **Local analytics is disabled** in `supabase/config.toml`. The Logflare container fails
  its health check on this setup and takes the whole stack down with it; nothing in
  development reads it. Re-enable it if you ever need local log search.
- **`supabase/database.types.ts` is generated and committed.** Never hand-edit it. It
  lives beside the migrations rather than inside `apps/web` because the web app and the
  isolation suite both consume it.

## What is not set up yet

Honest list, so nothing here reads as working when it is not.

| Missing                                                           | Lands with                                                 |
| ----------------------------------------------------------------- | ---------------------------------------------------------- |
| Parsing a pasted job advert into the create form                  | Phase 1, with `jd-parser`                                  |
| Dragging a card between lanes — the stage is chosen from a select | Phase 1                                                    |
| Agent runtime, plugin scaffolding, model backends                 | Phase 1, with `followup-writer`                            |
| Coverage thresholds in CI                                         | When there is enough code for a threshold to mean anything |
| Error tracking, uptime, cost dashboard                            | Phase 5 ([launch.md](launch.md))                           |

The board is built, deployed and in use; what is listed above is what it still cannot do.
See [roadmap.md](roadmap.md#phase-1--foundation--weeks-13).
