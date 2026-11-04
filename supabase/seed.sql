-- Local development seed. Never runs against anything but a local stack.
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
