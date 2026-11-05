# Deployment

|                   |                                    |
| ----------------- | ---------------------------------- |
| **Status**        | Walking skeleton, not yet deployed |
| **Last reviewed** | 2026-11-05                         |

What runs where, how to get it there, and the two things that will bite.

Deploying this early is deliberate. There is one page and one table, so when something
breaks there are very few places it can be. Leave the first deployment until there are
fourteen more tables and a board, and the first deployment becomes an investigation.

## What goes where

| Piece          | Host                          | Why                                                                                                                        |
| -------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `apps/web`     | Netlify                       | A plain Next.js app, so the host is a configuration choice rather than a dependency. Vercel is the alternative; see step 5 |
| Database, auth | Supabase Cloud                | Same Postgres, same RLS policies, same migrations as local ([ADR-0002](adr/0002-use-supabase-as-the-primary-datastore.md)) |
| Migrations     | Applied by `supabase db push` | The files in `supabase/migrations/` are the only way the schema ever changes                                               |

`packages/core` is not deployed separately. Next transpiles it into the web build
(`transpilePackages` in `apps/web/next.config.ts`).

> [!CAUTION]
> **Never let `supabase/seed.sql` reach a real database.** It creates two accounts whose
> password is committed to this repository. `db push` excludes seeds unless someone passes
> `--include-seed`, and `db reset` is local unless someone passes `--linked` — both are one
> flag away from a mistake that cannot be taken back once the database has real users.
>
> The file now refuses to run unless the database's JWT secret is the published local
> default, so it fails closed on any cloud project. That guard is a backstop, not a licence
> to be careless with the flags.

## Prerequisites

Two accounts, both free for this. Sign in to each with GitHub so there is one identity to
manage:

