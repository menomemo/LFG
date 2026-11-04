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
