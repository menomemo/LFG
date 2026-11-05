# Data model

|                     |                                                                                                                                                                                 |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Status**          | Nine tables implemented: `applications`, `companies`, `jobs`, `resume_versions`, `interviews`, `contacts`, `signals`, `competencies`, `evidence`. The other six are still draft |
| **Last reviewed**   | 2026-11-05                                                                                                                                                                      |
| **Source of truth** | `supabase/migrations/` once Phase 1 lands. Until then, this document.                                                                                                           |

One Postgres database (Supabase), pgvector for embeddings. `applications` is the hub;
`evidence` is what makes the competency radar possible, because it is where practice,
interviews and insights converge.

## Conventions

These are enforced in the schema, not by discipline.

1. **Tenancy.** Every table has `user_id uuid not null references auth.users` and RLS
   enabled in the same migration that creates it. There is no "add RLS later" step —
   see [ADR-0002](adr/0002-use-supabase-as-the-primary-datastore.md).
2. **Provenance.** Any AI-written column is accompanied by `generated_by text not null`
   (plugin name and version) and a source link. A row that cannot say where it came from
   must not exist.
3. **Region.** `region` is the enum `('uk','ie','ee','jp','de','other')`, never free text.
   It drives résumé templates, reminder copy, metric slicing and visa warnings
   ([ADR-0004](adr/0004-treat-region-as-a-first-class-dimension.md)).
4. **Time.** `timestamptz` everywhere, UTC in the database, formatted per region in the UI.
   A four-market search makes naive timestamps actively dangerous.
5. **History over current state.** Stage changes append to `stage_history`; the current
   stage is derived. Metrics must never depend on a mutated field.
6. **Soft identity for externals.** Companies and contacts carry a `source` and are
   deduped on normalised domain or profile URL, never on display name.
7. **Embeddings** live in `vector` columns alongside the text they came from, with the model
   that produced them recorded, so a model change is a backfill and not a mystery.

## Tables

| Table             | Key fields                                                                                                                                                  | Related to                                        |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `companies`       | `name`, `domain`, `ats_type`, `ats_slug`, `sector`, `size`, `hq_country`, `regions`, `research_json`, `research_at`                                         | `jobs`, `contacts`, `signals`                     |
| `jobs`            | `company_id`, `title`, `jd_text`, `jd_embedding`, `skill_vector`, `source_url`, `posted_at`, `region`, `work_mode`, `visa_sponsorship`, `language_required` | `applications`                                    |
| `applications`    | `job_id`, `tier`, `stage_history`, `resume_version_id`, `next_action_at`                                                                                    | `contacts`, `interviews`                          |
| `interviews`      | `application_id`, `round`, `scheduled_at`, `notes`, `feedback`, `followup_sent_at`                                                                          | `evidence`                                        |
| `resume_versions` | `base_json`, `tailored_json`, `diff`, `pdf_url`, `region_profile`, `locale`, `generated_by`                                                                 | `applications`                                    |
| `contacts`        | `company_id`, `role_type`, `name`, `profile_url`, `source`, `last_touch_at`, `sequence_step`                                                                | `companies`, and applications through the company |
| `competencies`    | `axis`, `sub_skill`, `level_junior`, `level_mid`, `level_senior`                                                                                            | `evidence`, `cards`                               |
| `evidence`        | `competency_id`, `source_type`, `source_id`, `score`, `weight`, `observed_at`, `generated_by`                                                               | `competencies`                                    |
| `cards`           | `competency_id`, `front`, `back`, `fsrs_state`, `due_at`                                                                                                    | `review_logs`                                     |
| `review_logs`     | `card_id`, `rating`, `reviewed_at`                                                                                                                          | `cards`                                           |
| `stories`         | `title`, `star_json`, `competency_ids`                                                                                                                      | `interviews`                                      |
| `insights`        | `raw_text`, `source_url`, `summary`, `sales_dims`, `embedding`, `cluster_id`                                                                                | `drills`, `evidence`                              |
| `drills`          | `insight_id`, `scenario`, `attempts`, `last_score`                                                                                                          | `evidence`                                        |
| `signals`         | `company_id`, `type`, `payload`, `observed_at`, `severity`, `source_url`, `generated_by`                                                                    | `companies`                                       |
| `llm_usage`       | `user_id`, `task`, `model`, `tokens_in`, `tokens_out`, `cost`, `created_at`                                                                                 | cost control                                      |

## Notes on the fields that carry weight

**`applications.stage_history`** — append-only JSONB array of `{stage, at}`. Every
conversion rate, time-in-stage median, ghost determination and Sankey flow is computed from
this one column, which is why nothing is allowed to rewrite it.

