-- Contacts and signals: the two tables that hang off a company rather than
-- off an application.
--
-- Both are written by plugins reading public sources, which is why the rules
-- about provenance and about what this product is not allowed to do show up
-- in the schema rather than in a code review comment.

-- ---------------------------------------------------------------------------
-- Supporting enums
-- ---------------------------------------------------------------------------

-- Who this person is to the search, from the role table in
-- docs/product-spec.md, module 3. The role decides the opening and the
-- cadence, which is why it is an enum and not a free-text job title: the job
-- title is what the person calls themselves, this is what they can tell you.
create type public.contact_role as enum (
  'engineer',
  'hiring_manager',
  'alumni',
  'recruiter',
  'author',
  'other'
);

-- The signal kinds docs/product-spec.md, module 7 names. 'headcount_change'
-- is the derived one: it comes from comparing weekly pulls of a company's
-- public ATS board, not from a single document.
create type public.signal_type as enum (
  'funding',
  'layoff',
  'hiring_freeze',
  'headcount_change',
  'leadership_change',
  'launch',
  'news',
  'other'
);

-- Three levels, and no numbers attached to them. What raises a signal to
-- 'warning' is configuration with a checked_on date, not a constant here
-- (ADR-0004).
create type public.signal_severity as enum ('info', 'warning', 'critical');

-- ---------------------------------------------------------------------------
-- contacts
-- ---------------------------------------------------------------------------
create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,

  -- Nullable, which is the part the policies below have to be careful about.
  -- Not every useful contact sits at a target company: an agency recruiter is
  -- most of the Japanese funnel, and agencies are not companies we track.
  -- on delete set null rather than cascade -- losing the company research is
  -- no reason to lose the person.
  company_id uuid references public.companies (id) on delete set null,

  role_type public.contact_role not null,
  name text not null check (length(trim(name)) > 0),

  -- Normalised at the boundary, and the deduplication key. Never the display
  -- name: two people share a name, and one person spells theirs three ways.
  profile_url text check (
    profile_url is null or profile_url = lower(trim(profile_url))
  ),

  -- Where this person was found, and it is not optional. The lawful sources
  -- are listed in docs/product-spec.md, module 3: engineering blog authors,
  -- conference speakers, core contributors, meetup organisers, or pasted in
  -- by the user. A contact that cannot say which of those it came from is
  -- either a scrape or a guess, and this product does neither.
  source text not null check (length(trim(source)) > 0),

  last_touch_at timestamptz,

  -- Position in the day-1 / day-5 / day-12 cadence. The intervals are
  -- configuration; this is only how far along one sequence has got. 0 means
  -- nothing has been sent, which is also the only honest starting value.
  sequence_step smallint not null default 0 check (sequence_step >= 0),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.contacts is
  'A person worth talking to. Profiles are pasted by the user, never fetched.';
comment on column public.contacts.company_id is
  'Null is normal: agency recruiters belong to no tracked company.';
comment on column public.contacts.sequence_step is
  'How far the outreach cadence has got. The intervals are configuration.';

-- One row per person per user. Partial, because a contact known only by name
-- is still worth having -- it just cannot be deduplicated yet.
create unique index contacts_user_id_profile_url_key
  on public.contacts (user_id, profile_url)
  where profile_url is not null;

-- The follow-up query: who is overdue, oldest touch first.
create index contacts_user_id_last_touch_at_idx
  on public.contacts (user_id, last_touch_at nulls first);
create index contacts_company_id_idx on public.contacts (company_id);

create trigger contacts_set_updated_at
  before update on public.contacts
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- signals
-- ---------------------------------------------------------------------------
create table public.signals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  company_id uuid not null
    references public.companies (id) on delete cascade,

  type public.signal_type not null,
  severity public.signal_severity not null,

  -- Shape varies by type -- a funding round and a headcount series have
  -- nothing in common -- and is parsed per type at the boundary. The database
  -- guarantees the container.
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),

  -- When the thing happened, not when we noticed. created_at is when we
  -- noticed, and the gap between the two is how late the scanner is running.
  observed_at timestamptz not null,

  -- Provenance, NOT NULL both halves, because every row here is written by
  -- signal-scanner and a signal nobody can check is a rumour. For a derived
  -- headcount change the link is the ATS board the counts were read from.
  source_url text not null check (length(trim(source_url)) > 0),
  generated_by text not null check (length(trim(generated_by)) > 0),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint signals_observed_before_recorded check (observed_at <= created_at)
);

comment on table public.signals is
  'Something that happened at a company. Severity is assigned from configuration, not from thresholds here.';
comment on column public.signals.observed_at is
  'When it happened. created_at is when we found out.';

-- The dashboard query: this user's recent signals, newest first.
create index signals_user_id_observed_at_idx
  on public.signals (user_id, observed_at desc);
create index signals_company_id_observed_at_idx
  on public.signals (company_id, observed_at desc);

create trigger signals_set_updated_at
  before update on public.signals
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row-level security, in the same migration that creates the tables
-- ---------------------------------------------------------------------------
alter table public.contacts enable row level security;
alter table public.contacts force row level security;

create policy "Users read their own contacts"
  on public.contacts for select to authenticated
  using ((select auth.uid()) = user_id);

-- The cross-tenant check has an extra branch the other tables do not need:
-- company_id is nullable, so a plain exists() would refuse the legitimate
-- unattached contact. Null is permitted; a non-null value must be the
-- caller's own company.
create policy "Users create their own contacts"
  on public.contacts for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and (
      company_id is null
      or exists (
        select 1 from public.companies c
        where c.id = company_id and c.user_id = (select auth.uid())
      )
    )
  );

create policy "Users update their own contacts"
  on public.contacts for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and (
      company_id is null
      or exists (
        select 1 from public.companies c
        where c.id = company_id and c.user_id = (select auth.uid())
      )
    )
  );

create policy "Users delete their own contacts"
  on public.contacts for delete to authenticated
  using ((select auth.uid()) = user_id);

alter table public.signals enable row level security;
alter table public.signals force row level security;

create policy "Users read their own signals"
  on public.signals for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users create their own signals"
  on public.signals for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.companies c
      where c.id = company_id and c.user_id = (select auth.uid())
    )
  );

create policy "Users update their own signals"
  on public.signals for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.companies c
      where c.id = company_id and c.user_id = (select auth.uid())
    )
  );

create policy "Users delete their own signals"
  on public.signals for delete to authenticated
  using ((select auth.uid()) = user_id);
