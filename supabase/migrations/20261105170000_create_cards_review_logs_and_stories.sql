-- Cards, review logs and stories: module 5, the practice loop.
--
-- Three tables and one shape worth noticing: every one of them attaches to a
-- competency, because a rep that does not feed the radar is a rep nobody can
-- show the value of. That is also what makes stories.competency_ids a third
-- kind of cross-tenant surface -- an array of references, which no foreign
-- key can police.

-- ---------------------------------------------------------------------------
-- Supporting enum
-- ---------------------------------------------------------------------------

-- The four FSRS ratings. Named by ts-fsrs, which owns the scheduling: this
-- enum mirrors its vocabulary rather than inventing one, so a rating read
-- back out of the log means to the library exactly what it meant going in.
create type public.card_rating as enum ('again', 'hard', 'good', 'easy');

-- ---------------------------------------------------------------------------
-- cards
-- ---------------------------------------------------------------------------
create table public.cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,

  -- on delete restrict: deleting a competency that has cards against it
  -- throws away their review history, and that loss is not noticeable later.
  competency_id uuid not null
    references public.competencies (id) on delete restrict,

  -- Where this card came from, when it came from the insight library. Null
  -- for a card drawn from a target-JD gap or from a question that caught the
  -- user out, which is most of them. on delete set null: losing the insight
  -- is no reason to lose the card or its schedule.
  insight_id uuid references public.insights (id) on delete set null,

  front text not null check (length(trim(front)) > 0),
  back text not null check (length(trim(back)) > 0),

  -- Null means the user wrote this card themselves.
  generated_by text,

  -- The product rule is that AI drafts and the user approves before a card
  -- enters the deck, so an unapproved card is a real state and the due-card
  -- query below filters on it. A card the user wrote is approved by
  -- definition, which is what the constraint says.
  approved_at timestamptz,

  -- Owned by ts-fsrs. The shape belongs to the library and is parsed at the
  -- boundary; the database guarantees the container, which is what stops a
  -- scalar getting in. No default: the initial state is the library's to
  -- produce, and inventing one here would be reimplementing FSRS badly.
  fsrs_state jsonb not null check (jsonb_typeof(fsrs_state) = 'object'),

  due_at timestamptz not null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint cards_user_written_cards_are_approved check (
    generated_by is not null or approved_at is not null
  )
);

comment on table public.cards is
  'One flashcard, scheduled by ts-fsrs. Attaches to a competency so reviews feed the radar.';
comment on column public.cards.approved_at is
  'When the user let this card into the deck. Null means drafted and not yet approved.';

-- The daily queue: this user's approved cards that are due, soonest first.
-- Partial, because an unapproved draft must never appear in it.
create index cards_user_id_due_at_idx
  on public.cards (user_id, due_at)
  where approved_at is not null;

create index cards_competency_id_idx on public.cards (competency_id);
create index cards_insight_id_idx on public.cards (insight_id)
  where insight_id is not null;

create trigger cards_set_updated_at
  before update on public.cards
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- review_logs
--
-- The history FSRS optimisation reads, and the evidence a flashcard
-- contributes to the radar. Nothing should ever rewrite a row here. The
-- update and delete policies exist because every table in this schema has
-- all four, and because a user deleting their own data is a right rather
-- than a bug -- but if a future migration takes the update policy away, that
-- would be a tightening and not a regression.
-- ---------------------------------------------------------------------------
create table public.review_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  card_id uuid not null references public.cards (id) on delete cascade,

  rating public.card_rating not null,
  reviewed_at timestamptz not null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.review_logs is
  'One review of one card. Append-only in intent: FSRS optimisation reads this history.';

create index review_logs_card_id_reviewed_at_idx
  on public.review_logs (card_id, reviewed_at desc);
create index review_logs_user_id_reviewed_at_idx
  on public.review_logs (user_id, reviewed_at desc);

