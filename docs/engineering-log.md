# Engineering log

|                   |                                        |
| ----------------- | -------------------------------------- |
| **Status**        | Active                                 |
| **Last reviewed** | 2026-11-05                             |
| **Covers**        | 2026-11-04 onward, Phase 0 and Phase 1 |

What actually went wrong, what was done about it, and what would be done differently.

[learning-track.md](learning-track.md) sets the test for whether something was learned:
_could you defend the decision to a sceptical interviewer, including the cost?_ That
document says which topics each phase is an instance of. This one is the evidence — the
incidents themselves, written in the shape that question demands.

Nothing here is hypothetical. Every entry is something that happened in this repository,
with the signal that exposed it. Several of them look, in hindsight, like mistakes that
should have been obvious. They were not obvious at the time, and that is the point: the
useful part of an incident is the signal, not the fix.

**How to read an entry.** Each one has the same five parts.

| Part                     | What it answers                                           |
| ------------------------ | --------------------------------------------------------- |
| **Signal**               | What made it visible. Usually the most transferable part  |
| **Cause**                | The actual mechanism, not the symptom                     |
| **Fix**                  | What was done, and what the technique is                  |
| **Why it was like that** | The original decision, taken seriously rather than mocked |
| **Next time**            | What changes, stated as a rule rather than a resolution   |

---

## 1. Tenancy and data isolation

The product holds one person's job search. The failure that ends it is one user reading
another user's applications. Everything in this section is about making that structurally
impossible rather than carefully avoided.

### 1.1 The enforcement point is the database, not the query

> **Lesson: "the application filters by `user_id`" is not a tenancy model. It is a promise
> that every future query will remember.**

- **Signal.** Writing the first query in `apps/web/app/page.tsx` and noticing there was
  nothing stopping the second query, or the fiftieth, from omitting the filter.
- **Cause.** Filtering in application code makes correctness a property of every call site.
  There is no central place to check, and the failure is silent — a query missing its
  filter returns _more_ data, not an error.
- **Fix.** Postgres **row-level security**: policies attached to the table that rewrite
  every query to exclude rows the current token does not own. `enable row level security`
  plus `force row level security`, so not even the table owner bypasses it. The web app
  authenticates as the signed-in user, so the database — not the page — decides what the
  request may see. Recorded as ADR-0002.
- **Why it was like that.** It never was; this was decided before the first migration. The
  entry exists because the reasoning is the interesting part, not the outcome.
- **Next time.** Same, and the rule is now in `CLAUDE.md`: RLS goes in the **creating**
  migration, never a follow-up. A table that exists for one commit without policies is a
  table someone can query in that commit.

### 1.2 A test that proved nothing

> **Lesson: a test that cannot fail is worse than no test, because it occupies the place
> where a real test would go.**

- **Signal.** Reading a rewritten isolation test closely while changing something else,
  and noticing the assertion would hold even if the query had errored.
- **Cause.** The test queried a column that a later migration had dropped. PostgREST
  returned an error and `data: null`. The assertion read:

  ```ts
  const names = (data ?? []).map(row => row.company_name);
  expect(names).not.toContain('ACME Bob Ltd');
  ```

  `data ?? []` turned the failure into an empty array, and an empty array contains nothing,
  so the test passed. It had been passing while proving nothing.

- **Fix.** Assert that `error` is null **before** asserting anything about `data`, and
  sweep the whole file for the same shape. The isolation suite also asserts the _positive_
  case — that a legitimate write succeeds — so that a policy which refuses everything
  cannot pass as a policy that refuses the right things.
- **Why it was like that.** `?? []` is a reflex for satisfying a type checker that knows
  `data` may be null. The type system was happy; the test was meaningless. Type safety and
  test validity are different properties and neither implies the other.
- **Next time.** In any test against a real datastore, the first assertion is on the error
  channel. A null-coalescing operator in a test is a smell: it is usually converting a
  failure into a passing shape.

