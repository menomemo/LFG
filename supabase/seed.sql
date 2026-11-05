-- Local development seed. Refuses to run anywhere but a local stack.
--
-- Two users exist because one user cannot demonstrate tenant isolation. The
-- RLS test in supabase/tests signs in as each and proves neither can see the
-- other's rows; the board page uses Alice.
--
-- These are test credentials for a local database. They are deliberately
-- committed so that `supabase start` gives every clone the same fixture, and
-- they grant access to nothing but a throwaway container.

-- The empty-string token columns are not decoration. GoTrue scans them into
-- non-nullable Go strings, so leaving them NULL makes every sign-in fail with
-- "Database error querying schema".
-- ---------------------------------------------------------------------------
-- Refuse to run against anything but a local stack.
--
-- This file creates accounts whose password is published in this repository.
-- On a real database that is not a fixture, it is two working logins handed to
-- anyone who has read the source.
--
-- `supabase db push` excludes seeds unless someone passes --include-seed, and
-- `db reset` is local unless someone passes --linked. Both of those are one
-- flag away, and this is a mistake that cannot be taken back once the database
-- has real users -- so the file defends itself rather than trusting the
-- command that invoked it.
--
-- The check: every local stack started by the Supabase CLI uses the same
-- published JWT secret. A cloud project's secret is generated per project and
-- will never match, so this fails closed everywhere that is not local.
-- ---------------------------------------------------------------------------
do $$
begin
  if coalesce(current_setting('app.settings.jwt_secret', true), '') <>
     'super-secret-jwt-token-with-at-least-32-characters-long'
  then
    raise exception
      using
        message = 'Refusing to seed: this is not a local development database.',
        detail  = 'supabase/seed.sql creates accounts with a password that is '
                  'committed to the repository. Loading it anywhere real hands '
                  'two working logins to anyone who can read the source.',
        hint    = 'Seeds are for `supabase start` and `npm run db:reset` only. '
                  'Never pass --include-seed to `db push`, and never run '
                  '`db reset --linked` against a project you care about.';
  end if;
end $$;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token,
  email_change, email_change_token_new, email_change_token_current,
  phone_change, phone_change_token, reauthentication_token
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '11111111-1111-1111-1111-111111111111',
    'authenticated', 'authenticated', 'alice@lfg.test',
    crypt('lfg-dev-password', gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}', '{}',
    '', '', '', '', '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '22222222-2222-2222-2222-222222222222',
    'authenticated', 'authenticated', 'bob@lfg.test',
    crypt('lfg-dev-password', gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}', '{}',
    '', '', '', '', '', '', '', ''
  );

-- GoTrue requires a matching identity row for password sign-in.
insert into auth.identities (
  id, user_id, provider_id, identity_data, provider,
  last_sign_in_at, created_at, updated_at
)
select
  gen_random_uuid(), u.id, u.id::text,
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
  'email', now(), now(), now()
from auth.users u
where u.email in ('alice@lfg.test', 'bob@lfg.test');

-- ---------------------------------------------------------------------------
-- Fixtures
--
-- Shaped to exercise the model rather than to look plausible:
--   - Monzo is hiring in two of our markets, so companies.regions is an array
--     carrying both (ADR-0004).
--   - Mercari carries a language requirement with a level, which is the whole
--     reason that column is not a boolean (docs/regions.md).
--   - Monzo's sponsorship is confirmed and cites the UK register; Mercari's is
--     unknown. The coverage metric counts only the confirmed ones.
--   - Timestamps are relative to now(), so the ghosted case stays ghosted
--     however long after seeding the stack is started.
-- ---------------------------------------------------------------------------

insert into public.companies
  (id, user_id, name, domain, sector, size, hq_country, regions, ats_type, ats_slug)
values
  ('a0000000-0000-4000-8000-000000000001', '11111111-1111-1111-1111-111111111111',
   'Monzo', 'monzo.com', 'fintech', '1001-5000', 'GB', '{uk,ie}', 'greenhouse', 'monzo'),
  ('a0000000-0000-4000-8000-000000000002', '11111111-1111-1111-1111-111111111111',
   'Stripe', 'stripe.com', 'fintech', '5000+', 'US', '{ie,uk}', 'greenhouse', 'stripe'),
  ('a0000000-0000-4000-8000-000000000003', '11111111-1111-1111-1111-111111111111',
   'Mercari', 'mercari.com', 'marketplace', '1001-5000', 'JP', '{jp}', 'other', null),
  ('a0000000-0000-4000-8000-000000000004', '11111111-1111-1111-1111-111111111111',
   'Wise', 'wise.com', 'fintech', '5000+', 'GB', '{ee,uk}', 'greenhouse', 'wise'),
  ('b0000000-0000-4000-8000-000000000001', '22222222-2222-2222-2222-222222222222',
   'ACME Bob Ltd', 'acme-bob.test', 'logistics', '51-200', 'DE', '{de}', 'other', null);

