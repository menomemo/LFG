-- Notes on a company: what it sells, what to read before an interview.
--
-- The companion to `applications.notes`, and the reason that one was not
-- enough. A note about an employer is true of the employer, not of the
-- application that happened to be open when it was written, so the second
-- role at the same company should start with it already there. Keeping it
-- on `applications` would mean retyping it, which is one of the things this
-- product exists to stop.
--
-- No new table, so no new policies: `companies` already has row-level
-- security enabled and forced, and its four policies are defined per row
-- rather than per column, so a column added to it is covered by them the
-- moment it exists. The isolation suite proves that for the table, and a new
-- column changes nothing about what it proves.
--
-- Nullable, and empty text is refused rather than stored, exactly as for
-- `applications.notes`: a company nobody has written about has no note,
-- which is a different fact from a note that is blank (CLAUDE.md rule 8).
--
-- NOT research_json, which sits on this same table and would look like the
-- obvious home. That column carries NOT NULL provenance for agent-written
-- content: `research_generated_by` and `research_at` are constrained to be
-- present exactly when it is. A paragraph a person typed has no model and no
-- generation time, so putting it there would either break the constraint or
-- make the provenance a lie (CLAUDE.md rule 3). Human prose and agent output
-- are different kinds of claim and they get different columns.

alter table public.companies
  add column notes text
    check (notes is null or length(trim(notes)) > 0);

comment on column public.companies.notes is
  'Free text about this employer, written by the user and shared by every application to it. Null means nobody has written one.';
