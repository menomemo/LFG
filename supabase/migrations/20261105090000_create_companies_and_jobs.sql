-- Companies and jobs: the two tables an application needs in order to stop
-- carrying its own copy of the company name.
--
-- Three decisions are made here that docs/data-model.md had left open until
-- the first migration that needed them. Each is written down because each is
-- the kind a future reader could reverse without knowing what it cost.

-- ---------------------------------------------------------------------------
-- Supporting enums
-- ---------------------------------------------------------------------------

-- The ATS platforms whose public job-board endpoints we can read
-- (docs/product-spec.md, module 2). `other` is not a failure: plenty of
-- companies run something bespoke, and we still want the company row.
create type public.ats_type as enum (
  'greenhouse',
  'lever',
  'ashby',
  'workday',
  'other'
);

-- Headcount bands rather than a number. The number is rarely knowable and
-- never current; the band is what concentration metrics actually group by.
create type public.company_size as enum (
  '1-10',
  '11-50',
  '51-200',
  '201-500',
  '501-1000',
  '1001-5000',
  '5000+'
);

create type public.work_mode as enum ('onsite', 'hybrid', 'remote');

-- Tri-state on purpose. 'unknown' is the default and is a different claim from
-- 'no' -- the sponsorship coverage metric counts only confirmed values, so
-- collapsing the two would quietly inflate it (docs/product-spec.md, module 7).
create type public.sponsorship as enum ('yes', 'no', 'unknown');

-- ---------------------------------------------------------------------------
-- companies
-- ---------------------------------------------------------------------------
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,

  name text not null check (length(trim(name)) > 0),

  -- Normalised at the boundary: lowercase, no scheme, no www, no trailing
  -- slash. Deduplication keys on this, never on the display name, because
  -- "Stripe", "Stripe Inc" and "Stripe Payments Europe" are one employer.
  domain text check (domain is null or domain = lower(trim(domain))),

  ats_type public.ats_type,
  ats_slug text,
  sector text check (sector is null or sector = lower(trim(sector))),
  size public.company_size,

  -- ISO 3166-1 alpha-2, uppercase. Where the company is headquartered, which
  -- is a different question from which of our markets it hires in.
  hq_country char(2) check (hq_country is null or hq_country ~ '^[A-Z]{2}$'),

  -- DECISION: an array, not one row per company per region.
  --
  -- A company is one entity, and research_json -- the expensive, cached,
  -- AI-generated profile -- belongs to the entity. One row per region would
  -- copy that profile into every market the company hires in, giving it N
  -- places to go stale and N bills to generate. Multinationals hiring across
  -- several of our markets are the normal case, not the exception, so the
  -- array is the realistic shape. Queried through a GIN index below.
  regions public.region[] not null default '{}',

  -- Cached for 30 days; research_at is what the cache check reads.
  research_json jsonb check (
    research_json is null or jsonb_typeof(research_json) = 'object'
  ),
  research_at timestamptz,
  research_generated_by text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Provenance is structural, not a convention: a profile that cannot say
  -- which plugin version produced it must not exist (docs/code-standards.md).
  constraint companies_research_has_provenance check (
    (research_json is null) = (research_generated_by is null)
  ),
  constraint companies_research_has_timestamp check (
    (research_json is null) = (research_at is null)
  )
);

comment on table public.companies is
  'An employer. Deduplicated on domain, never on display name.';
comment on column public.companies.regions is
  'Which of our markets this company hires in. Array because multinationals hire in several.';

-- One company per domain per user. Partial, because a company we only know by
-- name is still worth a row -- it just cannot be deduplicated yet.
create unique index companies_user_id_domain_key
  on public.companies (user_id, domain)
  where domain is not null;

create index companies_user_id_name_idx on public.companies (user_id, name);
create index companies_regions_idx on public.companies using gin (regions);

-- ---------------------------------------------------------------------------
-- jobs
-- ---------------------------------------------------------------------------
create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,

  title text not null check (length(trim(title)) > 0),
  jd_text text,
  source_url text,
  posted_at timestamptz,

  region public.region not null,
  work_mode public.work_mode,

  visa_sponsorship public.sponsorship not null default 'unknown',
  -- A value read from the UK's register of licensed sponsors and a value
  -- inferred from a job advert are not the same fact. Confirmed values must
  -- say where they came from; 'unknown' needs no source.
  visa_sponsorship_source text,
  constraint jobs_confirmed_sponsorship_has_source check (
    visa_sponsorship = 'unknown' or visa_sponsorship_source is not null
  ),

  -- {language, level, evidence}. A level, not a boolean: JLPT N2 and "some
  -- Japanese appreciated" are different gates, and this participates in match
  -- scoring (docs/regions.md).
  language_required jsonb check (
    language_required is null or jsonb_typeof(language_required) = 'object'
  ),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- NOT CREATED HERE, deliberately: jd_embedding and skill_vector.
--
-- pgvector needs a fixed dimension to build an index, and the dimension is
-- decided by the embedding model -- which docs/data-model.md still lists as an
-- open question. Creating them now means either guessing a dimension and
-- rewriting the column when the guess is wrong, or creating unindexed columns
-- that look finished and are not. They arrive with the migration that first
-- generates an embedding, in Phase 2.

comment on table public.jobs is
  'A specific role at a company. Parsed once, keyed on source_url.';

-- One job per source URL per user: the same posting reached twice must not
-- become two rows, and re-parsing it must not be paid for twice.
create unique index jobs_user_id_source_url_key
  on public.jobs (user_id, source_url)
  where source_url is not null;

create index jobs_company_id_idx on public.jobs (company_id);
create index jobs_user_id_region_idx on public.jobs (user_id, region);

-- ---------------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------------
create trigger companies_set_updated_at
  before update on public.companies
  for each row execute function public.set_updated_at();

create trigger jobs_set_updated_at
  before update on public.jobs
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row-level security, in the same migration that creates the tables
-- ---------------------------------------------------------------------------
alter table public.companies enable row level security;
alter table public.companies force row level security;

create policy "Users read their own companies"
  on public.companies for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users create their own companies"
  on public.companies for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users update their own companies"
  on public.companies for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users delete their own companies"
  on public.companies for delete to authenticated
  using ((select auth.uid()) = user_id);

alter table public.jobs enable row level security;
alter table public.jobs force row level security;

create policy "Users read their own jobs"
  on public.jobs for select to authenticated
  using ((select auth.uid()) = user_id);

-- The company_id check is the part worth reading twice. Without it a user
-- could attach their own job row to someone else's company, which is a
-- readable foreign key into another tenant's data.
create policy "Users create their own jobs"
  on public.jobs for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.companies c
      where c.id = company_id and c.user_id = (select auth.uid())
    )
  );

create policy "Users update their own jobs"
  on public.jobs for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.companies c
      where c.id = company_id and c.user_id = (select auth.uid())
    )
  );

create policy "Users delete their own jobs"
  on public.jobs for delete to authenticated
  using ((select auth.uid()) = user_id);