insert into public.jobs
  (id, user_id, company_id, title, region, work_mode,
   visa_sponsorship, visa_sponsorship_source, language_required, source_url)
values
  ('c0000000-0000-4000-8000-000000000001', '11111111-1111-1111-1111-111111111111',
   'a0000000-0000-4000-8000-000000000001', 'Backend Engineer, Graduate', 'uk', 'hybrid',
   'yes', 'UK register of licensed sponsors, checked 2026-11-04', null,
   'https://boards.greenhouse.io/monzo/jobs/1000001'),
  ('c0000000-0000-4000-8000-000000000002', '11111111-1111-1111-1111-111111111111',
   'a0000000-0000-4000-8000-000000000002', 'Software Engineer, New Grad', 'ie', 'onsite',
   'unknown', null, null,
   'https://boards.greenhouse.io/stripe/jobs/1000002'),
  ('c0000000-0000-4000-8000-000000000003', '11111111-1111-1111-1111-111111111111',
   'a0000000-0000-4000-8000-000000000003', 'AI Engineer', 'jp', 'onsite',
   'unknown', null,
   '{"language":"ja","level":"JLPT N2","evidence":"stated in the job description"}',
   'https://apply.workable.com/mercari/j/1000003'),
  ('c0000000-0000-4000-8000-000000000004', '11111111-1111-1111-1111-111111111111',
   'a0000000-0000-4000-8000-000000000004', 'Platform Engineer', 'ee', 'remote',
   'no', 'recruiter said the role is for EU residents only', null,
   'https://boards.greenhouse.io/wise/jobs/1000004'),
  ('d0000000-0000-4000-8000-000000000001', '22222222-2222-2222-2222-222222222222',
   'b0000000-0000-4000-8000-000000000001', 'Staff Engineer', 'de', 'hybrid',
   'unknown', null, null, null);

-- Alice's pipeline. One of each interesting state: moving, ghosted, in
-- assessment, and closed.
insert into public.applications (user_id, job_id, stage_history)
values
  ('11111111-1111-1111-1111-111111111111', 'c0000000-0000-4000-8000-000000000001',
   jsonb_build_array(
     jsonb_build_object('stage', 'saved',     'at', to_jsonb(now() - interval '30 days')),
     jsonb_build_object('stage', 'applied',   'at', to_jsonb(now() - interval '26 days')),
     jsonb_build_object('stage', 'interview', 'at', to_jsonb(now() - interval '3 days'))
   )),
  ('11111111-1111-1111-1111-111111111111', 'c0000000-0000-4000-8000-000000000002',
   jsonb_build_array(
     jsonb_build_object('stage', 'saved',   'at', to_jsonb(now() - interval '45 days')),
     jsonb_build_object('stage', 'applied', 'at', to_jsonb(now() - interval '40 days'))
   )),
  ('11111111-1111-1111-1111-111111111111', 'c0000000-0000-4000-8000-000000000003',
   jsonb_build_array(
     jsonb_build_object('stage', 'saved',      'at', to_jsonb(now() - interval '12 days')),
     jsonb_build_object('stage', 'applied',    'at', to_jsonb(now() - interval '9 days')),
     jsonb_build_object('stage', 'assessment', 'at', to_jsonb(now() - interval '2 days'))
   )),
  ('11111111-1111-1111-1111-111111111111', 'c0000000-0000-4000-8000-000000000004',
   jsonb_build_array(
     jsonb_build_object('stage', 'saved',    'at', to_jsonb(now() - interval '60 days')),
     jsonb_build_object('stage', 'applied',  'at', to_jsonb(now() - interval '55 days')),
     jsonb_build_object('stage', 'rejected', 'at', to_jsonb(now() - interval '50 days'))
   ));

