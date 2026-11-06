-- Notes on an application: what to prepare, what was said, what to chase.
--
-- There is no new table here, so there are no new policies: `applications`
-- already has row-level security enabled and forced, and its four policies
-- are defined per row rather than per column, so a column added to it is
-- covered by them the moment it exists. The isolation suite proves this for
-- the table; nothing about a new column changes what it proves.
--
-- Nullable, and empty text is refused rather than stored. An application
-- nobody has written a note about has no note, which is a different fact
-- from a note that is blank, and the UI reads the first one as "none yet"
-- (CLAUDE.md rule 8).

alter table public.applications
  add column notes text
    check (notes is null or length(trim(notes)) > 0);

comment on column public.applications.notes is
  'Free text about this application. Null means nobody has written one.';

-- DELIBERATELY NOT HERE: companies.notes.
--
-- Notes about an employer -- what it sells, what to read before an interview
-- -- outlive any one application, and retyping them for the second role at
-- the same company is exactly the kind of thing this product exists to stop.
-- They do not belong on `applications`, and they must not go in
-- `companies.research_json`, which carries NOT NULL provenance for
-- agent-written content; a human paragraph in there would make the
-- provenance a lie. The column is a one-line change, but where company
-- knowledge lives is a data-model decision rather than a UI one, so it is
-- raised in the pull request instead of being taken here.