### 1.3 RLS hides the evidence that RLS has failed

> **Lesson: when a security control filters what you can see, you cannot use what you see
> to audit that control.**

- **Signal.** About to confirm "the seed data never reached production" by signing in and
  observing an empty list, and realising the observation could not distinguish the two
  cases it was meant to separate.
- **Cause.** RLS filters by the signed-in user. If the seed had run in production, Alice's
  and Bob's rows would belong to Alice and Bob — and would therefore be **invisible** to the
  author's account. An empty list is exactly what both a clean database and a contaminated
  one look like from inside the application.
- **Fix.** Verify from a vantage point the control does not apply to: the Supabase SQL
  editor runs as `postgres` and bypasses RLS, and `supabase inspect db table-stats --remote`
  reads planner statistics rather than running a filtered query. Both reported zero rows.
- **Why it was like that.** The suggested check was the obvious one, and obvious checks are
  where this class of error lives. The mistake was reaching for the easiest observation
  rather than asking what the observation could distinguish.
- **Next time.** Before accepting a verification, ask what it would look like if the thing
  being tested were false. If the answer is "the same", it is not a verification.

### 1.4 Development fixtures must be unable to reach production

> **Lesson: a rule that depends on nobody running the wrong command is not a control.**

- **Signal.** `supabase/seed.sql` contains a committed password and invented companies, and
  the same CLI that applies migrations can apply seeds.
- **Cause.** Nothing structural separated "the database I can break" from "the database
  with real data in it". Only the operator's attention did.
- **Fix.** A **fail-closed guard** at the top of the seed file: it refuses to run unless the
  database's JWT secret equals the published default that only a local stack has. Verified
  in both directions — it runs locally, and it refuses when the secret differs. The property
  this gives is that the dangerous path requires an active, deliberate act to unlock,
  whereas the safe path is the default.
- **Why it was like that.** Seed files are conventionally treated as developer conveniences,
  and the convention does not come with a safety mechanism.
- **Next time.** Any artefact that would be destructive in the wrong environment carries its
  own refusal, keyed on something only the correct environment has. `--dry-run` output is
  now read for `"seeds": []` before every production push.

---

## 2. Tests you can trust

> Every incident in this section passed CI at the moment it was wrong.

### 2.1 A CI check that could never pass

> **Lesson: a check nobody has seen go red has not been shown to work.**

- **Signal.** Adding a CI step that regenerates `supabase/database.types.ts` and fails on
  any difference — then realising it would fail on a clean checkout.
- **Cause.** The committed file carried a header comment and had been formatted by
  Prettier. The generator emitted neither. `git diff --exit-code` compared a formatted file
  against raw output and would always differ, so the check would have failed on every run
  including the correct ones.
- **Fix.** `scripts/gen-db-types.mjs` makes generation byte-reproducible by adding the
  banner during generation, and the file is listed in `.prettierignore` so Prettier cannot
  reformat it afterwards. Verified by generating three times and comparing SHA-256 hashes.
- **Why it was like that.** The check was written to describe an intent — _types must match
  migrations_ — without running the two halves against each other first.
- **Next time.** A new check is not finished until it has been observed failing for the
  right reason and passing for the right reason. Both, deliberately provoked.

### 2.2 Correctness tests are blind to latency

> **Lesson: a fully green pipeline and an unusable product are not contradictory.**

- **Signal.** The author used the deployed board for the first time and reported that moving
  a card felt slow. Nothing in the repository had any opinion about this.
- **Cause.** 242 unit tests run in about 140 ms because they touch no network. The 55
  isolation tests run against a local Docker stack with no meaningful latency. Every test
  asked _is the result correct_; none asked _how long did the user wait_. Both questions are
  legitimate and the suite only covered one.
- **Fix.** Not a test — see §4.1 for the change. The relevant point here is how it surfaced:
  one person, one real network, one click.
- **Why it was like that.** Tests are written against the properties the author is thinking
  about, and during construction those are correctness properties.