-- Bob's row exists for exactly one reason: Alice must never see it.
insert into public.applications (user_id, job_id, stage_history)
values
  ('22222222-2222-2222-2222-222222222222', 'd0000000-0000-4000-8000-000000000001',
   jsonb_build_array(
     jsonb_build_object('stage', 'applied', 'at', to_jsonb(now() - interval '5 days'))
   ));

-- ---------------------------------------------------------------------------
-- Résumé versions
--
-- Two of Alice's, because one base_json rendering differently per market is
-- the whole reason region_profile exists. The second is tailored, so it
-- carries generated_by and a diff -- the constraints refuse a rewrite that
-- has neither.
-- ---------------------------------------------------------------------------
insert into public.resume_versions
  (id, user_id, base_json, tailored_json, diff,
   region_profile, locale, generated_by, pdf_url)
values
  ('e0000000-0000-4000-8000-000000000001',
   '11111111-1111-1111-1111-111111111111',
   jsonb_build_object(
     'basics', jsonb_build_object('name', 'Alice Example'),
     'work', jsonb_build_array(
       jsonb_build_object(
         'name', 'University projects',
         'highlights', jsonb_build_array(
           jsonb_build_object('id', 'b1', 'text',
             'Built a payments reconciliation service handling 2M rows a day'),
           jsonb_build_object('id', 'b2', 'text',
             'Cut p99 latency from 800ms to 120ms by batching writes')
         )
       )
     )
   ),
   null, null, 'uk_ie_cv', 'en-GB', null, null),
  ('e0000000-0000-4000-8000-000000000002',
   '11111111-1111-1111-1111-111111111111',
   jsonb_build_object(
     'basics', jsonb_build_object('name', 'Alice Example'),
     'work', jsonb_build_array(
       jsonb_build_object(
         'name', 'University projects',
         'highlights', jsonb_build_array(
           jsonb_build_object('id', 'b1', 'text',
             'Built a payments reconciliation service handling 2M rows a day'),
           jsonb_build_object('id', 'b2', 'text',
             'Cut p99 latency from 800ms to 120ms by batching writes')
         )
       )
     )
   ),
   jsonb_build_object(
     'basics', jsonb_build_object('name', 'Alice Example'),
     'work', jsonb_build_array(
       jsonb_build_object(
         'name', 'University projects',
         'highlights', jsonb_build_array(
           -- Reordered and re-emphasised, and each line still names the
           -- bullet it came from. A line without source_bullet_id is a
           -- fabricated fact, which is the failure this shape prevents.
           jsonb_build_object('source_bullet_id', 'b2', 'text',
             'Reduced p99 latency 85% on a high-throughput write path'),
           jsonb_build_object('source_bullet_id', 'b1', 'text',
             'Built a reconciliation service processing 2M records daily')
         )
       )
     )
   ),
   jsonb_build_array(
     jsonb_build_object('source_bullet_id', 'b2', 'change', 'reworded', 'accepted', true),
     jsonb_build_object('source_bullet_id', 'b1', 'change', 'reworded', 'accepted', false)
   ),
   'jp_english_cv', 'en-GB', 'resume-tailor@0.1.0', null),
  ('f0000000-0000-4000-8000-000000000001',
   '22222222-2222-2222-2222-222222222222',
   jsonb_build_object('basics', jsonb_build_object('name', 'Bob Example')),
   null, null, 'de_lebenslauf', 'de-DE', null, null);

-- Tier, the résumé that was sent, and the next thing to do. Updates rather
-- than new inserts, so the pipeline fixtures above stay the one place the
-- stage histories are written.
update public.applications
set tier = 'a',
    resume_version_id = 'e0000000-0000-4000-8000-000000000001',
    next_action_at = now() + interval '2 days'
where job_id = 'c0000000-0000-4000-8000-000000000001';

update public.applications
set tier = 'c',
    resume_version_id = 'e0000000-0000-4000-8000-000000000001'
where job_id = 'c0000000-0000-4000-8000-000000000002';

update public.applications
set tier = 'b',
    resume_version_id = 'e0000000-0000-4000-8000-000000000002',
    next_action_at = now() + interval '1 day'
where job_id = 'c0000000-0000-4000-8000-000000000003';

-- The rejected one keeps a null tier on purpose: null is unknown, not C.

update public.applications
set tier = 'b',
    resume_version_id = 'f0000000-0000-4000-8000-000000000001'
where job_id = 'd0000000-0000-4000-8000-000000000001';

