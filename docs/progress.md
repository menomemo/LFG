# Progress

|                                                                                            |                                                           |
| ------------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| **Updated**                                                                                | 2026-11-05                                                |
| **Phase**                                                                                  | 1 of 5 — Foundation                                       |
| **Next**                                                                                   | Finishing the board: an optimistic move and drag-to-stage |
| Where the project actually is, against the whole picture. This document is updated **every |
| time a module is finished** — see [Update protocol](#update-protocol). It is the only      |
| document that tracks state rather than intent, which is why it is separate from            |
| [roadmap.md](roadmap.md): the roadmap says what the plan is, this says where we got to.    |

## Right now

|                                                                                            |                                                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Done**                                                                                   | Documentation set · iteration zero · walking skeleton · **deployed and serving** at [letsfreakingo.netlify.app](https://letsfreakingo.netlify.app) · the full Supabase schema, fifteen tables with RLS and a 55-test isolation suite |
| **In progress**                                                                            | The application board again: the move is slow enough to notice, and a card cannot be dragged between lanes                                                                                                                           |
| **Not done**                                                                               | Dragging a card between lanes — a stage is chosen from a select and submitted. Nothing is extracted from a job advert yet                                                                                                            |
| **Blocked on a decision**                                                                  | Can the agent runtime's UI plugin host the board and radar? ([architecture.md §10](architecture.md#10-open-questions))                                                                                                               |
| **Phase 1 gate**                                                                           | Reachable for the first time, and not started: four consecutive weeks with every application in the system                                                                                                                           |
| Progress through the whole plan: **5 of 29 tracked items complete.** The board was marked  |
| complete against what had been built rather than against how the item is defined:          |
| [roadmap.md](roadmap.md) says "application board with drag-to-stage", and dragging a card  |
| was not built. It is back to in progress until it is. The board is usable in the meantime, |
| so the Phase 1 gate is still something that can be attempted.                              |

## Gantt

Weeks are estimates and shift; the gates do not. `done` is complete, `active` is in
progress, everything else is planned.

```mermaid
gantt
  title LFG — phases, modules and gates
  dateFormat YYYY-MM-DD
  axisFormat %d %b
  todayMarker stroke-width:3px,stroke:#d33,opacity:0.5

  section Phase 0 · Groundwork
  Documentation set            :done,  d0, 2026-11-04, 1d
  Iteration zero               :done,  d1, 2026-11-04, 1d

  section Phase 1 · Foundation
  Walking skeleton             :done,   p1a, 2026-11-04, 1d
  Deploy the skeleton          :done,   p1a2, after p1a, 1d
  Supabase schema and RLS      :done,   p1b, after p1a2, 4d
  Application board            :active, p1c, after p1b, 1d
  JD parsing and manual create :active, p1d, after p1c, 3d
  Insight capture              :        p1e, after p1d, 3d
  Plugin followup-writer       :        p1f, after p1e, 3d
  GATE four weeks in the system :milestone, g1, after p1f, 0d

  section Phase 2 · Precision
  Company research agent       :        p2a, after g1, 5d
  Stack inference              :        p2b, after p2a, 3d
  Resume templates per region  :        p2c, after p2b, 4d
  Resume tailoring and diff    :        p2d, after p2c, 5d
  Outreach drafting            :        p2e, after p2d, 4d
  UK sponsor register ingest   :        p2f, after p2e, 2d
  GATE five applications       :milestone, g2, after p2f, 0d

  section Phase 3 · Capability
  Competency framework content :        p3a, after g2, 6d
  Radar and evidence drill-down :       p3b, after p3a, 4d
  FSRS cards and review queue  :        p3c, after p3b, 4d
  Mock interviews with rubric  :        p3d, after p3c, 5d
  GATE radar backed by evidence :milestone, g3, after p3d, 0d

  section Phase 4 · Risk
  Portfolio metrics            :        p4a, after g3, 4d
  Signal scanning              :        p4b, after p4a, 4d
  Weekly portfolio report      :        p4c, after p4b, 3d
  Insight sparring             :        p4d, after p4c, 4d
  Sankey funnel export         :        p4e, after p4d, 3d
  GATE two reports acted on    :milestone, g4, after p4e, 0d

  section Phase 5 · Launch
  Multi-tenant hardening       :        p5a, after g4, 5d
  Billing and quotas           :        p5b, after p5a, 5d
  Legal, export, deletion      :        p5c, after p5b, 4d
  Observability and runbook    :        p5d, after p5c, 4d
  Mobile to App Store          :        p5e, after p5d, 6d
  GATE twenty external users   :milestone, g5, after p5e, 0d
```

## Whole picture

Every tracked item, so position is visible without reading the chart.
Status key: ✅ done · 🚧 in progress · 📋 planned · ⛔ blocked

| Phase | Item                          | Status | Notes                                                                                                                       |
| ----- | ----------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------- |
| 0     | Documentation set             | ✅     | 2026-11-04                                                                                                                  |
| 0     | Iteration zero                | ✅     | 2026-11-04 · workspace, lint, CI, `@lfg/core` with 36 tests                                                                 |
| 1     | Walking skeleton              | ✅     | 2026-11-04 · sign-in → RLS-protected query → `core` derivation → rendered page, locally                                     |
| 1     | Deploy the skeleton           | ✅     | 2026-11-05 · live on Netlify against production Supabase. Anonymous request redirects to sign-in; 30s from merge to serving |
| 1     | Supabase schema and RLS       | ✅     | 2026-11-05 · fifteen tables, four policies each, cross-tenant checks on every parent, 55-test isolation suite               |
| 1     | Application board             | 🚧     | 2026-11-05 · lanes, create and stage changes ship; the item is defined with drag-to-stage, which does not                   |
| 1     | JD parsing and manual create  | 🚧     | Manual create shipped with the board. What is left is extracting the fields from a pasted advert                            |
| 1     | Insight capture               | 📋     | Web paste box, then the mobile share sheet                                                                                  |
| 1     | `followup-writer` plugin      | 📋     | First plugin, with a regression test                                                                                        |
| 2     | Company research agent        | 📋     |                                                                                                                             |
| 2     | Stack inference               | 📋     |                                                                                                                             |
| 2     | Résumé templates per region   | 📋     | UK/IE and Japan first                                                                                                       |
| 2     | Résumé tailoring and diff     | 📋     |                                                                                                                             |
| 2     | Outreach drafting             | 📋     |                                                                                                                             |
| 2     | UK sponsor register ingest    | 📋     | The only market with an authoritative list                                                                                  |
| 3     | Competency framework content  | 📋     | Two axes first, then the rest                                                                                               |
| 3     | Radar and evidence drill-down | 📋     |                                                                                                                             |
| 3     | FSRS cards and review queue   | 📋     |                                                                                                                             |
| 3     | Mock interviews with rubric   | 📋     |                                                                                                                             |
| 4     | Portfolio metrics             | 📋     | HHI already implemented in `core`                                                                                           |
| 4     | Signal scanning               | 📋     |                                                                                                                             |
| 4     | Weekly portfolio report       | 📋     |                                                                                                                             |
| 4     | Insight sparring              | 📋     |                                                                                                                             |
| 4     | Sankey funnel export          | 📋     | Also the distribution channel ([launch.md](launch.md#distribution))                                                         |
| 5     | Multi-tenant hardening        | 📋     |                                                                                                                             |
| 5     | Billing and quotas            | 📋     |                                                                                                                             |
| 5     | Legal, export, deletion       | 📋     | GDPR in four jurisdictions                                                                                                  |
| 5     | Observability and runbook     | 📋     |                                                                                                                             |
| 5     | Mobile to App Store           | 📋     | Web goes public first                                                                                                       |

## Gates

A gate is passed by use, not by the feature existing. None are passed.

| Gate  | Criterion                                                        | Status |
| ----- | ---------------------------------------------------------------- | ------ |
| 1 → 2 | Four consecutive weeks with every application in the system      | 📋     |
| 2 → 3 | Five tier-A applications end to end, one with Japanese documents | 📋     |
| 3 → 4 | Every radar score traces to real evidence, no self-assessment    | 📋     |
| 4 → 5 | Two consecutive weekly reports that changed what got applied to  | 📋     |
| 5     | Twenty active users who are not the author                       | 📋     |

## Update protocol

**When a module is finished, update this document in the same pull request.** Finished
means the gate-relevant behaviour works and is tested, not that the code compiles.

1. Flip the item to ✅ in [Whole picture](#whole-picture), with the date and a one-line note
2. Add `:done,` to its Gantt task, and `:active,` to whatever starts next
3. Update **Right now** — done, in progress, blocked, and the gate line
4. Update the fraction in the sentence under **Right now**
5. Update the **Updated** date in the header
6. If the module changed the plan rather than following it, say so in
   [roadmap.md](roadmap.md) too, and write an ADR if it moved a boundary

Keep the chart honest in both directions: an item that slipped moves, and an item that
turned out unnecessary is struck rather than quietly left planned. A progress document
that only ever goes green is not being read, it is being performed.