There is deliberately **no `stage` column** and **no `applied_at` column**. The current stage is derived by `currentStage`
in `packages/core`; a mutable column holding the same fact would eventually disagree with
the history, and the history is what every metric is built on. The same reasoning makes
`ghosted` derived rather than stored — see
[product-spec.md](product-spec.md#module-1--application-pipeline). `applied_at` is the
timestamp of the first `applied` entry, read by `appliedAt` in `packages/core` — the first
and not the last, because someone who applies again after a rejection appends a second
entry, and a time-to-offer measured from that one quietly shortens.

**`interviews.followup_sent_at`** — a timestamp, not the boolean this document first
specified. The rule it serves is a follow-up within 24 hours of the interview, and a
boolean cannot say whether that window was met. It also keeps the sending boundary
visible: the column records that the _user_ sent something, which is the only way anything
leaves this system.

**`resume_versions.region_profile`** is its own enum, `resume_profile`, deliberately not
`region`. The mapping is neither one-to-one nor onto — one profile serves both the UK and
Ireland, and Japan needs three — so reusing `region` would make both unrepresentable.

**`jobs.visa_sponsorship`** — tri-state (`yes` / `no` / `unknown`) with its own
`generated_by` and source, because an inferred value and a value read from an official
sponsor register must never be confused. Sponsorship coverage in the risk dashboard counts
only confirmed values.

**`jobs.language_required`** — `{language, level, evidence}`. Japan and Germany make this
load-bearing rather than cosmetic; it participates in match scoring.

**`resume_versions.region_profile`** — which Typst template and content policy rendered this
version (UK/IE two-page CV with no photo, Japanese 履歴書 / 職務経歴書, and so on). The
same `base_json` renders differently per region; see [regions.md](regions.md).

**`evidence.weight` and `observed_at`** — the inputs to the time-decayed weighted average in
[product-spec.md](product-spec.md#module-4--competency-model-and-radar). Weights are
configuration, not constants in code, so they can be calibrated against real interview
outcomes.

**`evidence.source_id` carries no foreign key**, and that is a decision rather than an
omission — [ADR-0008](adr/0008-record-evidence-against-a-polymorphic-source.md) argues it.
Evidence arrives from five tables and from two sources that have no row at all (a project,
a self-assessment), so `source_type` is an enum and the source is resolved in
`packages/core`. The cost is that a policy cannot check this one reference: the isolation
suite therefore asserts what the hole can and cannot do, which is that the write is
permitted and resolves to nothing.

**`evidence.generated_by` is required for the source types a model scores**, by an
explicit check constraint naming the ones it is not required for. Adding a model-scored
source type fails loudly instead of quietly storing a number nobody can attribute.

**`companies.regions`** — a `region[]`, GIN-indexed. Which of our markets the company
hires in, a different question from `hq_country`, where it is headquartered.

**`jobs.visa_sponsorship`** — `yes` / `no` / `unknown`, with a database constraint that any
confirmed value carries a source. A value read from the UK register of licensed sponsors
and one inferred from an advert are not the same fact, and the coverage metric counts only
confirmed ones, so collapsing them would quietly inflate it.

**`jobs.language_required`** — `{language, level, evidence}`, parsed at the boundary by
`parseLanguageRequirement`. A level rather than a boolean, because "JLPT N2 required" and
"some Japanese appreciated" are different decisions about whether to apply at all.

**Cross-tenant foreign keys** — the `jobs` and `applications` insert and update policies
check that the _parent_ row belongs to the same user, not merely that the new row does.
Without that a user could own a row pointing at someone else's company or job, and the
reference itself leaks: it proves that row exists, and any join from it reads across the
tenant boundary. The isolation suite tests all three of those attacks.

**`contacts.company_id` is nullable**, and null is the normal case for part of the
search rather than a gap: an agency recruiter is most of the Japanese funnel and belongs
to no company we research. That nullability is also why the contacts policies have a
branch the others do not — a plain `exists` check on the parent would refuse the
legitimate unattached contact, which is a bug that looks like security. The isolation
suite tests both halves.

**Contacts reach applications through the company**, not through a column of their own.
One person is worth talking to about every role at their employer, so a `contacts`
column pointing at a single application would be wrong the second time you apply there,
and a join table would be a table with nothing in it but two foreign keys.

**`signals.source_url` and `signals.generated_by` are both `NOT NULL`.** Every row is
written by `signal-scanner` reading a public source, and a signal nobody can check is a
rumour. For a derived headcount change the link is the ATS board the counts were read
from. `observed_at` is when the thing happened and `created_at` is when we found out;
the gap between them is how late the scanner is running.

**`insights.cluster_id`** — assigned by embedding-similarity clustering. The same lesson
learned three times should reinforce one insight, not create three.

**`llm_usage`** — written on every model call, with no exceptions. The caching, tiering and
capping described in [architecture.md](architecture.md#cost-control) cannot be tuned
without it, so an unmetered call is a bug.

## Settled

Answered by the migrations that needed them, and kept here because each is the kind a
future reader could reverse without knowing what it cost.

| Question                                   | Answer                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Array, or one row per company per region?  | **Array.** `research_json` is the expensive cached artefact and belongs to the company, not to a company-region pair. One row per region would copy it into every market the company hires in, giving it N places to go stale and N bills to generate. Multinationals hiring across several of our markets are the normal case |
| Does `applications` keep its own `region`? | **No — read through the job.** The same reasoning that keeps the current stage out of a column: a fact stored twice eventually disagrees with itself, and every region-sliced metric in the risk dashboard reads this one                                                                                                      |
| Does `applications` store `applied_at`?    | **No — the first `applied` entry in `stage_history` is the answer.** A column would be a second copy of a fact the history already holds, and it has no answer at all for a role applied to twice after a rejection. Derived by `appliedAt` in `packages/core`                                                                 |
| When do the vector columns arrive?         | **With the first migration that generates an embedding**, in Phase 2. pgvector needs a fixed dimension to build an index, the dimension follows from the model, and the model is still unchosen. Creating them now means guessing, or shipping unindexed columns that look finished                                            |

## Open schema questions

| Question                                                                                | Decide by                           |
| --------------------------------------------------------------------------------------- | ----------------------------------- |
| Do insight clusters deserve their own table once they carry a canonical summary?        | Phase 1, when clustering first runs |
| Which embedding model, and is one shared vector space right for both JDs and insights?  | Phase 1                             |
| Is `competencies` user-scoped content or shared reference data with per-user overrides? | Phase 3                             |