-- ---------------------------------------------------------------------------
-- Interviews
--
-- Alice has two rounds on the application that reached 'interview'. The first
-- has a follow-up recorded, the second has not happened yet, which is what
-- makes the 24-hour reminder rule testable.
-- ---------------------------------------------------------------------------
insert into public.interviews
  (id, user_id, application_id, round, scheduled_at, notes, feedback,
   followup_sent_at)
select
  'a1000000-0000-4000-8000-000000000001',
  a.user_id, a.id, 1, now() - interval '3 days',
  'Recruiter screen. Asked why Monzo specifically.',
  'Positive, moving to technical.',
  now() - interval '3 days' + interval '4 hours'
from public.applications a
where a.job_id = 'c0000000-0000-4000-8000-000000000001';

insert into public.interviews
  (id, user_id, application_id, round, scheduled_at, notes)
select
  'a1000000-0000-4000-8000-000000000002',
  a.user_id, a.id, 2, now() + interval '4 days',
  'Technical. System design, one hour.'
from public.applications a
where a.job_id = 'c0000000-0000-4000-8000-000000000001';

-- Bob's interview exists for the same single reason as his application:
-- Alice must never see it, and must not be able to attach anything to it.
insert into public.interviews
  (id, user_id, application_id, round, scheduled_at)
select
  'b1000000-0000-4000-8000-000000000001',
  a.user_id, a.id, 1, now() - interval '1 day'
from public.applications a
where a.job_id = 'd0000000-0000-4000-8000-000000000001';

-- ---------------------------------------------------------------------------
-- Contacts
--
-- One attached to a tracked company, one deliberately not: the Tokyo agency
-- recruiter is most of the Japanese funnel and belongs to no company we
-- research, which is the case a non-null-only foreign key would have made
-- unrepresentable.
-- ---------------------------------------------------------------------------
insert into public.contacts
  (id, user_id, company_id, role_type, name, profile_url, source,
   last_touch_at, sequence_step)
values
  ('c1000000-0000-4000-8000-000000000001',
   '11111111-1111-1111-1111-111111111111',
   'a0000000-0000-4000-8000-000000000001',
   'engineer', 'Priya Raman',
   'https://linkedin.com/in/priya-raman-example',
   'author of the Monzo engineering blog post on ledger sharding',
   now() - interval '6 days', 1),
  ('c1000000-0000-4000-8000-000000000002',
   '11111111-1111-1111-1111-111111111111',
   'a0000000-0000-4000-8000-000000000003',
   'hiring_manager', 'Sato Kenji', null,
   'named as the hiring manager in the job description',
   null, 0),
  ('c1000000-0000-4000-8000-000000000003',
   '11111111-1111-1111-1111-111111111111',
   null,
   'recruiter', 'Tokyo agency recruiter', null,
   'introduced by a former colleague',
   now() - interval '2 days', 2),
  ('d1000000-0000-4000-8000-000000000001',
   '22222222-2222-2222-2222-222222222222',
   'b0000000-0000-4000-8000-000000000001',
   'recruiter', 'Bob Contact', null,
   'replied to a post', null, 0);

-- ---------------------------------------------------------------------------
-- Signals
--
-- One of each severity, and both halves of the provenance pair populated,
-- because the columns are NOT NULL and a rumour is not a signal.
-- ---------------------------------------------------------------------------
insert into public.signals
  (id, user_id, company_id, type, severity, payload, observed_at,
   source_url, generated_by)
values
  ('e1000000-0000-4000-8000-000000000001',
   '11111111-1111-1111-1111-111111111111',
   'a0000000-0000-4000-8000-000000000001',
   'funding', 'info',
   jsonb_build_object('round', 'Series I', 'headline', 'Monzo raises again'),
   now() - interval '10 days',
   'https://example.test/news/monzo-series-i',
   'signal-scanner@0.1.0'),
  ('e1000000-0000-4000-8000-000000000002',
   '11111111-1111-1111-1111-111111111111',
   'a0000000-0000-4000-8000-000000000004',
   'headcount_change', 'warning',
   jsonb_build_object('open_roles_before', 48, 'open_roles_after', 31),
   now() - interval '4 days',
   'https://boards.greenhouse.io/wise',
   'signal-scanner@0.1.0'),
  ('e1000000-0000-4000-8000-000000000003',
   '11111111-1111-1111-1111-111111111111',
   'a0000000-0000-4000-8000-000000000002',
   'hiring_freeze', 'critical',
   jsonb_build_object('scope', 'EMEA engineering', 'reported_by', 'press'),
   now() - interval '1 day',
   'https://example.test/news/stripe-emea-freeze',
   'signal-scanner@0.1.0'),
  ('f1000000-0000-4000-8000-000000000001',
   '22222222-2222-2222-2222-222222222222',
   'b0000000-0000-4000-8000-000000000001',
   'news', 'info',
   jsonb_build_object('headline', 'ACME Bob opens a depot'),
   now() - interval '3 days',
   'https://example.test/news/acme-bob-depot',
   'signal-scanner@0.1.0');

