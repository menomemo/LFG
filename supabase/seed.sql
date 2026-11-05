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

-- Alice's pipeline. Timestamps are relative to now() so the ghost case stays
-- ghosted however long after seeding the stack is started.
insert into public.applications (user_id, company_name, role_title, region, stage_history)
values
  (
    '11111111-1111-1111-1111-111111111111',
    'Monzo', 'Backend Engineer, Graduate', 'uk',
    jsonb_build_array(
      jsonb_build_object('stage', 'saved',     'at', to_jsonb(now() - interval '30 days')),
      jsonb_build_object('stage', 'applied',   'at', to_jsonb(now() - interval '26 days')),
      jsonb_build_object('stage', 'interview', 'at', to_jsonb(now() - interval '3 days'))
    )
  ),
  (
    '11111111-1111-1111-1111-111111111111',
    'Stripe', 'Software Engineer, New Grad', 'ie',
    jsonb_build_array(
      jsonb_build_object('stage', 'saved',   'at', to_jsonb(now() - interval '45 days')),
      jsonb_build_object('stage', 'applied', 'at', to_jsonb(now() - interval '40 days'))
    )
  ),
  (
    '11111111-1111-1111-1111-111111111111',
    'Mercari', 'AI Engineer', 'jp',
    jsonb_build_array(
      jsonb_build_object('stage', 'saved',      'at', to_jsonb(now() - interval '12 days')),
      jsonb_build_object('stage', 'applied',    'at', to_jsonb(now() - interval '9 days')),
      jsonb_build_object('stage', 'assessment', 'at', to_jsonb(now() - interval '2 days'))
    )
  ),
  (
    '11111111-1111-1111-1111-111111111111',
    'Wise', 'Platform Engineer', 'ee',
    jsonb_build_array(
      jsonb_build_object('stage', 'saved',    'at', to_jsonb(now() - interval '60 days')),
      jsonb_build_object('stage', 'applied',  'at', to_jsonb(now() - interval '55 days')),
      jsonb_build_object('stage', 'rejected', 'at', to_jsonb(now() - interval '50 days'))
    )
  );

-- Bob's row exists for exactly one reason: Alice must never see it.
insert into public.applications (user_id, company_name, role_title, region, stage_history)
values
  (
    '22222222-2222-2222-2222-222222222222',
    'ACME Bob Ltd', 'Staff Engineer', 'de',
    jsonb_build_array(
      jsonb_build_object('stage', 'applied', 'at', to_jsonb(now() - interval '5 days'))
    )
  );
