-- Point applications at jobs, and stop them carrying their own copy of the
-- company name, the role title and the region.
--
-- The walking skeleton denormalised these three columns on purpose: it needed
-- one table, and companies and jobs did not exist yet. Now they do, and the
-- same reasoning that keeps the current stage out of a column applies here --
-- a fact stored in two places is a fact that will eventually disagree with
-- itself, and every region-sliced metric in the risk dashboard reads this one.
--
-- Destructive: three columns are dropped. Rollback plan, as required by
-- docs/code-standards.md -- restore from the point-in-time backup. The data is
-- not recoverable from the new shape alone, because a company row created by
-- the backfill carries no record of which application produced it. At the time
-- of writing the production table is empty, which is the cheapest moment this
-- change will ever have.

-- ---------------------------------------------------------------------------
-- 1. Add the link, nullable for now
-- ---------------------------------------------------------------------------
alter table public.applications
  add column job_id uuid references public.jobs (id) on delete restrict;

-- on delete restrict, not cascade: deleting a job that has an application
-- recorded against it is almost always a mistake, and losing the stage history
-- is the kind of loss that cannot be noticed later.

-- ---------------------------------------------------------------------------
-- 2. Backfill
--
-- A temporary column on jobs carries the originating application id, so the
-- mapping back is exact. Matching on (company, title, region) instead would be
-- ambiguous the moment someone applies to the same role twice -- which is a
-- real thing people do after a rejection.
-- ---------------------------------------------------------------------------
alter table public.jobs add column migration_source_application_id uuid;

-- One company per distinct name per user. Name matching is the best available
-- here: the old rows never held a domain.
insert into public.companies (user_id, name, regions)
select
  a.user_id,
  a.company_name,
  array_agg(distinct a.region)
from public.applications a
group by a.user_id, a.company_name;

insert into public.jobs (
  user_id, company_id, title, region, migration_source_application_id
)
select a.user_id, c.id, a.role_title, a.region, a.id
from public.applications a
join public.companies c
  on c.user_id = a.user_id and c.name = a.company_name;

update public.applications a
set job_id = j.id
from public.jobs j
where j.migration_source_application_id = a.id;

alter table public.jobs drop column migration_source_application_id;

-- ---------------------------------------------------------------------------
-- 3. Make the link required, and drop what it replaced
-- ---------------------------------------------------------------------------
alter table public.applications alter column job_id set not null;

alter table public.applications
  drop column company_name,
  drop column role_title,
  drop column region;

create index applications_job_id_idx on public.applications (job_id);

comment on column public.applications.job_id is
  'The role applied to. Company, title and region are read through this, never copied.';

-- ---------------------------------------------------------------------------
-- 4. Close the cross-tenant hole the new foreign key opens
--
-- Until now the applications policies only had to check user_id. With a
-- foreign key to jobs, a user could attach their own application row to
-- somebody else's job -- which makes that row a readable reference into
-- another tenant's data. The insert and update policies now check that the
-- job belongs to the same user, exactly as the jobs policies check the
-- company.
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
  );
