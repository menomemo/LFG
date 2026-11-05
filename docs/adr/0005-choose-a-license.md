# ADR-0005: Choose a licence

|              |            |
| ------------ | ---------- |
| **Status**   | Accepted   |
| **Date**     | 2026-11-05 |
| **Deciders** | @Yihong    |

## Context

The repository has no `LICENSE` file, which means that if it were pushed public today, no
rights would be granted to anyone — default copyright, all rights reserved. That is a
defensible state, but it should be a choice rather than an oversight.

Three project goals pull on this decision at once:

1. **It ships as a hosted product.** We run the inference and pay for it, so the hosted
   service is the commercial surface.
2. **It should have influence.** Being readable, forkable and discussable is a large part of
   how a project like this gets attention, and the documentation set is arguably more
   interesting to other engineers than the code.
3. **It is a portfolio artefact.** A public repository that a hiring manager can read is
   worth a great deal during a job search — which is the author's actual situation.

Against that: a permissive licence lets a better-resourced operator host the same product,
and the differentiating assets here are partly not code at all — the competency framework
content, the prompt library, the region playbook.

## Decision

> We will licence the repository, code and documentation alike, under the **MIT licence**.

AGPL-3.0 was proposed first and rejected on the decider's own reading of the project: there
is nothing here worth defending from a competing host. AGPL's share-alike obligation buys
protection against someone running a modified copy as a service, and that protection is
only worth its costs when the code is the moat. Here it is not — the parts that would be
hard to copy are the competency framework content, the prompt library and the region
playbook, and none of them is a licence problem. Paying AGPL's costs (contributors whose
employers forbid it, a CLA needed before any relicensing) to protect something that does
not need protecting is a bad trade.

MIT is also the licence that best serves the goals that are real today: being readable,
being a portfolio artefact, and being easy for anyone to learn from.

## Alternatives considered

| Option                                         | What it would give us                                                                                                                                                                             | Why not                                                                                                                                                                        |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **AGPL-3.0** (proposed)                        | Source-available, forkable, readable; network use triggers the share-alike obligation, so a competing host must publish modifications. The common choice for open products with a hosted business | Some companies forbid employees contributing to AGPL code, which narrows contribution; dual licensing later needs a CLA                                                        |
| MIT / Apache-2.0                               | Maximum adoption and contribution; easiest for anyone to reuse                                                                                                                                    | Anyone can host it commercially with no reciprocity, which is the one scenario the hosted model cannot absorb                                                                  |
| Business Source License                        | Protects the hosted business while the source stays visible; converts to open later                                                                                                               | Not an OSI-approved open-source licence, so it attracts criticism and loses some of the goodwill that is the point of being public                                             |
| Proprietary, repository stays private          | Nothing to decide, no exposure                                                                                                                                                                    | Forfeits the portfolio value and the distribution that comes from being readable — two of the three goals                                                                      |
| Keep the code private and publish only `docs/` | Portfolio value, no code exposure                                                                                                                                                                 | Plausible and worth real consideration: the documentation is the part most likely to be read and shared. Rejected as the primary plan only because the code is the credibility |
| Defer the decision                             | No commitment today                                                                                                                                                                               | Only safe while the repository is private. It becomes urgent the moment it is pushed, which is why this ADR exists now                                                         |

## Consequences

**What this makes easier**

- Anyone can read, run, fork and learn from the project, which is most of its value today
- No licence friction for contributors, whatever their employer's policy
- Dependency compatibility stops being a question: MIT is compatible with essentially
  everything

**What this makes harder**

- Nothing stops a better-resourced operator hosting this as a competing service, modified
  or not, with no obligation to publish anything
- If the hosted business ever becomes real, the licence cannot be the thing that defends
  it. The defence has to be the hosted product itself — the data a user accumulates, the
  operational quality, the content assets

**What this commits us to**

- Scrubbing secrets from the entire git history before the repository goes public, not
  just from the working tree
- Accepting that the code is a commodity and the moat, if there is one, is elsewhere
- Relicensing later would need every contributor's agreement, as with any licence. While
  the project has one author this costs nothing; it starts costing the moment someone else
  contributes

**What to watch**

- Someone actually hosting a copy. The honest prediction is that nobody will before the
  product is good enough to be worth copying, and by then this ADR can be superseded for
  future versions — though already-published versions stay MIT forever

## Still open, and deliberately not decided here

1. **When the repository goes public** — before Phase 5 as a build-in-public asset, or at
   launch. The licence does not force this; a repository can be MIT and private.
2. **Whether the content assets stay in this repository.** The competency framework and the
   prompt library are the parts that are genuinely hard to reproduce. Keeping them here
   means publishing them under MIT too. That is a question about where they live, not about
   the licence, and it can wait until Phase 3 when the framework exists.