create trigger review_logs_set_updated_at
  before update on public.review_logs
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- stories
-- ---------------------------------------------------------------------------
create table public.stories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,

  title text not null check (length(trim(title)) > 0),

  -- All four parts required, by constraint. Mocks score STAR completeness,
  -- and a story missing its result is the specific failure that scoring
  -- exists to catch -- so storing one and marking it incomplete later would
  -- be doing the same work twice, badly.
  star_json jsonb not null check (
    jsonb_typeof(star_json) = 'object'
    and star_json ?& array['situation', 'task', 'action', 'result']
  ),

  -- Which sub-skills this story evidences. An array because one story
  -- genuinely evidences several, and the pre-interview recommendation reads
  -- it the other way round -- which stories cover the gaps this company's
  -- profile exposes. GIN-indexed for that query.
  competency_ids uuid[] not null default '{}',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.stories is
  'A STAR story, tagged with the sub-skills it evidences. Recommended before an interview; no column points at one.';

create index stories_user_id_created_at_idx
  on public.stories (user_id, created_at desc);
create index stories_competency_ids_idx
  on public.stories using gin (competency_ids);

create trigger stories_set_updated_at
  before update on public.stories
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row-level security, in the same migration that creates the tables
-- ---------------------------------------------------------------------------
alter table public.cards enable row level security;
alter table public.cards force row level security;

create policy "Users read their own cards"
  on public.cards for select to authenticated
  using ((select auth.uid()) = user_id);

-- Two parents to check, and insight_id is nullable, so it gets the same
-- null-permitting branch contacts.company_id has.
create policy "Users create their own cards"
  on public.cards for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.competencies c
      where c.id = competency_id and c.user_id = (select auth.uid())
    )
    and (
      insight_id is null
      or exists (
        select 1 from public.insights i
        where i.id = insight_id and i.user_id = (select auth.uid())
      )
    )
  );

create policy "Users update their own cards"
  on public.cards for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.competencies c
      where c.id = competency_id and c.user_id = (select auth.uid())
    )
    and (
      insight_id is null
      or exists (
        select 1 from public.insights i
        where i.id = insight_id and i.user_id = (select auth.uid())
      )
    )
  );

create policy "Users delete their own cards"
  on public.cards for delete to authenticated
  using ((select auth.uid()) = user_id);

alter table public.review_logs enable row level security;
alter table public.review_logs force row level security;

create policy "Users read their own review logs"
  on public.review_logs for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users create their own review logs"
  on public.review_logs for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.cards c
      where c.id = card_id and c.user_id = (select auth.uid())
    )
  );

create policy "Users update their own review logs"
  on public.review_logs for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.cards c
      where c.id = card_id and c.user_id = (select auth.uid())
    )
  );

create policy "Users delete their own review logs"
  on public.review_logs for delete to authenticated
  using ((select auth.uid()) = user_id);

alter table public.stories enable row level security;
alter table public.stories force row level security;

create policy "Users read their own stories"
  on public.stories for select to authenticated
  using ((select auth.uid()) = user_id);

-- The third shape of cross-tenant write, and the one no foreign key can
-- police: a reference inside an array. Every element has to belong to the
-- caller, so the check is "there is no element that is not mine" -- written
-- as a double negative because that is what refuses an array containing one
-- foreign id among several of the user's own.
create policy "Users create their own stories"
  on public.stories for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and not exists (
      select 1 from unnest(competency_ids) as element(competency_id)
      where not exists (
        select 1 from public.competencies c
        where c.id = element.competency_id
          and c.user_id = (select auth.uid())
      )
    )
  );

create policy "Users update their own stories"
  on public.stories for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and not exists (
      select 1 from unnest(competency_ids) as element(competency_id)
      where not exists (
        select 1 from public.competencies c
        where c.id = element.competency_id
          and c.user_id = (select auth.uid())
      )
    )
  );

create policy "Users delete their own stories"
  on public.stories for delete to authenticated
  using ((select auth.uid()) = user_id);