- **Next time.** Treat "a human used it for real" as a distinct gate, not a formality after
  the tests pass. `roadmap.md` already encodes this — every gate is a usage gate, and _the
  feature exists_ does not pass one — which is the right instinct written down before there
  was any evidence for it.

### 2.3 Tests that can silently skip are tests you do not have

> **Lesson: make the dangerous default impossible rather than documenting it.**

- **Signal.** The isolation suite needs a running database, and the natural shape is to skip
  when the connection details are missing.
- **Cause.** A skipped test reports as success. The one suite that could catch a data leak
  would have gone quiet exactly when the environment was misconfigured.
- **Fix.** `supabase/tests/rls.test.ts` **throws** if `SUPABASE_URL` or `SUPABASE_ANON_KEY`
  is absent, with a message naming the command that sets them. It runs as its own suite,
  `npm run test:db`, so the offline unit tests stay offline and fast.
- **Why it was like that.** Conditional skipping is the common pattern, and it is correct for
  optional integration tests. It is wrong for the test that is the security control.
- **Next time.** Classify each suite as optional or required when it is written. A required
  suite fails loudly rather than skipping.

---

## 3. Schema evolution against a running system

### 3.1 Derived state instead of stored state

> **Lesson: storing a value you could compute buys speed and sells history.**

- **Decision.** `applications` has no `stage` column. Stage lives in `stage_history`, an
  append-only JSONB array; `currentStage()` in `packages/core` derives the current value, and
  `daysInCurrentStage()` and `isGhosted()` derive from the same array.
- **What it buys.** Every conversion rate in the product — applied to interview, interview
  to offer, how long an application sits, who went quiet — is computable, retroactively,
  from data already recorded. None of it has to be anticipated.
- **What it costs.** Moving a stage is read-modify-write: read the array, append, write it
  back. Two round trips where a `stage` column would need one. See §4.1, where that cost
  arrived.
- **Why it was like that.** A mutable `stage` column destroys information at the moment of
  writing, and the information it destroys is the only reason to build this product rather
  than use a spreadsheet.
- **Next time.** Same decision, held more explicitly: the cost is a read before every write
  and it should be stated in the ADR as a latency budget, not discovered later as a
  complaint.

### 3.2 A backfill that would never have run

> **Lesson: test a migration in the order the tooling will actually apply it.**

- **Signal.** Reviewing `20261105093000_normalise_applications_onto_jobs.sql` and asking
  what data it would see during `npm run db:reset`.
- **Cause.** Under a reset, migrations run **before** seeds. The backfill was written to
  move data that, in that ordering, does not exist yet. It was correct for a production
  database with real rows and a no-op everywhere it would normally be exercised — which
  means it would have been first executed, untested, against production.
- **Fix.** Tested inside a transaction against hand-built old-shape rows, including both
  designed-for edge cases, then rolled back. The backfill also correlates rows through a
  temporary `migration_source_application_id` column rather than matching on
  company-plus-title-plus-region, because that tuple is not unique and a near-match would
  silently attach an application to the wrong job.
- **Why it was like that.** `db reset` is the usual way to exercise a migration, and it is
  the one path that cannot exercise a backfill.
- **Next time.** A migration containing a backfill gets an explicit test against realistic
  prior-state data. "It ran without error" is not evidence that it did anything.

### 3.3 Code and schema deploy on different clocks

> **Lesson: a destructive migration opens a window in which the running code is wrong.**

- **Signal.** Planning the order of merging PR #1 — which dropped `company_name`,
  `role_title` and `region` from `applications` — against pushing its migrations.
- **Cause.** Code deploys automatically on merge; migrations are pushed manually. Push the
  migration first and the live page reads columns that no longer exist. Merge the code first
  and it queries tables that do not yet exist. **Both orders break, in different directions.**
