-- Résumé versions and interviews: the two tables module 1 still needs, plus
-- the three columns on applications that were waiting for them.
--
-- docs/data-model.md lists applications as carrying `tier`, `resume_version_id`,
-- `applied_at` and `next_action_at`. Three of those four arrive here. The
-- fourth does not, and that is the decision worth reading:
--
--   applied_at is NOT a column. It is the timestamp of the first 'applied'
--   entry in stage_history, derived by firstEnteredStageAt in packages/core.
--   The same reasoning that keeps `stage` and `region` out of this table
--   applies: a fact stored twice eventually disagrees with itself, and this
--   one is an input to every conversion rate in the risk dashboard. A stored
--   applied_at also has no answer for an application that was re-applied to
--   after a rejection, which is a real thing people do.

-- ---------------------------------------------------------------------------
-- Supporting enums
-- ---------------------------------------------------------------------------

-- Which artefact and content policy rendered a version, from the "Résumé
-- artefact" row of docs/regions.md.
--
-- Deliberately NOT the region enum. The mapping is neither one-to-one nor
-- onto: one profile serves two markets (a UK and an Irish CV are the same
-- document, which is why those markets are built together), and one market
-- needs three (a Japanese domestic employer expects 履歴書 plus 職務経歴書,
-- while an English-first employer in Tokyo accepts a normal CV). Reusing
-- region here would make both of those unrepresentable.
create type public.resume_profile as enum (
  'uk_ie_cv',
  'eu_cv',
  'jp_rirekisho',
  'jp_shokumu_keirekisho',
  'jp_english_cv',
  'de_lebenslauf'
);

-- Effort tiers from docs/product-spec.md, module 7. A tier is a position size:
-- it decides how much of the user's own time an application gets, and each
-- tier carries its own conversion rate. The target shares and the cap on
-- tier-A applications in flight are configuration, not constraints here.
create type public.effort_tier as enum ('a', 'b', 'c');

-- ---------------------------------------------------------------------------
-- resume_versions
-- ---------------------------------------------------------------------------
create table public.resume_versions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,

  -- JSON Resume schema, every bullet carrying a stable id. The master résumé
  -- is a base_json with no tailoring on top of it.
  base_json jsonb not null check (jsonb_typeof(base_json) = 'object'),

  -- The rewritten version. May reorder and re-emphasise, may not add facts,
  -- and every output line carries source_bullet_id -- validated where the
  -- schema is parsed, in the resume-tailor plugin, because the shape is JSON
  -- Resume and not something a check constraint can see into.
  tailored_json jsonb check (
    tailored_json is null or jsonb_typeof(tailored_json) = 'object'
  ),

  -- Per-bullet changes, which the user accepts one at a time. An array
  -- because the order the diff is reviewed in is the order it is presented in.
  diff jsonb check (diff is null or jsonb_typeof(diff) = 'array'),

  region_profile public.resume_profile not null,

  -- BCP 47, narrowed to what the templates actually render: a language, with
  -- an optional region for the cases that need it (en-GB and en-US differ in
  -- spelling, and a CV with the wrong one reads as a copy-paste).
  locale text not null check (locale ~ '^[a-z]{2}(-[A-Z]{2})?$'),

  pdf_url text,

  -- Provenance, structural rather than conventional: a tailored résumé that
  -- cannot say which plugin version rewrote it must not exist.
  generated_by text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint resume_versions_tailoring_has_provenance check (
    (tailored_json is null) = (generated_by is null)
  ),
  -- A rewrite the user cannot review bullet by bullet is a rewrite that gets
  -- accepted wholesale, which is how a fabricated fact reaches an employer.
  constraint resume_versions_tailoring_has_diff check (
    (tailored_json is null) = (diff is null)
  )
);

comment on table public.resume_versions is
  'One rendered résumé. base_json is the master; tailored_json is grounded in it, never beyond it.';
comment on column public.resume_versions.region_profile is
  'Which artefact and content policy rendered this. Not a region: see docs/regions.md.';

-- The UI lists a user's versions newest first.
create index resume_versions_user_id_created_at_idx
  on public.resume_versions (user_id, created_at desc);

create trigger resume_versions_set_updated_at
  before update on public.resume_versions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- applications: tier, the résumé that was sent, and the next action
