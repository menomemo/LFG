# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
project will follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html) from its
first release. Nothing is released yet, so everything lives under Unreleased.

## [Unreleased]

### Added

- Documentation set: [architecture](docs/architecture.md),
  [product specification](docs/product-spec.md), [data model](docs/data-model.md),
  [region playbook](docs/regions.md), [roadmap](docs/roadmap.md),
  [code standards](docs/code-standards.md), [launch plan](docs/launch.md) and
  [learning track](docs/learning-track.md)
- Architecture decision records 0001–0005, with the process and template in
  [docs/adr/](docs/adr/README.md)
- Contribution, conduct and security policies
- Issue and pull request templates
- Target markets defined as the UK (home base), Ireland, Estonia and Japan in wave 1, with
  Germany in wave 2
- `region` modelled as a first-class enum that participates in résumé rendering, matching,
  reminders and risk metrics, rather than a location label
  ([ADR-0004](docs/adr/0004-treat-region-as-a-first-class-dimension.md))
- An explicit launch phase in the roadmap: public web first, App Store after

### Added — iteration zero

- npm workspace covering `apps/*`, `packages/*` and `plugins/*`
  ([ADR-0006](docs/adr/0006-use-npm-workspaces-for-the-monorepo.md))
- TypeScript in strict mode with `noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes` and `noImplicitOverride`
- ESLint and Prettier configured to the Google TypeScript style
  ([ADR-0007](docs/adr/0007-enforce-google-typescript-style-with-eslint-and-prettier.md))
- Lint rules that enforce the `packages/core` boundaries from ADR-0003: no framework, no
  database client, no environment, no clock, no I/O. Each rule's message names the
  decision it enforces
- commitlint with a `commit-msg` hook, and Conventional Commits checked in CI
- GitHub Actions running format, lint, types and tests — the same four checks, in the same
  order, as `npm run check`
- `@lfg/core` with its first two modules: the `Region` closed set with an exhaustiveness
  helper, and Herfindahl concentration for the risk dashboard. 36 tests
- [docs/development.md](docs/development.md): setup, commands, and a table mapping every
  standard to the tool that enforces it — or marking it honestly as review-only
- [docs/progress.md](docs/progress.md): a Gantt chart and status table covering all five
  phases, updated whenever a module is finished

<!--
Release entries look like:

## [0.1.0] - 2026-12-01

### Added
### Changed
### Deprecated
### Removed
### Fixed
### Security
-->
