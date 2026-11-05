# Architecture decision records

An ADR captures one decision: the forces that led to it, what was decided, and what it
costs. The format is Michael Nygard's
([original post](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions)),
with a lifecycle borrowed from Oxide Computer's
[RFD process](https://rfd.shared.oxide.computer/rfd/0001).

The reason to keep them in a solo project is not process hygiene. It is that the expensive
mistakes are the ones where someone — including you, in four months — undoes a decision
without knowing what it was protecting against. An ADR makes that cost visible before it
is paid. Writing the consequences section honestly is also the single best preparation for
being asked to defend a design out loud; see [../learning-track.md](../learning-track.md).

## Index

| #                                                                        | Title                                                        | Status   |
| ------------------------------------------------------------------------ | ------------------------------------------------------------ | -------- |
| [0001](0001-record-architecture-decisions.md)                            | Record architecture decisions                                | Accepted |
| [0002](0002-use-supabase-as-the-primary-datastore.md)                    | Use Supabase as the primary datastore                        | Accepted |
| [0003](0003-keep-business-logic-in-packages-core.md)                     | Keep business logic in `packages/core`                       | Accepted |
| [0004](0004-treat-region-as-a-first-class-dimension.md)                  | Treat region as a first-class dimension                      | Accepted |
| [0005](0005-choose-a-license.md)                                         | Choose a licence                                             | Accepted |
| [0006](0006-use-npm-workspaces-for-the-monorepo.md)                      | Use npm workspaces for the monorepo                          | Accepted |
| [0007](0007-enforce-google-typescript-style-with-eslint-and-prettier.md) | Enforce the Google TypeScript style with ESLint and Prettier | Accepted |
| [0008](0008-record-evidence-against-a-polymorphic-source.md)             | Record evidence against a polymorphic source                 | Accepted |

## Status lifecycle

| Status                     | Meaning                                                                       |
| -------------------------- | ----------------------------------------------------------------------------- |
| **Proposed**               | Written, not yet decided. Open for argument, including from your future self. |
| **Accepted**               | Decided. The codebase is expected to reflect it.                              |
| **Superseded by ADR-NNNN** | A later decision replaced it. The record stays, unedited.                     |
| **Deprecated**             | No longer relevant — the thing it decided about is gone.                      |

## Rules

1. **Append-only.** An accepted ADR is not rewritten. A change of mind is a new ADR that
   supersedes it, and the old one gets a one-line status update pointing forward. The value
   of this log is that it preserves what you believed at the time.
2. **One decision per record.** If the title needs "and", it is two ADRs.
3. **Numbered sequentially**, four digits, filename
   `NNNN-imperative-verb-phrase.md` — `0002-use-supabase-as-the-primary-datastore.md`.
4. **Write it before implementing**, while the alternatives are still live. An ADR written
   afterwards is a justification, and it shows.
5. **Consequences include the bad ones.** A record with only upsides is not finished. The
   question it has to answer is: what will this make hard later?
6. **Short.** A page. If it needs more, the design belongs in
   [../architecture.md](../architecture.md) and the ADR links to it.

## What deserves an ADR

Anything a future reader could reverse by accident, and anything expensive to undo:
datastores and major dependencies, module boundaries, security and tenancy models, data
model decisions with migration cost, licensing and distribution, and deliberate non-goals.

Not: library choices you could swap in an afternoon, naming, formatting, or anything already
covered by [../code-standards.md](../code-standards.md).

Start from [0000-template.md](0000-template.md).
