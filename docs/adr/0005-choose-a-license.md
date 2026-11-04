# ADR-0005: Choose a licence

|              |                                                       |
| ------------ | ----------------------------------------------------- |
| **Status**   | **Proposed** — needs a decision before the first push |
| **Date**     | 2026-11-04                                            |
| **Deciders** | @Yihong                                               |

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

> Proposed: licence the repository under **AGPL-3.0**, keep the hosted service as the
> commercial offering, and make the repository public at the start of Phase 5 rather than
> before. Documentation under AGPL too, for simplicity, rather than splitting licences.

Not yet accepted. Until a `LICENSE` file is committed, the repository stays private and the
README states that no licence is granted.

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

**If accepted as proposed:**

**What this makes easier**

- Public readability, so the project can serve as a portfolio piece and attract discussion
- Reciprocity: a commercial host of a modified version must publish its modifications
- Contributions arrive under known terms

**What this makes harder**

- Contributors employed where AGPL is banned cannot participate
- Relicensing later requires every contributor's agreement unless a CLA is in place from
  the start
- Enterprise adoption of a self-hosted copy is less likely, which may or may not matter

**What this commits us to**

- Keeping third-party licence compatibility in mind for every dependency
- A decision about a CLA before accepting the first external contribution
- Scrubbing secrets from the entire git history before the repository goes public, not just
  from the working tree

**What to watch**

- Whether contributions ever actually arrive. If they do not, the licence's contribution
  trade-off was priced wrong and only its anti-hosting property mattered
- Any plan to sell a self-hosted enterprise version, which would mean dual licensing and
  therefore a CLA

## Open questions for the deciding conversation

1. Does the repository go public before Phase 5, as a build-in-public asset, or at launch?
2. Is the competency framework content and prompt library licensed with the code, or held
   back as the thing that is genuinely hard to copy?
3. Is a CLA worth the friction it adds at this stage?
