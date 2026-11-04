# ADR-0006: Use npm workspaces for the monorepo

|              |            |
| ------------ | ---------- |
| **Status**   | Accepted   |
| **Date**     | 2026-11-04 |
| **Deciders** | @Yihong    |

## Context

The repository layout in [../architecture.md](../architecture.md#repository-layout) is a
monorepo: `apps/web`, `apps/mobile`, `packages/core`, `packages/adapters`, `plugins/*`.
Those packages share TypeScript types and, more importantly, must share one implementation
of the business rules — three consumers disagreeing about a conversion rate is the failure
ADR-0003 exists to prevent.

So a workspace tool is needed in iteration zero, before any application code. The
constraints are mundane but real: one part-time developer, a laptop with Node 22 and npm
10 already present, no CI yet, and an Expo app arriving in Phase 1. React Native's
Metro bundler has a long history of trouble with symlinked `node_modules`, which is
precisely how the faster package managers achieve their disk savings.

## Decision

> We will use npm workspaces, with the package globs `apps/*`, `packages/*` and
> `plugins/*` declared in the root `package.json`. The root holds every shared dev
> dependency and the four check scripts; each package declares only what is specific to
> it. No separate task runner for now: `npm run <script> --workspaces --if-present` is the
> fan-out mechanism.

## Alternatives considered

| Option                              | What it would give us                                                      | Why not                                                                                                                                                                                                      |
| ----------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| pnpm workspaces                     | Strict dependency isolation, much less disk, the de facto monorepo default | Not installed on this machine, so it adds a corepack bootstrap step to a "clone and run" story that currently has none. Its symlinked layout is the one Metro is known to fight, and Expo arrives in Phase 1 |
| Yarn Berry with PnP                 | Fast, zero-install, strict                                                 | Largest configuration surface of the three, and the most third-party friction for React Native and Next.js                                                                                                   |
| npm workspaces plus Turborepo       | Cached, parallel task graph                                                | There is one package. Caching a 150ms test suite is negative value, and it is another config to maintain. Revisit when `apps/web` and `apps/mobile` both have real build steps                               |
| No monorepo — separate repositories | Simple tooling per repo                                                    | `core` would have to be published and versioned to be shared, turning every rule change into a release. This is the thing a monorepo is actually for                                                         |

## Consequences

**What this makes easier**

- `git clone && npm install && npm run check` works on a machine with nothing but Node
- One lockfile, one place for shared dev dependencies, one set of check scripts
- No bootstrap step in `CONTRIBUTING.md`, which matters because the project wants outside
  design critique before it has contributors

**What this makes harder**

- npm hoists, so a package can import something it never declared and get away with it
  until it is extracted. The lint boundary rules in `eslint.config.mjs` cover the cases
  this project actually cares about (`core` reaching for a framework or a database
  client), but they do not cover undeclared dependencies in general
- Installs are slower and larger on disk than pnpm's

**What this commits us to**

- Keeping the root `package.json` as the single home for shared dev dependencies
- The exit cost is genuinely low and worth stating plainly: pnpm reads the same
  `workspaces` layout, so switching is a `pnpm-workspace.yaml`, a lockfile regeneration,
  and whatever Metro complains about. This ADR can be superseded cheaply, which is why it
  was not worth more deliberation now

**What to watch**

- The first time a package imports something it did not declare and CI does not catch it
- Install or check times becoming slow enough to discourage running `npm run check`
- Phase 1's Expo work: if Metro is fine, the main argument for npm over pnpm weakens
