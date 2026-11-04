# Data model

| | |
| --- | --- |
| **Status** | Draft — no migrations written yet |
| **Last reviewed** | 2026-11-04 |
| **Source of truth** | `supabase/migrations/` once Phase 1 lands. Until then, this document. |

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

| Table | Key fields | Related to |
| --- | --- | --- |
| `companies` | `name`, `domain`, `ats_type`, `ats_slug`, `sector`, `size`, `hq_country`, `regions`, `research_json`, `research_at` | `jobs`, `contacts`, `signals` |
| `jobs` | `company_id`, `title`, `jd_text`, `jd_embedding`, `skill_vector`, `source_url`, `posted_at`, `region`, `work_mode`, `visa_sponsorship`, `language_required` | `applications` |
| `applications` | `job_id`, `region`, `tier`, `stage`, `stage_history`, `resume_version_id`, `applied_at`, `next_action_at` | `contacts`, `interviews` |
| `interviews` | `application_id`, `round`, `scheduled_at`, `notes`, `feedback`, `followup_sent` | `evidence` |
| `resume_versions` | `base_json`, `tailored_json`, `diff`, `pdf_url`, `region_profile`, `locale` | `applications` |
| `contacts` | `company_id`, `role_type`, `name`, `profile_url`, `source`, `last_touch_at`, `sequence_step` | `applications` |
| `competencies` | `axis`, `sub_skill`, `level_junior`, `level_mid`, `level_senior` | `evidence`, `cards` |
| `evidence` | `competency_id`, `source_type`, `source_id`, `score`, `weight`, `observed_at` | `competencies` |
| `cards` | `competency_id`, `front`, `back`, `fsrs_state`, `due_at` | `review_logs` |
| `review_logs` | `card_id`, `rating`, `reviewed_at` | `cards` |
| `stories` | `title`, `star_json`, `competency_ids` | `interviews` |
| `insights` | `raw_text`, `source_url`, `summary`, `sales_dims`, `embedding`, `cluster_id` | `drills`, `evidence` |
| `drills` | `insight_id`, `scenario`, `attempts`, `last_score` | `evidence` |
| `signals` | `company_id`, `type`, `payload`, `observed_at`, `severity` | `companies` |
| `llm_usage` | `user_id`, `task`, `model`, `tokens_in`, `tokens_out`, `cost`, `created_at` | cost control |

## Notes on the fields that carry weight

**`applications.stage_history`** — append-only JSONB array of `{stage, at, by}`. Every
conversion rate, time-in-stage median, ghost determination and Sankey flow is computed from
this one column, which is why nothing is allowed to rewrite it.

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

**`insights.cluster_id`** — assigned by embedding-similarity clustering. The same lesson
learned three times should reinforce one insight, not create three.

**`llm_usage`** — written on every model call, with no exceptions. The caching, tiering and
capping described in [architecture.md](architecture.md#cost-control) cannot be tuned
without it, so an unmetered call is a bug.

## Open schema questions

| Question | Decide by |
| --- | --- |
| Does `companies.regions` need to be an array (multinationals hire in several of our markets) or is one row per region cleaner? | First migration |
| Do insight clusters deserve their own table once they carry a canonical summary? | Phase 1, when clustering first runs |
| Which embedding model, and is one shared vector space right for both JDs and insights? | Phase 1 |
| Is `competencies` user-scoped content or shared reference data with per-user overrides? | Phase 3 |
