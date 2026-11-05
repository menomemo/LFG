-- Competencies and evidence: the two tables the radar is computed from.
--
-- The radar is what distinguishes this product from a spreadsheet, and what
-- makes it defensible is that every score traces to something that happened.
-- That is why evidence is a table and not a number on competencies: a score
-- nobody can drill into is a self-assessment wearing a chart.

-- ---------------------------------------------------------------------------
-- Supporting enums
-- ---------------------------------------------------------------------------

-- The eight axes of docs/product-spec.md, module 4. An enum because the axes
-- are the framework: adding one changes every radar ever drawn, and that
-- should be a migration somebody has to write on purpose.
create type public.competency_axis as enum (
  'coding',
  'system_design',
  'ai_ml_engineering',
  'debugging',
  'collaboration',
  'communication',
  'product_sense',
  'sales_influence'
);

-- Where a piece of evidence came from. The weight each one carries is
-- configuration -- calibrated against real interview outcomes -- so no number
-- appears here, only the kind.
--
-- 'project' and 'self_assessment' have no row anywhere to point at, which is
-- half the reason source_id below carries no foreign key (ADR-0008).
create type public.evidence_source as enum (
  'interview_feedback',
  'mock_interview',
  'flashcard',
  'drill',
  'insight_debrief',
  'project',
  'self_assessment'
);

-- ---------------------------------------------------------------------------
-- competencies
--
-- User-scoped, as the tenancy rule requires. docs/data-model.md leaves open
-- whether this is really shared reference data with per-user overrides, and
-- that question is still open -- per-user rows are how it starts, and the
-- decision is scheduled for Phase 3 when the framework content exists to
-- decide about.
-- ---------------------------------------------------------------------------
create table public.competencies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,

  axis public.competency_axis not null,
  sub_skill text not null check (length(trim(sub_skill)) > 0),

  -- Observable behaviours, not adjectives: "can design and ship a service
  -- with caching and a documented degradation path", never "strong at
  -- system design". All three are NOT NULL because a ladder with a missing
  -- rung cannot place anybody.
  level_junior text not null check (length(trim(level_junior)) > 0),
  level_mid text not null check (length(trim(level_mid)) > 0),
  level_senior text not null check (length(trim(level_senior)) > 0),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.competencies is
  'One sub-skill of one axis, with a behaviour described at each level.';

-- One row per sub-skill per axis per user.
create unique index competencies_user_id_axis_sub_skill_key
  on public.competencies (user_id, axis, sub_skill);

create trigger competencies_set_updated_at
  before update on public.competencies
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- evidence
-- ---------------------------------------------------------------------------
create table public.evidence (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  competency_id uuid not null
    references public.competencies (id) on delete cascade,

  source_type public.evidence_source not null,

  -- No foreign key, deliberately, and the argument is written up in
  -- ADR-0008: the source is one of five tables or of none, and resolution
  -- happens in packages/core keyed on source_type. Nullable because a
  -- project and a self-assessment have no row to point at.
  source_id uuid,

  -- Normalised to [0, 1] at the boundary, so one scale serves a rubric score,
  -- a flashcard rating and a human judgement. The bounds are a definition,
  -- not a threshold -- what counts as a good score is configuration.
  score numeric not null check (score >= 0 and score <= 1),

  -- The weight that was applied, supplied by the boundary from configuration
  -- keyed on source_type. Stored rather than looked up at read time for the
  -- same reason the embedding model is recorded next to the embedding: when
  -- the weights are recalibrated, the change is a visible backfill rather
  -- than every historical score silently moving.
  weight numeric not null check (weight > 0 and weight <= 1),

  -- When the evidence was observed, not when it was entered. The scoring
  -- function decays on this, so the two being confused would make a year-old
  -- signal entered today outrank last week's.
  observed_at timestamptz not null,

  -- Provenance for the source types where a model produced the score. The
  -- list is explicit rather than inferred, so adding a model-scored source
  -- type fails loudly here instead of quietly storing an unattributable
  -- number.
  generated_by text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint evidence_model_scored_has_provenance check (
    source_type in ('interview_feedback', 'project', 'self_assessment')
    or generated_by is not null
  )
);

comment on table public.evidence is
  'One observation about one sub-skill. Append-mostly: this is the history the radar is built on.';
comment on column public.evidence.source_id is
  'The row this came from, resolved in packages/core. No foreign key: see ADR-0008.';
comment on column public.evidence.weight is
  'The weight applied, from configuration. Recalibration is a backfill, not a silent re-read.';

-- The radar query: all of a user's evidence for one competency, most recent
-- first, because the decay makes recent evidence the expensive part to miss.
create index evidence_user_id_competency_id_observed_at_idx
  on public.evidence (user_id, competency_id, observed_at desc);

-- The drill-down in the other direction: what evidence came out of this
-- interview, this drill, this review.
create index evidence_user_id_source_idx
  on public.evidence (user_id, source_type, source_id)
  where source_id is not null;

create trigger evidence_set_updated_at
  before update on public.evidence
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row-level security, in the same migration that creates the tables
-- ---------------------------------------------------------------------------
alter table public.competencies enable row level security;
alter table public.competencies force row level security;

create policy "Users read their own competencies"
  on public.competencies for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users create their own competencies"
  on public.competencies for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users update their own competencies"
  on public.competencies for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users delete their own competencies"
  on public.competencies for delete to authenticated
  using ((select auth.uid()) = user_id);

alter table public.evidence enable row level security;
alter table public.evidence force row level security;

create policy "Users read their own evidence"
  on public.evidence for select to authenticated
  using ((select auth.uid()) = user_id);

-- competency_id is checked like every other parent. source_id is not and
-- cannot be -- it is not a foreign key, and the database does not know which
-- table it would point into. What that does and does not expose is argued in
-- ADR-0008 and asserted in the isolation suite.
create policy "Users create their own evidence"
  on public.evidence for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.competencies c
      where c.id = competency_id and c.user_id = (select auth.uid())
    )
  );

create policy "Users update their own evidence"
  on public.evidence for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.competencies c
      where c.id = competency_id and c.user_id = (select auth.uid())
    )
  );

create policy "Users delete their own evidence"
  on public.evidence for delete to authenticated
  using ((select auth.uid()) = user_id);
