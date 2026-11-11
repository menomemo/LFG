-- jobs.dismissed_at: a lead that was read and is not wanted.
--
-- ADR-0010 stores a discovered posting as a `jobs` row with no application,
-- so "lead" is not a table but a shape: a job nobody has applied for. The
-- list of those is the whole surface of board polling, which makes clearing
-- an entry from it part of the feature rather than a refinement.
--
-- WHY NOT JUST DELETE THE ROW: the poller deduplicates on
-- `(user_id, source_url)`. A deleted lead is a lead the next run cannot tell
-- it has already shown, so it comes straight back -- and the one posting the
-- author has decided twice about is the one that keeps reappearing. Marking
-- it keeps the row, which keeps the dedup key, which is what makes the
-- decision stick.
--
-- Nullable, and null means not dismissed. There is no "dismissed" boolean
-- beside it: the timestamp answers both whether and when, and two columns
-- that encode one fact can disagree.
--
-- No index. The lead list reads one user's jobs and there are tens of them;
-- row-level security already restricts the scan to the caller's rows.
--
-- DELIBERATELY NOT HERE: a reason. Asking why a role was passed over sounds
-- useful and would be answered honestly twice and then left blank, and a
-- column that is almost always null teaches nothing. If the discarded counts
-- turn out to need tuning, the filter in packages/core/src/jobs/board.ts is
-- where that is decided, against postings it never kept in the first place.

alter table public.jobs
  add column dismissed_at timestamptz;

comment on column public.jobs.dismissed_at is
  'When this lead was dismissed. Null means it has not been. The row is kept so the poller does not rediscover it.';