- **Fix.** For this project, right now, the window was accepted deliberately: schema first,
  code immediately after, with the exposure stated in the PR rather than discovered. Schema
  first because a deploy rolls back in seconds and a dropped column does not.
- **The technique for when it matters: expand–contract.** Split the change in two. First an
  additive migration — add the new structure, backfill, change nothing the old code reads.
  Deploy the code that uses the new structure. Only then a second migration that removes the
  old columns. At no point is any deployed version of the code looking at a schema it does
  not understand.
- **Why it was like that.** With zero users and an empty table, the two-step dance costs
  more than it saves. The mistake available here was not skipping it; it was skipping it
  without naming it.
- **Next time.** Expand–contract becomes mandatory at the first real user. Until then, any
  destructive migration states its exposure window in the PR description.

---

## 4. Architecture: what each choice bills you for

### 4.1 The server owns the truth, and the bill is a round trip per write

> **Lesson: the property that makes an architecture simple is usually the same property
> that makes it slow. Know which one you bought.**

- **Signal.** First real use: "按下确认键之后,它会过一会儿才会出现" — after confirming a
  stage change, the card takes a noticeable moment to appear in its new lane.
- **Cause.** One move costs five to six **serial** network round trips, and the UI shows
  nothing until all of them finish:

  | #   | Step                                                                        | Crosses the network |
  | --- | --------------------------------------------------------------------------- | ------------------- |
  | 1   | Browser posts the server action to Netlify                                  | ✅                  |
  | 2   | `supabase.auth.getUser()` — a request to the auth server, not a cookie read | ✅                  |
  | 3   | `SELECT stage_history`                                                      | ✅                  |
  | 4   | `UPDATE applications`                                                       | ✅                  |
  | 5   | `revalidatePath('/')` re-renders the page, calling `getUser()` **again**    | ✅                  |
  | 6   | The re-render's nested `applications + jobs + companies` query              | ✅                  |
  | 7   | New RSC payload streams back                                                | ✅                  |

  They are serial because each genuinely depends on the previous one. Three separate things
  contribute, and they are worth separating:

  1. **An inherent cost of the design** (§3.1): append-only history means read-then-write.
  2. **Plain waste**: `getUser()` runs twice in one request cycle, verifying the same token
     against the same server.
  3. **The architecture's own trade** — React Server Components have no concept of patching
     one row in the UI. The server re-renders the whole tree and ships it. Changing one card
     re-queries every application.

- **Fix — optimistic update.** The UI assumes the operation will succeed and moves the card
  immediately, then reconciles when the server answers; on refusal it reverts and shows the
  error. React 19's `useOptimistic` does this directly. The data path is untouched and just
  as slow; what changes is that nobody waits for it.
- **Why this fix and not another.** The alternatives each sell something the project
  deliberately bought:

  | Alternative                                          | What it costs                                                                                                           |
  | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
  | Store `stage` as a column                            | Destroys the conversion-rate history (§3.1)                                                                             |
  | Append inside a Postgres function                    | Puts the "is this move legal" rule in SQL — business logic outside `core`, violating ADR-0003, and untestable as a unit |
  | Move Supabase closer to the edge                     | Saves milliseconds per hop, removes no hops                                                                             |
  | Hand-manage client state instead of `revalidatePath` | Reintroduces client/server divergence, which is the problem server components exist to remove                           |

  Optimistic update is the only option that sacrifices none of them.

- **The part worth remembering.** Optimistic UI is only honest when the client can predict
  the server's answer. Here it can: `movesFrom(stage)` decides which moves are offered, and
  the server validates with **the same function**, because `packages/core` is pure and runs
  in both places. **ADR-0003 — no framework, no I/O, no clock inside `core` — is what made
  the write slow and is also what makes the fix safe.** The same rule is the bill and the
  cure.
- **Why it was like that.** The board shipped with a select-and-a-button, deliberately:
  it works without JavaScript, without a pointer, and without a drag-and-drop library. That
  was a reasonable first step and the reasoning is in the component. The actual error was
  adjacent — see §5.3.
