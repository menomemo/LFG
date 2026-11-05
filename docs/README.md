# Documentation

How to find things, and the rules that keep these documents from rotting.

## Map

| Document                               | Kind      | Answers                                            | Changes when                          |
| -------------------------------------- | --------- | -------------------------------------------------- | ------------------------------------- |
| [architecture.md](architecture.md)     | Design    | How the system is built and why                    | A structural decision lands           |
| [progress.md](progress.md)             | State     | Where the project actually is, as a Gantt chart    | A module is finished                  |
| [development.md](development.md)       | How-to    | Setup, commands, what enforces which standard      | The toolchain changes                 |
| [deployment.md](deployment.md)         | How-to    | What runs where, and how to get it there           | The hosting setup changes             |
| [product-spec.md](product-spec.md)     | Spec      | What each module does, in what order               | Scope of a module changes             |
| [data-model.md](data-model.md)         | Reference | Tables, fields, relationships, conventions         | A migration lands                     |
| [regions.md](regions.md)               | Playbook  | Per-market visas, channels, CV formats, etiquette  | A market is added or a rule changes   |
| [roadmap.md](roadmap.md)               | Plan      | Phases, gates, what "done" means                   | A phase gate is passed or re-scoped   |
| [code-standards.md](code-standards.md) | Standard  | Style, reviews, commits, tests                     | A convention is agreed or dropped     |
| [launch.md](launch.md)                 | Plan      | Shipping, compliance, distribution, growth         | Launch scope or legal surface changes |
| [learning-track.md](learning-track.md) | Plan      | The system-design and lifecycle learning goals     | A phase is finished and reflected on  |
| [adr/](adr/README.md)                  | Record    | Why a specific decision was made, and what it cost | Never — superseded, not edited        |

## The split, in one line each

- **architecture** is the current truth about structure. It is edited in place.
- **ADRs** are an append-only log of decisions. They are never rewritten; a decision that
  changes gets a new ADR that supersedes the old one.
- **product-spec** is behaviour, written so it can be checked against a running build.
- **data-model** is reference material; it should always match the migrations in
  `supabase/migrations/`.
- **progress** is the only document that records state rather than intent. The roadmap
  says what the plan is; progress says where we got to.

If you find yourself writing "we used to do X, now we do Y" in architecture.md, that
sentence belongs in an ADR instead.

## Rules

1. **Decisions get ADRs.** Anything a future reader would otherwise reverse by accident —
   a datastore, a boundary, a licence, a dependency that is hard to remove — gets a record.
   See [adr/README.md](adr/README.md) for the process and
   [adr/0000-template.md](adr/0000-template.md) for the shape.
2. **Docs change in the same pull request as the code.** A PR that makes a document wrong
   and does not fix it is not finished.
3. **Dates are absolute.** "Last quarter" and "recently" are banned; write `2026-11-04`.
4. **Claims are sourced.** External facts (visa rules, pricing, free tiers, API limits)
   carry a link and the date they were checked, because all four of those change often.
5. **No aspirational present tense.** If it does not exist yet, mark it 📋 planned. The
   status key is `✅ shipped · 🚧 in progress · 📋 planned` everywhere.
6. **English for everything** except [`../README.zh-CN.md`](../README.zh-CN.md), which is a
   translation of the top-level README and must be updated with it. CI fails a pull
   request that changes one without the other, because the pair drifted once already and
   a stale translation does not read as stale — it reads as true.

## Not here yet

These land with the phase that makes them real, and are deliberately absent until then:

| Document                     | Lands in                        |
| ---------------------------- | ------------------------------- |
| Plugin authoring guide       | Phase 1, with the second plugin |
| Competency framework content | Phase 3                         |
| Runbook and on-call notes    | Phase 5, at public launch       |
| User-facing help docs        | Phase 5                         |