-- ---------------------------------------------------------------------------
alter table public.applications
  -- Nullable, and null means unknown rather than tier C. The AI proposes a
  -- tier from match score and stated interest and the user can override it;
  -- until one of those has happened the application has no tier, and reading
  -- that as "exploratory" would understate how much work is in flight.
  add column tier public.effort_tier,

  -- on delete restrict: deleting a résumé version that an application was
  -- sent with destroys the per-version conversion rate, and that loss is
  -- not noticeable later. Nullable because a saved application has not been
  -- sent anything yet.
  add column resume_version_id uuid
    references public.resume_versions (id) on delete restrict,

  add column next_action_at timestamptz;

comment on column public.applications.tier is
  'Effort tier. Null is unknown, not tier C.';
comment on column public.applications.resume_version_id is
  'The version actually sent. Null until something was.';

-- The reminder query: what needs doing, soonest first, for this user.
create index applications_user_id_next_action_at_idx
  on public.applications (user_id, next_action_at)
  where next_action_at is not null;

-- ---------------------------------------------------------------------------
-- interviews
-- ---------------------------------------------------------------------------
create table public.interviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  application_id uuid not null
    references public.applications (id) on delete cascade,

  -- on delete cascade, unlike every other foreign key here: an interview is
  -- a detail of an application and means nothing without it, so it is the one
  -- place where following the parent out is right.

  round smallint not null check (round >= 1),
  scheduled_at timestamptz not null,

  -- Both written by the user, not by a model, so neither carries provenance.
  -- The drafted thank-you note is the followup-writer plugin's output and
  -- arrives with that plugin, with its own generated_by.
  notes text,
  feedback text,

  -- A timestamp, where docs/data-model.md said a boolean. The rule it serves
  -- is "follow-up 24h after an interview" (docs/product-spec.md, module 1),
  -- and a boolean cannot say whether that window was met. It also keeps the
  -- sending boundary honest: this records that the user sent something, which
  -- is the only way a message ever leaves this system.
  followup_sent_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint interviews_followup_follows_the_interview check (
    followup_sent_at is null or followup_sent_at >= scheduled_at
  )
);

comment on table public.interviews is
  'One round of one application. Rounds are not unique per application: Japanese loops put two sessions in one round.';
comment on column public.interviews.followup_sent_at is
  'When the user sent the follow-up. Nothing in this system sends it for them.';

-- The upcoming-interviews query, and the reminder scan.
create index interviews_user_id_scheduled_at_idx
  on public.interviews (user_id, scheduled_at);
create index interviews_application_id_round_idx
  on public.interviews (application_id, round);

create trigger interviews_set_updated_at
  before update on public.interviews
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row-level security, in the same migration that creates the tables
-- ---------------------------------------------------------------------------
alter table public.resume_versions enable row level security;
alter table public.resume_versions force row level security;

create policy "Users read their own resume versions"
  on public.resume_versions for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users create their own resume versions"
  on public.resume_versions for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users update their own resume versions"
  on public.resume_versions for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users delete their own resume versions"
  on public.resume_versions for delete to authenticated
  using ((select auth.uid()) = user_id);

alter table public.interviews enable row level security;
alter table public.interviews force row level security;

create policy "Users read their own interviews"
  on public.interviews for select to authenticated
  using ((select auth.uid()) = user_id);

-- The application_id check is the cross-tenant one: without it a user could
-- attach their own interview record to somebody else's application, and the
-- reference proves that application exists.
create policy "Users create their own interviews"
  on public.interviews for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.applications a
      where a.id = application_id and a.user_id = (select auth.uid())
    )
  );

create policy "Users update their own interviews"
  on public.interviews for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.applications a
      where a.id = application_id and a.user_id = (select auth.uid())
    )
  );

create policy "Users delete their own interviews"
  on public.interviews for delete to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- applications: close the hole the new foreign key opens
--
-- resume_version_id is a third way to point at another tenant, exactly like
-- job_id was. The policies are replaced rather than amended because Postgres
-- has no "alter policy, add a clause".
-- ---------------------------------------------------------------------------
drop policy "Users create their own applications" on public.applications;
drop policy "Users update their own applications" on public.applications;

create policy "Users create their own applications"
  on public.applications for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.jobs j
      where j.id = job_id and j.user_id = (select auth.uid())
    )
    and (
      resume_version_id is null
      or exists (
        select 1 from public.resume_versions r
        where r.id = resume_version_id and r.user_id = (select auth.uid())
      )
    )
  );

create policy "Users update their own applications"
  on public.applications for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.jobs j
      where j.id = job_id and j.user_id = (select auth.uid())
    )
    and (
      resume_version_id is null
      or exists (
        select 1 from public.resume_versions r
        where r.id = resume_version_id and r.user_id = (select auth.uid())
      )
    )
  );