- **Next time.** Any interaction a user will perform many times a day gets an explicit
  answer to "what does the user see in the first 100 ms". For a server-component
  architecture the answer is almost always optimistic state, and that should be the default
  for mutations rather than a later repair.

### 4.2 Choosing boring on purpose: npm workspaces over pnpm

> **Lesson: pick the dependency manager that the hardest future consumer tolerates, not the
> one that is best today.**

- **Decision.** npm workspaces, not pnpm, recorded as ADR-0006.
- **Reasoning.** pnpm's symlinked `node_modules` is faster and stricter. React Native's
  Metro bundler has a long history of trouble resolving through symlinks, and Expo arrives
  in Phase 1. The cost of being wrong is not slow installs; it is a bundler that cannot
  resolve a workspace package, debugged under time pressure in an unfamiliar toolchain.
- **Next time.** Same. The question "what breaks for the consumer I have not written yet"
  is worth asking before the tooling choice hardens.

### 4.3 Enforcing a style guide without adopting its tooling

> **Lesson: a standard you enforce with your own configuration is a standard you can
> explain.**

- **Decision.** Google TypeScript Style as the baseline, implemented as this project's own
  ESLint flat config plus Prettier, rather than adopting `gts`. ADR-0007.
- **Reasoning.** `gts` bundles a compiler config, a linter config and a formatter behind one
  dependency. The project needs `strict` plus `noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes` and `noImplicitOverride`, and needs the ADR-0003 boundary
  rules — which are specific to this repository and cannot come from a shared preset.
- **The part that mattered.** Because the config is local, the boundary rules live beside
  the style rules: `packages/core` is forbidden from importing a framework, a Supabase
  client, or `process`, and from calling `new Date()` or `fetch`. **The boundary is checked
  by a machine rather than remembered by a reviewer.** It was verified by writing a file that
  violated it on purpose and confirming seven errors, then deleting the file.
- **Next time.** Same. A boundary that is only in a document is a boundary that erodes.

### 4.4 Two animations on the same property, and neither one finishes

> **Lesson: when a library animates by measuring the DOM, a stylesheet that animates the
> same property is not decoration — it is an input to that measurement.**

- **Signal.** The page went white and the console said "maximum update depth exceeded",
  every time a card was dragged out of a lane that had other cards in it. A single card in
  a lane was fine, which is what made it look like a data problem rather than a rendering
  one.
- **Cause.** Two, and the first hid the second. dnd-kit animates a card that has changed
  position by measuring it in a layout effect, deriving a transform from where it used to
  be, and storing that in state. A `transition: transform` rule had been added to the same
  element to make cards slide: the measurement therefore read a rectangle that was still
  moving, derived a new transform from it, re-rendered and measured again. Removing the
  rule did not fix it, because moving a card to a different sortable list triggers the same
  derivation on every card whose index changed.
- **Fix.** `animateLayoutChanges: () => false` on the sortable hook, which turns off that
  derivation entirely, and the stylesheet rule deleted. Nothing was lost: the cards sliding
  out of the way during a drag are animated by the sorting strategy, which is a different
  mechanism, and that is the animation anyone actually sees.
- **Why it was like that.** The brief asked for the transforms to be transitioned so that
  cards slide rather than snap, and a CSS transition is the obvious way to transition
  something. It is the right instinct for an element whose position the browser owns, and
  the wrong one for an element whose position a library is measuring.
- **Next time.** Before styling an element a drag library controls, find out how it
  animates. If it measures, the stylesheet does not get to animate the same property — and
  a render loop in a layout effect is the symptom to expect.
- **Found the same day.** The same component rendered `aria-describedby` differently on the
  server and in the browser, because dnd-kit names that element from a counter that starts
  at zero in each process. A hydration error on every load, fixed by giving the context a
  fixed `id`. Worth its own line only because it was invisible: the page looked correct,
  and the attribute that was wrong is one only a screen reader reads.