- [Supabase](https://supabase.com) — free tier includes two projects
- [Netlify](https://netlify.com) — the free plan covers a personal project

## Steps

### 1. Push the repository

Netlify deploys from GitHub, so the code has to be there first.

```bash
git push -u origin main
```

### 2. Create the Supabase project

In the dashboard: **New project**.

- **Region** — London (`eu-west-2`). Pick the region closest to where the users are, since
  every query pays the round trip. The author and the first wave of users are in the UK
  and Ireland.
- **Database password** — generate one and put it in a password manager. You need it in
  step 3, and Supabase will not show it again.

### 3. Apply the migrations

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push --remote
```

The project ref is in the project URL: `supabase.com/dashboard/project/<ref>`.

`db push --remote` applies every file in `supabase/migrations/` in order, and nothing else.
It does not load seeds. Check it before trusting it:

```bash
npx supabase db push --remote --dry-run
```

It should list `20261104120000_create_applications.sql` and no seed file.

### 4. Create your own account

The sign-in page has no sign-up form — there is nothing to sign up _to_ yet, and an open
registration form on a half-built product is a liability rather than a feature. So create
the first account by hand:

**Authentication → Users → Add user**, with _Auto Confirm User_ ticked. Without that tick
Supabase sends a confirmation email and the account cannot sign in until someone clicks it.

Your production database now has your account and no applications. The page will show its
empty state, which is correct — the seeded applications are local fixtures and must stay
that way.

### 5. Deploy to Netlify

> [!NOTE]
> Vercel was the first choice — it makes Next.js and would have been the
> smoothest fit. Its fraud detection flagged the account during signup and the
> recovery form had not cleared it a day later, so we moved rather than wait.
> Nothing in the codebase changed to make that possible, which is the useful
> part: `apps/web` is a plain Next.js app and `packages/core` depends on no
> host, so switching cost a configuration file. The Vercel steps are kept at
> the end of this section in case the account is ever unblocked.

**Add new site → Import an existing project**, pick the GitHub repository, then
set exactly two things:

| Setting           | Value           | Why                                                                                                                                                                                                                                                                                  |
| ----------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Base directory    | **leave empty** | Netlify installs dependencies and runs the build from here. This is an npm workspaces monorepo, so the lockfile and the workspace definitions are at the repository root; installing anywhere else cannot resolve them ([ADR-0006](adr/0006-use-npm-workspaces-for-the-monorepo.md)) |
| Package directory | `apps/web`      | How Netlify finds the app. It can only be set in the UI, which is why it is not in `netlify.toml`                                                                                                                                                                                    |

Everything else comes from [`apps/web/netlify.toml`](../apps/web/netlify.toml): the build
command, the publish directory, and the decision not to pin the Next.js runtime. Node
version comes from the root `.nvmrc`.

> [!WARNING]
> **Pointing the base directory at `apps/web` is the usual way this setup
> fails.** It is the older advice and still widely repeated. npm then installs
> inside a package that has no lockfile, workspace resolution breaks, and the
> failure usually surfaces somewhere misleading — a missing dependency, or the
> `prepare` script erroring on husky.

Then **Project configuration → Environment variables**, before the first build:

| Name                        | Value                                    |                                                                                                                                                                                                        |
| --------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `SUPABASE_URL`              | Project Settings → API → Project URL     |                                                                                                                                                                                                        |
| `SUPABASE_ANON_KEY`         | Project Settings → API → anon public key | Safe in a browser: it carries no permissions of its own, and RLS decides what it can read                                                                                                              |
| `SUPABASE_SERVICE_ROLE_KEY` | **Do not set this**                      | It bypasses RLS entirely. Nothing in `apps/web` reads it, and a web app that can reach it is a web app that can leak every user's data ([ADR-0002](adr/0002-use-supabase-as-the-primary-datastore.md)) |

Deploy. Then open the URL and sign in with the account from step 4.

**The compatibility risk, now settled.** Netlify's Next.js runtime documents support for
13.5 and later and says it tests every stable release, but does not name 16, which is what
this project is on. The first build is what settles it, and on 2026-11-05 it built and
served correctly. The fallbacks stay recorded in case a future runtime release regresses:
pin Next to the latest 15.x, which costs nothing here because nothing uses a 16-only
feature; or move to a host that runs a plain Node server, such as Render or Railway.

<details>
<summary>Vercel, if the account is ever unblocked</summary>

**Add New → Project**, import the repository, then:

| Setting                 | Value                                                                                           |
| ----------------------- | ----------------------------------------------------------------------------------------------- |
| Root Directory          | `apps/web`                                                                                      |
| Framework Preset        | Next.js (detected)                                                                              |
| Build / Install command | leave as detected — Vercel installs at the repository root because it recognises npm workspaces |

Note that Vercel wants the app directory as its Root Directory while Netlify wants the
repository root as its base. They are opposite settings for the same monorepo, which is
worth knowing before copying one host's instructions into the other.

Environment variables are the same three rules as above.

</details>

### 6. Check what you actually deployed

Three things, in order — each one tells you something different:

1. **The page loads and you can sign in.** The build, the environment variables and auth
   all work.
2. **The list is empty.** Correct, and worth pausing on: if you see Monzo and Stripe, the
   seed reached production. Delete those rows and the test accounts immediately, then work
   out which command did it.
3. **Open the deployed site in a private window.** You should land on the sign-in page.
   That is RLS doing its job on a real database rather than on a laptop.

## Afterwards

Every push to `main` deploys automatically. A pull request gets its own preview URL, which
is the useful half: you can look at a change before it is on the real site.

Schema changes are not automatic and should not be. The sequence is: write the migration,
test it locally with `npm run db:reset`, commit it, then `npx supabase db push --remote`.
Code deploys on push; the database changes when you say so.

**Rolling back.** Netlify keeps every previous deploy — _Deploys → the one you want →
Publish deploy_ puts it back in seconds. Migrations do not roll back that way, which
is the asymmetry to design around: a migration that drops a column cannot be undone by
redeploying the old code. This is why [code-standards.md](code-standards.md) requires a
written rollback plan in the pull request for any destructive migration.

Do a rollback once, on purpose, while nothing is wrong. A procedure first performed during
an incident is not a procedure.

## If it breaks

| Symptom                                                     | Cause                                                                                                                                                                  |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Missing environment variable SUPABASE_URL`                 | Set in Netlify but not redeployed — a variable added after a build does not reach the running site                                                                     |
| Build fails resolving `@lfg/database`                       | `supabase/database.types.ts` sits outside `apps/web`, reached by a path alias. Check that the base directory is empty, so install and build run at the repository root |
| Sign-in says invalid credentials                            | The account was created without _Auto Confirm User_, so it is waiting on an email                                                                                      |
| Every path returns 401, with a page titled _Login Redirect_ | Netlify visitor access, not our code — the request never reaches the app. _Project configuration → General → Visitor access → Project visibility_, set **Public**      |
| The list is empty when it should not be                     | Expected on a new project. If it is empty for an account that has rows, RLS is refusing them — check `user_id` on those rows                                           |
| Page loads locally, 500 in production                       | Read the Netlify logs (_Deploys → the deploy → Functions_), not the browser. The error is server-side                                                                  |

## Not set up yet

| Missing                                    | Matters when                                                                                   |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| A custom domain                            | Launch ([launch.md](launch.md))                                                                |
| Error tracking and uptime monitoring       | Phase 5 — until then, failures are found by looking                                            |
| A staging environment                      | When a broken deploy would cost something                                                      |
| Automatic migrations in CI                 | Deliberately manual: an automatic migration against production is how you lose a column at 2am |
| Database backups verified by restoring one | Before there is any data worth keeping                                                         |
