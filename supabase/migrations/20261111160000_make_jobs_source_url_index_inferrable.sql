-- Drop the `where source_url is not null` predicate from the unique index on
-- jobs (user_id, source_url).
--
-- WHAT BROKE. The poller stores a discovered posting with
-- `on conflict (user_id, source_url) do nothing`, so that a role seen on a
-- second run is skipped rather than duplicated. Every insert failed with
--
--   there is no unique or exclusion constraint matching the ON CONFLICT
--   specification
--
-- because Postgres will only infer a PARTIAL unique index for ON CONFLICT if
-- the statement repeats the index's predicate, and PostgREST's `on_conflict`
-- parameter can only name columns. The index existed, matched the columns,
-- and was unusable for the one statement that needed it.
--
-- It was not caught earlier because the only board that got as far as
-- inserting had kept nothing, and `storeNew` returns before the insert when
-- there is nothing to store -- so the one company that reported success was
-- the one that never exercised the broken path.
--
-- WHY DROPPING THE PREDICATE IS SAFE, AND NOT A WEAKENING. In a multi-column
-- unique index, Postgres treats two rows as distinct when any indexed column
-- is null, so `(user_id, null)` never conflicts with anything either way.
-- The predicate therefore bought nothing but a smaller index: a job entered
-- by hand with no advert link was unconstrained before this change and is
-- unconstrained after it. What changes is only that the index can now be
-- inferred, which is what makes the skip atomic rather than a read followed
-- by a write that races with itself.
--
-- The rule the index encodes is unchanged and still the one from
-- 20261105090000: one job per source URL per user, because the same posting
-- reached twice must not become two rows and must not be parsed and paid for
-- twice.

drop index if exists public.jobs_user_id_source_url_key;

create unique index jobs_user_id_source_url_key
  on public.jobs (user_id, source_url);
