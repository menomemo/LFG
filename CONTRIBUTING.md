# Contributing

Thanks for looking. LFG is a single-author project built in public, and it is pre-alpha —
there is no runnable code yet. That changes what is useful to contribute right now.

## What helps most today

1. **Design critique.** Read [docs/architecture.md](docs/architecture.md) and the
   [ADRs](docs/adr/README.md) and tell me where the reasoning is wrong. The ADRs each end
   with a "what to watch" section; if you think one of those signals is already visible,
   that is the most valuable issue you could open.
2. **Market knowledge.** [docs/regions.md](docs/regions.md) covers the UK, Ireland,
   Estonia, Japan and Germany. If you have searched for engineering work in one of those
   markets and something there is wrong or missing, please say so — ideally with a link to
   the official source.
3. **Your own experience of the problem.** What does your job-search spreadsheet have a
   column for that this product has no field for?

Code contributions are welcome from Phase 1 onward. Until then an issue is worth more than
a pull request, because the interfaces it would touch do not exist.

## Before you open an issue

Search the existing issues first. Then pick the right template: bug report, or feature and
design proposal. For anything that would change a boundary or a dependency, say so
explicitly — it probably needs an ADR, and that conversation is better had in the issue
than in review.

## Local development

Not yet possible. Setup instructions — prerequisites, the `.env` contract, Supabase
bootstrap, seed data, how to run the tests — land here with Phase 1. See
[docs/roadmap.md](docs/roadmap.md) for timing.

## Workflow

1. Open an issue first for anything beyond an obvious fix, so the approach can be agreed
   before you spend time on it
2. Branch from `main`, named `<type>/<short-description>` — `feat/sankey-export`
3. Keep the pull request to one logical change
4. Run format, lint, types and tests locally before pushing
5. Fill in the [pull request template](.github/PULL_REQUEST_TEMPLATE.md) properly — the
   "how this was verified" and "what this deliberately leaves out" sections are the ones
   that get read
6. Update the documents your change makes wrong, in the same pull request

## Standards

Read [docs/code-standards.md](docs/code-standards.md) before writing code. The short
version:

- TypeScript strict; `any` is banned
- The baseline style is Google's TypeScript style guide; prettier and eslint decide
  formatting, and CI enforces it
- Business logic goes in `packages/core` and nowhere else
  ([ADR-0003](docs/adr/0003-keep-business-logic-in-packages-core.md))
- New tables create their RLS policies in the same migration, with a test proving isolation
- Every model call is metered and capped; model output is parsed, never trusted
- Generated content carries provenance — a résumé bullet without a `source_bullet_id` is a
  bug
- [Conventional Commits](https://www.conventionalcommits.org/):
  `feat(core): add time-decayed competency scoring`
- A new feature ships with a test or a runnable example

## Things that will be declined

Not because they are bad ideas, but because they are settled non-goals. The reasoning is in
[architecture.md](docs/architecture.md#non-goals):

- Automatic submission of applications, or sending messages on a user's behalf
- Anything that scrapes LinkedIn, automates a login, or works around bot detection
- Model fine-tuning
- A provider or model name written into business code
- A feature that produces a confident number with no traceable evidence behind it

## Conduct

By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).

## Security

Do not open a public issue for a vulnerability. See [SECURITY.md](SECURITY.md).

## Licence

The licence is not yet decided — AGPL-3.0 is proposed in
[ADR-0005](docs/adr/0005-choose-a-license.md). Until a `LICENSE` file exists, please do not
submit code contributions; design feedback and issues are unaffected. If you have an
opinion on the licence, ADR-0005 ends with the open questions and is a good place to argue.