---

## 5. Process as a safety net

> Every entry in this section is a mistake that discipline, not cleverness, would have
> prevented.

### 5.1 Stacked pull requests and rebase-merge do not compose

> **Lesson: understand what your merge strategy does to commit identity before you build a
> dependency chain on top of it.**

- **Signal.** Merging the first of six stacked PRs with `--delete-branch`, then finding the
  second **closed** rather than retargeted, and the rest conflicting.
- **Cause.** Two mechanisms compounding.
  1. **Deleting a merged head branch that is another PR's base makes GitHub close that PR.**
     It does not retarget it, and a closed PR whose base branch no longer exists **cannot be
     reopened**.
  2. **Rebase-merge replays commits with new SHAs.** Every branch stacked above still
     contains the old SHAs, so each merge invalidates the next branch in the chain. This
     would have happened even without the branch deletion.
- **Fix.** Rebuild each branch independently on `main`. `git rebase` drops patch-equivalent
  commits automatically, so each rebased branch carried only its own three commits with an
  unchanged diff. Pushed under new names rather than force-pushed, which also kept the
  original branches intact as a fallback. Five pull requests, five merges, no work lost.
- **Why it was like that.** Stacking is the right way to keep six migrations reviewable in
  sequence; the chosen merge strategy was simply incompatible with it, and the two decisions
  were made at different times by different parties without anybody holding both.
- **Next time.** Either keep pull requests independent off `main`, or use merge commits for
  a stack. Never `--delete-branch` while another PR points at that branch. Where a stack is
  genuinely wanted, a tool that understands stacks is a better answer than care.

### 5.2 CI was advisory, not enforcing

> **Lesson: a check that can be skipped by accident will be.**

- **Signal.** `gh pr merge` landed a pull request while its `Row-level security isolation`
  job was still running. Twice.
- **Cause.** The repository had no branch protection, so GitHub had no reason to refuse.
  Every pull request up to that point happened to be green; nothing guaranteed it.
- **Fix.** Branch protection on `main` requiring four checks, pull requests with zero
  required approvals — a single-maintainer repository deadlocks on the default of one — and
  `enforce_admins` on, so the rule binds the author too. Netlify's deploy-preview checks are
  deliberately **not** required: one of them reports `NEUTRAL`, which would block every merge
  forever. Verified by reading back `repos/:owner/:repo/branches/main/protection` rather than
  trusting the form.
- **Why it was like that.** Protection is not on by default, and with one maintainer the
  absence is invisible until something slips through.
- **Next time.** Branch protection is part of repository setup, configured at the same time
  as CI — not after CI has already been bypassed. And a required check must be one that
  always reports a conclusion.

### 5.3 Marking something shipped against a definition it did not meet

> **Lesson: "done" means done against the written definition, not against what was built.**

- **Signal.** The author asked for drag-and-drop. `roadmap.md` already said
  _"Application board with **drag-to-stage** and append-only `stage_history`"_, and
  `product-spec.md` listed drag as MVP scope — while `progress.md` had already marked the
  item ✅.
- **Cause.** The board shipped with a select-and-submit control, for good reasons that are
  written in the component. The error was flipping the status to ✅ against what had been
  built rather than against the item's own definition.
- **Fix.** The status returns to 🚧 until drag-to-stage exists. The deliberate choice to ship
  the keyboard-accessible control first stays, and stays documented; it simply does not
  complete the item.
- **Why it was like that.** The status was updated by whoever finished the work, at the
  moment of finishing it, against their own memory of the scope.
- **Next time.** Flipping a status requires re-reading the item's definition in `roadmap.md`
  or `product-spec.md`. `CLAUDE.md` already says _nothing is marked shipped until it is
  actually usable_; the gap was reading the sentence as being about quality when it is also
  about scope.

### 5.4 Documents drift from themselves

> **Lesson: a structural check cannot detect drift in meaning. Check for the cause instead.**