-- ---------------------------------------------------------------------------
-- Competencies
--
-- Two axes, as docs/product-spec.md says to start: coding and system design.
-- Level descriptions are behaviours rather than adjectives, which is the
-- content rule the NOT NULL columns only half enforce.
-- ---------------------------------------------------------------------------
insert into public.competencies
  (id, user_id, axis, sub_skill, level_junior, level_mid, level_senior)
values
  ('11100000-0000-4000-8000-000000000001',
   '11111111-1111-1111-1111-111111111111',
   'coding', 'data structures and algorithms',
   'Can implement a correct solution to a well-specified problem and say what it costs',
   'Chooses a structure from the access pattern and justifies it against two alternatives',
   'Recognises when the standard answer is wrong for this workload and can show why'),
  ('11100000-0000-4000-8000-000000000002',
   '11111111-1111-1111-1111-111111111111',
   'coding', 'testing',
   'Writes tests that fail before the fix and pass after it',
   'Picks the layer a behaviour should be tested at and keeps the suite fast',
   'Designs code so the expensive failure modes are the cheap ones to test'),
  ('11100000-0000-4000-8000-000000000003',
   '11111111-1111-1111-1111-111111111111',
   'system_design', 'caching and degradation',
   'Can add a cache and say what happens when it is cold',
   'Can design and ship a service with caching and a documented degradation path',
   'Can say which guarantee is being traded away and what the business cost of that is'),
  -- Deliberately left with no evidence: the radar must read this as unknown
  -- rather than as zero.
  ('11100000-0000-4000-8000-000000000004',
   '11111111-1111-1111-1111-111111111111',
   'system_design', 'data modelling',
   'Can normalise a schema and explain why a column was not added',
   'Derives what can be derived and justifies what is stored',
   'Designs for the migration that has not been needed yet'),
  ('22200000-0000-4000-8000-000000000001',
   '22222222-2222-2222-2222-222222222222',
   'debugging', 'reading unfamiliar code',
   'Can find where a value comes from',
   'Can bisect a failure to a change',
   'Can rule out whole subsystems from the shape of the symptom');

-- ---------------------------------------------------------------------------
-- Evidence
--
-- One of each interesting shape: traceable to a row in another table,
-- traceable to nothing, and scored by a model.
-- ---------------------------------------------------------------------------
insert into public.evidence
  (id, user_id, competency_id, source_type, source_id, score, weight,
   observed_at, generated_by)
values
  -- Real interview feedback, pointing at the seeded interview record. The
  -- heaviest source, and a human wrote the score.
  ('11110000-0000-4000-8000-000000000001',
   '11111111-1111-1111-1111-111111111111',
   '11100000-0000-4000-8000-000000000003',
   'interview_feedback', 'a1000000-0000-4000-8000-000000000001',
   0.7, 1.0, now() - interval '3 days', null),
  -- A mock interview. Scored against a rubric by a model, so it carries
  -- provenance -- the constraint refuses it otherwise.
  ('11110000-0000-4000-8000-000000000002',
   '11111111-1111-1111-1111-111111111111',
   '11100000-0000-4000-8000-000000000003',
   'mock_interview', null,
   0.55, 0.6, now() - interval '20 days', 'mock-interviewer@0.1.0'),
  -- A self-assessment: the lightest source, and the one with no row anywhere
  -- to point at, which is why source_id is nullable (ADR-0008).
  ('11110000-0000-4000-8000-000000000003',
   '11111111-1111-1111-1111-111111111111',
   '11100000-0000-4000-8000-000000000001',
   'self_assessment', null,
   0.8, 0.1, now() - interval '60 days', null),
  ('22220000-0000-4000-8000-000000000001',
   '22222222-2222-2222-2222-222222222222',
   '22200000-0000-4000-8000-000000000001',
   'project', null,
   0.6, 0.5, now() - interval '5 days', null);
