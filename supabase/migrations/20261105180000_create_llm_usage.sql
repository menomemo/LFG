-- llm_usage: the meter.
--
-- The last table in docs/data-model.md, and the one with the shortest
-- justification: every model call writes a row here before its result is
-- used, with no exceptions, including for local models. The caching, tiering
-- and capping the architecture depends on cannot be tuned without this, so an
-- unmetered call is a bug rather than an oversight.
--
-- What is NOT here is the ceiling. Every plugin declares a daily call cap and
-- a maximum step count, and both are configuration -- a number in SQL would
-- be a threshold that nobody can see or change without a migration (ADR-0004
-- makes the general version of this argument).

create table public.llm_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,

  -- Which plugin spent this, as its own column rather than a prefix on task.
  -- The daily cap is declared per plugin and enforced by counting these
  -- rows; parsing a plugin name back out of free text is the kind of thing
  -- that works until someone renames a task.
  plugin text not null check (length(trim(plugin)) > 0),

  -- What it was doing. Free text on purpose: a plugin's internal steps are
  -- its own business, and an enum here would need a migration every time one
  -- gained a step.
  task text not null check (length(trim(task)) > 0),

  -- The model that actually ran. Recording it is not the same as choosing it:
  -- no provider or model name appears in business code, backends stay
  -- configuration, and this column is how a bill is later attributed to one.
  model text not null check (length(trim(model)) > 0),

  tokens_in integer not null check (tokens_in >= 0),
  tokens_out integer not null check (tokens_out >= 0),

  -- Named for its currency, where docs/data-model.md said `cost`. A bare
  -- cost cannot be summed across providers that bill in different
  -- currencies, and the conversion has to happen somewhere -- doing it at
  -- the boundary, once, is cheaper than discovering later that a dashboard
  -- has been adding euros to dollars. numeric, never float: this is money.
  cost_usd numeric(12, 6) not null check (cost_usd >= 0),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.llm_usage is
  'One model call. Written before the result is used, with no exceptions. Caps are configuration.';
comment on column public.llm_usage.model is
  'Which model ran. Recording it is not choosing it -- backends are configuration.';

-- The two queries that exist: what has this user spent today, and has this
-- plugin hit its daily ceiling.
create index llm_usage_user_id_created_at_idx
  on public.llm_usage (user_id, created_at desc);
create index llm_usage_user_id_plugin_created_at_idx
  on public.llm_usage (user_id, plugin, created_at desc);

create trigger llm_usage_set_updated_at
  before update on public.llm_usage
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row-level security, in the same migration that creates the table
--
-- A meter is only meaningful if the thing being metered cannot rewrite it,
-- and the honest position is that this schema does not give anyone a way to
-- do that from outside their own tenant. Within it, the same reasoning as
-- review_logs applies: the update and delete policies exist because a user
-- owns their own data, and removing them later would be a tightening rather
-- than a regression.
-- ---------------------------------------------------------------------------
alter table public.llm_usage enable row level security;
alter table public.llm_usage force row level security;

create policy "Users read their own usage"
  on public.llm_usage for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users record their own usage"
  on public.llm_usage for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users update their own usage"
  on public.llm_usage for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users delete their own usage"
  on public.llm_usage for delete to authenticated
  using ((select auth.uid()) = user_id);