- **Signal (one).** The author read the repository and found `README.zh-CN.md` describing a
  state the project had left — _"the only package is `packages/core`"_ — after `README.md`
  had gained setup steps. A structural comparison of headings, table rows and links matched
  exactly. **Only reading both could have caught it.**
- **Fix (one).** Stop trying to detect the drift and detect its cause: a CI job that fails a
  pull request where `README.md` changed and `README.zh-CN.md` did not. A translation can
  still be wrong, but it cannot now be silently left behind.
- **Signal (two).** `progress.md` stated **25** tracked items, `CLAUDE.md` stated **24**, and
  the table they both described had **29**.
- **Fix (two).** Count with `awk` over the table, correct both documents, and name the old
  number in the text rather than quietly replacing it — a progress document that only ever
  goes green is being performed, not read.
- **Why it was like that.** Both failures are the same shape: a number or a sentence
  duplicated in two places, with nothing linking them.
- **Next time.** Prefer deriving a figure to restating it. Where a fact must appear twice,
  add a check for the _divergence event_, since the content itself cannot be machine-checked.

---

## 6. Platform and environment

> This section is the shortest-lived knowledge in the document and the most expensive to
> re-acquire at the wrong moment.

### 6.1 The hosting provider changed and the application did not

> **Lesson: the test of a portability claim is being forced to use it.**

- **Signal.** The Vercel account was blocked by automated fraud detection on sign-in; the
  recovery form had not responded a day later.
- **Cause.** Outside our control, and not worth waiting on.
- **Fix.** Moved to Netlify. **Not one line of application code changed** — one configuration
  file, `apps/web/netlify.toml`, and different values in a dashboard.
- **Why this is worth recording.** ADR-0002 claimed the exit cost from any single host was
  low because `apps/web` is a plain Next.js app and `packages/core` depends on no host.
  That claim was tested involuntarily, under mild time pressure, and held. An untested
  portability claim is a belief; this one is now evidence.
- **Next time.** Same. The architectural property that made it cheap — business logic with
  no host-specific dependency — is the thing to protect, not the choice of host.

### 6.2 Three failures that all looked like "the site is broken"

> **Lesson: a status code tells you which layer answered, and that is usually the fastest
> way to halve the search space.**

| What was seen                                     | What it actually was                                                                                                                                             | How to tell                                                                            |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `401` on every path, page titled _Login Redirect_ | **Netlify visitor access**, set to Private. The request never reached the application, so the 401 says nothing about whether the build worked                    | The body redirects to `app.netlify.com/edge-access`. No `x-powered-by: Next.js` header |
| `500` on `/`, `200` on `/login`                   | **Environment variables absent on the host.** `/login` is `'use client'` and prerendered, so it needs none; `/` is a server component and reads them per request | `x-powered-by: Next.js` and `id="__next_error__"` — our code, not the platform         |
| `500` persisting after setting the variables      | **Variables do not apply retroactively.** They are injected at build time; the running deploy was built before they existed                                      | The deploy predates the change                                                         |

The second row is the useful one: **two routes, two different answers, and the difference
between them localised the fault**. A static page served fine while a dynamic one failed
points at request-time configuration, not at the build.

- **Next time.** When a deployment misbehaves, compare a static route against a dynamic one
  before reading any logs. And after changing configuration on a host, redeploy before
  concluding anything.

### 6.3 Monorepo settings that are exactly inverted between two hosts

> **Lesson: copying one platform's instructions into another is a specific, predictable way
> to lose an afternoon.**

|                             | Vercel                                     | Netlify                              |
| --------------------------- | ------------------------------------------ | ------------------------------------ |
| Where the app is named      | **Root Directory** = `apps/web`            | **Package directory** = `apps/web`   |
| Where install and build run | Repository root (it recognises workspaces) | **Base directory — must stay empty** |

