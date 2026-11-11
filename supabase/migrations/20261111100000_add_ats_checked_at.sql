-- companies.ats_checked_at: when this board was last read.
--
-- ADR-0010 polls the ATS of every company that has both ats_type and
-- ats_slug. This column is what makes that observable: without it, "found
-- nothing" and "never looked" are the same empty result, and a poller that
-- quietly stopped running looks exactly like a set of companies that are not
-- hiring.
--
-- Nullable, because never having been checked is the honest state for every
-- row that exists today and for every company added later. CLAUDE.md rule 8:
-- unknown is not zero, and a default of now() would claim a check that did
-- not happen.
--
-- No index. The poller reads every pollable company on each run and the table
-- holds tens of rows, so an index would cost writes and save nothing.
--
-- DELIBERATELY NOT HERE: a `watch` flag. ADR-0010 decides that having an
-- ats_type and an ats_slug IS the intent to watch -- a second boolean would
-- let the two disagree, and the question "why is this company not being
-- polled" would then have two possible answers instead of one.

alter table public.companies
  add column ats_checked_at timestamptz;

comment on column public.companies.ats_checked_at is
  'When this company''s ATS board was last read. Null means never, which is not the same as nothing found.';
