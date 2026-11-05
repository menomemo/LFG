-- Insights and drills: module 6, the one with no off-the-shelf equivalent.
--
-- The premise is that everything the user learns gets filed along sales
-- dimensions and turned into a rep. Two columns carry that premise, and both
-- are shaped by the same rule: capture has to be nearly free, so a row that
-- has only been captured and not yet processed is a valid row.

-- ---------------------------------------------------------------------------
-- Supporting enum
-- ---------------------------------------------------------------------------

-- The eight dimensions of docs/product-spec.md, module 6. An enum rather than
-- free text because they are the axis the whole library is organised on, and
-- a tagger that can invent a ninth would quietly make the library
-- unsearchable.
create type public.sales_dimension as enum (
  'opening',
  'discovery',
  'storytelling',
  'value_proposition',
  'objections',
  'trust',
  'closing',
  'following_up'
);

-- ---------------------------------------------------------------------------
-- insights
-- ---------------------------------------------------------------------------
create table public.insights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,

  -- What the user actually captured, and the only required content. Capture
  -- is three seconds from a share sheet and may happen offline; everything
  -- below this line is added later by the pipeline, which is why all of it is
  -- nullable. A row that is raw text and nothing else is finished as far as
  -- the user is concerned.
  raw_text text not null check (length(trim(raw_text)) > 0),

  source_url text,

  -- The one-sentence point and the actionable principle, both model-written,
  -- both covered by one generated_by.
  summary text,
  principle text,
  generated_by text,

  -- Which dimensions this was tagged with. Empty is the honest state before
  -- the tagger has run; the one-to-three guidance from the product spec is
  -- the tagger's business, not a constraint here, because it is a guideline
  -- that will be tuned.
  sales_dims public.sales_dimension[] not null default '{}',

  -- Assigned by embedding-similarity clustering, so the same lesson learned
  -- three times reinforces one insight. A bare uuid and not a foreign key:
  -- whether clusters deserve a table of their own, once they carry a
  -- canonical summary, is an open question in docs/data-model.md, and
  -- creating the table before the clustering runs would be deciding it by
  -- accident.
  cluster_id uuid,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint insights_summary_has_provenance check (
    (summary is null) = (generated_by is null)
  ),
  -- A principle with no summary would mean the pipeline wrote its second
  -- output and not its first, which is a bug worth refusing rather than
  -- storing.
  constraint insights_principle_needs_summary check (
    principle is null or summary is not null
  )
);

-- NOT CREATED HERE, for the same reason jobs.jd_embedding is not: the
-- embedding dimension follows from the model, the model is still unchosen,
-- and whether one vector space serves both job descriptions and insights is
-- itself an open question. It arrives with the migration that first generates
-- an embedding.

comment on table public.insights is
  'Something the user learned. raw_text is the only required part: capture must never wait for processing.';
comment on column public.insights.cluster_id is
  'Embedding-similarity cluster. Not a foreign key: whether clusters get a table is undecided.';

create index insights_user_id_created_at_idx
  on public.insights (user_id, created_at desc);
create index insights_sales_dims_idx on public.insights using gin (sales_dims);

-- Reading a cluster back: every insight that reinforces the same lesson.
create index insights_user_id_cluster_id_idx
  on public.insights (user_id, cluster_id)
  where cluster_id is not null;

create trigger insights_set_updated_at
  before update on public.insights
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- drills
-- ---------------------------------------------------------------------------
create table public.drills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  insight_id uuid not null references public.insights (id) on delete cascade,

  -- Model-written, always: a drill is generated from an insight, never typed.
  -- generated_by is NOT NULL and the source link is the foreign key above --
  -- the insight is where this scenario came from, and it is enforced rather
  -- than recorded.
  scenario text not null check (length(trim(scenario)) > 0),
  generated_by text not null check (length(trim(generated_by)) > 0),

  attempts integer not null default 0 check (attempts >= 0),

  -- Normalised to [0, 1], like evidence.score, and null until there has been
  -- an attempt. Null is unknown, not zero: a drill nobody has tried is not a
  -- drill somebody failed.
  last_score numeric check (last_score >= 0 and last_score <= 1),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint drills_unattempted_has_no_score check (
    attempts > 0 or last_score is null
  )
);

comment on table public.drills is
  'A rehearsal generated from one insight. Scores feed the sales and influence axis as evidence.';

create index drills_insight_id_idx on public.drills (insight_id);
create index drills_user_id_created_at_idx
  on public.drills (user_id, created_at desc);

create trigger drills_set_updated_at
  before update on public.drills
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row-level security, in the same migration that creates the tables
-- ---------------------------------------------------------------------------
alter table public.insights enable row level security;
alter table public.insights force row level security;

create policy "Users read their own insights"
  on public.insights for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users create their own insights"
  on public.insights for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users update their own insights"
  on public.insights for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users delete their own insights"
  on public.insights for delete to authenticated
  using ((select auth.uid()) = user_id);

alter table public.drills enable row level security;
alter table public.drills force row level security;

create policy "Users read their own drills"
  on public.drills for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users create their own drills"
  on public.drills for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.insights i
      where i.id = insight_id and i.user_id = (select auth.uid())
    )
  );

create policy "Users update their own drills"
  on public.drills for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.insights i
      where i.id = insight_id and i.user_id = (select auth.uid())
    )
  );

create policy "Users delete their own drills"
  on public.drills for delete to authenticated
  using ((select auth.uid()) = user_id);