Setting Netlify's base directory to `apps/web` makes npm install inside a package with no
lockfile. Workspace resolution breaks, and the error surfaces somewhere misleading — a
missing dependency, or the `prepare` script failing on husky. It is also the older and more
widely repeated advice.

Netlify resolves configuration in the order **package directory → base directory → root**,
and paths inside `netlify.toml` are relative to the **base** directory regardless of where
the file sits. Both facts are needed to predict what a given configuration will do, and
neither is guessable.

### 6.4 A CLI whose default target is the wrong one

> **Lesson: for any command that can touch production, read what it says it is about to do
> before reading what it did.**

- **Signal.** `npx supabase db push --dry-run` reported
  `Target: local stack (127.0.0.1:54322)` and then failed to connect, because Docker was not
  running.
- **Cause.** `db push` defaults to the **local** stack; the linked production project
  requires an explicit `--remote`. The failure here was harmless only by accident — with a
  local stack running, the command would have **succeeded against the wrong database** and
  reported success.
- **Fix.** Always `--remote --dry-run` first, read the printed target and the migration list,
  confirm `"seeds": []`, then push. The CLI additionally refuses to mutate production
  non-interactively without `--yes`, which is a control worth keeping rather than routing
  around.
- **Next time.** The dangerous-but-silent failure is a command that succeeds somewhere
  unintended. Where a tool has an environment-selecting flag, the target goes in the
  transcript before the action does.

### 6.5 Infrastructure fails in ways unrelated to your code

Two local stoppages, recorded because each cost real time and neither was a bug in anything
this project wrote.

- **The whole Supabase stack died** because the Logflare analytics container failed its
  health check and Docker Compose took its dependents down with it. Fixed by
  `[analytics] enabled = false`, with a comment saying why. **A health check on an optional
  component had become a dependency of the required ones.**
- **GoTrue returned "Database error querying schema"** because the seed left
  `confirmation_token` NULL and Go cannot scan NULL into a `string`. Fixed by setting eight
  token columns to `''`. **A nullable column in someone else's schema is a contract with
  their deserialiser, not only with the database.**

---

## Appendix: the answers in short

For recall before an interview. Each line is a claim that §-references the evidence.

| Claim                                                                                      | Where      |
| ------------------------------------------------------------------------------------------ | ---------- |
| Tenancy is enforced by the database; application-level filtering is a promise, not a model | §1.1       |
| A test that cannot fail occupies the place a real test would go                            | §1.2       |
| A control that filters what you see cannot be audited by what you see                      | §1.3       |
| Dangerous artefacts carry their own refusal, keyed on the environment                      | §1.4       |
| A check not observed failing has not been shown to work                                    | §2.1       |
| Green CI and an unusable product are not contradictory                                     | §2.2       |
| A test that can skip silently is a test you do not have                                    | §2.3       |
| Derived state buys retroactive analysis and sells write latency                            | §3.1, §4.1 |
| Test a migration in the order the tooling will apply it                                    | §3.2       |
| Code and schema deploy on different clocks; expand–contract closes the window              | §3.3       |
| The property that makes an architecture simple is what makes it slow                       | §4.1       |
| A library that animates by measuring owns that property; CSS must not touch it             | §4.4       |
| Optimistic UI is honest only when the client can predict the server                        | §4.1       |
| Pick tooling for the hardest future consumer                                               | §4.2       |
| A boundary enforced by lint is real; one in a document erodes                              | §4.3       |
| Stacked PRs and rebase-merge do not compose                                                | §5.1       |
| A check that can be skipped by accident will be                                            | §5.2       |
| "Done" is measured against the written definition, not the built thing                     | §5.3       |
| Structural checks cannot see drift in meaning; detect the cause                            | §5.4       |
| A portability claim is a belief until you are forced to use it                             | §6.1       |
| A status code tells you which layer answered                                               | §6.2       |
| Two hosts can require exactly inverted settings                                            | §6.3       |
| The silent failure is the command that succeeds in the wrong place                         | §6.4       |
