-- Applications: the hub of the data model.
--
-- Two decisions are enforced here rather than asked for politely:
--
--   1. Row-level security is enabled and its policies are defined in the same
--      migration that creates the table. There is no "add RLS later" step,
--      because the window between the two is when a stranger's resume leaks
--      (ADR-0002).
--   2. stage_history is append-only and is the single source of truth for the
--      current stage. There is deliberately no `stage` column: every
--      conversion rate, time-in-stage median and ghost determination is
--      derived from this array by packages/core, and a mutable column would
--      make those numbers unreconstructable (docs/data-model.md).

-- Mirrors the Region union in packages/core/src/regions/region.ts. Adding a
-- market means changing both, and the TypeScript exhaustiveness check is what
-- makes the omission loud (ADR-0004).
create type public.region as enum ('uk', 'ie', 'ee', 'jp', 'de', 'other');

-- Mirrors ApplicationStage in packages/core/src/pipeline/stage.ts.
-- 'ghosted' is absent on purpose: it is derived from silence, not recorded.
create type public.application_stage as enum (
  'saved',
  'applied',
  'assessment',
  'interview',
  'offer',
  'rejected',
  'withdrawn'
);

create table public.applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,

  company_name text not null check (length(trim(company_name)) > 0),
  role_title text not null check (length(trim(role_title)) > 0),
  region public.region not null,

  -- Array of {stage, at}. Entry shape is validated at the boundary by
  -- packages/core before it is written; the database guarantees the
  -- container, which is what stops a scalar or an object getting in.
  stage_history jsonb not null default '[]'::jsonb
    check (jsonb_typeof(stage_history) = 'array'),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.applications is
  'One job application. Current stage is derived from stage_history, never stored.';
comment on column public.applications.stage_history is
  'Append-only array of {stage, at}. Source of truth for every pipeline metric.';

-- The board lists a user''s applications newest first; this is that query.
create index applications_user_id_created_at_idx
  on public.applications (user_id, created_at desc);

-- updated_at is maintained by the database so no client can forget it.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger applications_set_updated_at
  before update on public.applications
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
alter table public.applications enable row level security;

-- Forces the policies to apply to the table owner too, so a migration or a
-- privileged connection cannot quietly read across tenants.
alter table public.applications force row level security;

create policy "Users read their own applications"
  on public.applications
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users create their own applications"
  on public.applications
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

-- The with check clause is what stops a user handing their row to someone
-- else by updating user_id.
create policy "Users update their own applications"
  on public.applications
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users delete their own applications"
  on public.applications
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);
