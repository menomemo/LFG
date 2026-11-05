# CLAUDE.md

Working notes for Claude Code in this repository. Read the linked document before working
in the area it covers — do not reconstruct a decision from the code.

## What this is

**LFG** runs a cross-border job search like a managed portfolio: application pipeline,
company intelligence, evidence-driven competency radar, practice loops, and an insight
library that turns things the user learns into interview reps.

First user: the author, based in the **United Kingdom**, targeting SDE / AI Engineer roles
at graduate and junior level in the **UK, Ireland, Estonia and Japan** (wave 1), with
**Germany** in wave 2. Built for one user, multi-tenant from the first migration.

Three goals in a fixed order: it works for its author → it is publicly available (web
first, App Store after) → it reaches people. Plus an explicit learning goal — real
system-design practice and the full development lifecycle, tracked in
[docs/learning-track.md](docs/learning-track.md).

## Current state

**Always read [docs/progress.md](docs/progress.md) first.** It is the one document that
records where the project actually is, and it is more current than this section.

- **Phase 1 · Foundation.** Iteration zero is done: npm workspace, strict TypeScript,
  Google-style lint and format, the ADR-0003 boundary rules, commitlint, CI, and
  `@lfg/core` with its first tested modules. No user-facing code yet.
- Next: the walking skeleton — one table with RLS and its isolation test, one `core`
  function, one page, deployed. No features.
- Phase 1 scope: Supabase foundation, application board, insight capture with tagging, the
  agent runtime running against a local model, and `followup-writer` as the first plugin.
- Gate to Phase 2: four consecutive weeks with every application in the system.
- Update this section when a phase gate is passed, and [docs/roadmap.md](docs/roadmap.md)
  with it.

## Finishing a module

**Every time a module is finished, update [docs/progress.md](docs/progress.md) in the same
pull request** — the Gantt chart, the status table, the "Right now" block and the date. The
protocol is at the bottom of that file. The point is that the whole picture stays visible:
which of the 24 tracked items are done, which phase we are in, and which gate is still
open. A module is finished when its gate-relevant behaviour works and is tested, not when
it compiles.

Keep it honest in both directions. An item that slipped moves; an item that turned out
unnecessary is struck, not left quietly planned.

## Commands

| Command                                                                 | Does                                                                            |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `npm run check`                                                         | Format, lint, types, tests — what CI runs, in CI's order. Run before committing |
| `npm run format:fix`                                                    | Prettier writes, Markdown included                                              |
| `npm run lint`                                                          | ESLint, including the `packages/core` boundary rules                            |
| `npm run typecheck`                                                     | `tsc --noEmit` across every workspace                                           |
| `npm run test`                                                          | Vitest once; `test:watch` to watch                                              |
| `npm run test:db`                                                       | Row-level security isolation, needs `npm run db:start` first                    |
| `npm run db:reset`                                                      | Re-apply every migration and re-seed                                            |
| `npm run db:types`                                                      | Regenerate the committed `supabase/database.types.ts` after a migration         |
| Setup, and the table of which standard is enforced by which tool, is in |
| [docs/development.md](docs/development.md).                             |

## Documentation map

| Need                             | Document                                         |
| -------------------------------- | ------------------------------------------------ |
| Structure and why it is that way | [docs/architecture.md](docs/architecture.md)     |
| What a module should do          | [docs/product-spec.md](docs/product-spec.md)     |
| Tables, fields, conventions      | [docs/data-model.md](docs/data-model.md)         |
| Market rules, visas, CV formats  | [docs/regions.md](docs/regions.md)               |
| Phases and gates                 | [docs/roadmap.md](docs/roadmap.md)               |
| Where the project actually is    | [docs/progress.md](docs/progress.md)             |
| Setup and commands               | [docs/development.md](docs/development.md)       |
| Deploying, and what runs where   | [docs/deployment.md](docs/deployment.md)         |
| Style, tests, commits, review    | [docs/code-standards.md](docs/code-standards.md) |
| Why a decision was made          | [docs/adr/](docs/adr/README.md)                  |
| Shipping, compliance, growth     | [docs/launch.md](docs/launch.md)                 |

Documentation rules, including the ADR-versus-architecture split, are in
[docs/README.md](docs/README.md).

## Rules that are not negotiable

These exist because they are the project's actual failure modes. Breaking one is a bug even
if it passes review.

1. **Business logic only in `packages/core`.** It imports no framework, no agent runtime, no
   Supabase client, no `process.env`, and takes the clock as an argument. Plugins translate
   parameters and call `core`. If a behaviour deserves a unit test, it belongs in `core`
   ([ADR-0003](docs/adr/0003-keep-business-logic-in-packages-core.md)).
2. **RLS in the creating migration.** Every table has `user_id`, RLS enabled, policies
   defined, and a test proving one user cannot read another's rows. Never a follow-up
   migration. Never the service key from a surface.
3. **Provenance is a `NOT NULL` column.** AI-written fields carry `generated_by` and a
   source. Résumé rewrites may reorder and re-emphasise, never add facts, and every output
   line carries `source_bullet_id`.
4. **Meter and cap every model call.** `llm_usage` on every call; a declared daily ceiling
   and max step count per plugin. No provider or model name in business code — backends are
   configuration.
5. **Parse, never trust, model output.** Schema-validate it; on failure retry once with the
   error, then fail visibly. Never fall back to unvalidated prose.
6. **`region` is an enum**, and region-dependent policy lives in one module in `core`. No
   threshold, salary figure or quota in code or prose — those go in configuration with a
   `checked_on` date ([ADR-0004](docs/adr/0004-treat-region-as-a-first-class-dimension.md)).
7. **No scraping, no autonomous sending.** Public APIs and user input only. The product
   drafts and prepares; a human sends and submits. There must be no code path that can do
   otherwise.
8. **Unknown is not zero.** Missing evidence reads "unknown" all the way to the UI. Prefer
   a visible gap over a confident guess.

## Conventions

- TypeScript strict; `any` banned; Google TypeScript style as the baseline
- Conventional Commits, scoped to a package: `feat(core): …`, `docs(regions): …`
- Monorepo: `apps/web`, `apps/mobile`, `packages/core`, `packages/adapters`,
  `plugins/<name>`, `supabase/`, `docs/`
- The agent runtime is a pinned developer-preview dependency; every plugin carries a
  regression test so an upgrade fails loudly
- Prompts are versioned files, not inline strings
- Secrets in `.env.local` only, never committed
- Dates in documents are absolute (`2026-11-04`), external claims carry a link and a
  checked date
- Documentation is English; `README.zh-CN.md` is the one translation and is updated with
  `README.md`

## Working style here

- A decision a future reader could reverse by accident gets an ADR, written **before** the
  implementation. Use [docs/adr/0000-template.md](docs/adr/0000-template.md); its
  consequences section must include what the decision makes harder.
- A pull request that makes a document wrong and does not fix it is not finished.
- Nothing is marked shipped in a document until it is actually usable. The status key is
  `✅ shipped · 🚧 in progress · 📋 planned`.
- When scope has to be cut, cut it explicitly and write down what was cut and why — in
  [docs/roadmap.md](docs/roadmap.md) if it changes a phase, in an ADR if it changes a
  boundary.
