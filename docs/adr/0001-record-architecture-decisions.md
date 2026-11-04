# ADR-0001: Record architecture decisions

|              |            |
| ------------ | ---------- |
| **Status**   | Accepted   |
| **Date**     | 2026-11-04 |
| **Deciders** | @Yihong    |

## Context

This is a single-author project with a multi-month horizon, built in evenings and weekends.
That combination produces a specific failure: a decision made carefully in week 2 gets
quietly undone in week 14, because the reasoning existed only in the author's head and the
head has moved on. The code shows what was done, never what was rejected.

Two other forces point the same way. The project depends on an agent runtime in developer
preview, so some decisions exist specifically to contain churn, and their purpose has to be
legible or the containment will be removed as "unnecessary indirection". And an explicit
goal of the project is learning to design systems, not merely to build one — which requires
the reasoning to be written down somewhere it can be reread and judged.

## Decision

> We will record every significant architectural decision as a numbered, append-only
> Architecture Decision Record in `docs/adr/`, using Michael Nygard's format with the
> status lifecycle described in [README.md](README.md). ADRs are written before
> implementation, and a decision that changes gets a new ADR superseding the old one rather
> than an edit.

## Alternatives considered

| Option                                               | What it would give us    | Why not                                                                                                                                              |
| ---------------------------------------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nothing — rely on commit messages and the design doc | No overhead              | Commits record what changed, not what was rejected; a design doc edited in place loses history exactly when it matters                               |
| Keep the reasoning inline in `architecture.md`       | One file to read         | It becomes a changelog interleaved with a specification, and neither reads well. The "we used to do X" sentences are the tell                        |
| A full RFD process with a branch and PR per proposal | Strong review discipline | Built for a team reaching consensus; with one author the ceremony costs more than it returns. The useful part is the status lifecycle, which we took |
| A decision log in an external tool                   | Nicer to write           | Separates the reasoning from the code it governs, and goes stale the moment the tool is not opened                                                   |

## Consequences

**What this makes easier**

- A future reader, including the author, can see what a boundary was protecting against
  before removing it
- Design thinking becomes a reviewable artefact — directly useful for interviews, where the
  skill being tested is defending a decision with its costs
- Onboarding a contributor, if the project becomes public, costs a read rather than a
  conversation

**What this makes harder**

- Every significant decision now has a writing step before the coding step
- There is a real temptation to write ADRs for trivia, which would dilute the log until
  nobody reads it

**What this commits us to**

- Keeping the index in `docs/adr/README.md` current
- Never editing an accepted ADR's substance. The exit cost is low: stopping is just not
  writing more, and existing records stay useful as history

**What to watch**

- If ADRs start being written after the implementation, the practice has already failed and
  the records have become justifications. Ten records in and none of them ever having
  changed a decision is the same signal.
