# ADR-0009: Run model calls from Supabase, not from the web host

|                |            |
| -------------- | ---------- |
| **Status**     | Proposed   |
| **Date**       | 2026-11-06 |
| **Deciders**   | @menomemo  |
| **Supersedes** | —          |

## Context

JD parsing is the next item, and it is the first feature in this product that calls a
language model. Where that call runs has not been decided, and the obvious place — a
Next.js server action, next to the code that already writes applications — would be chosen
by default if nobody wrote this down.

Four facts constrain the choice.

**The web host is metered by function duration.** `apps/web` is deployed to Netlify, which
bills serverless execution. A model call is not a database query: it takes seconds, not
milliseconds. The project's credit allowance for the cycle beginning 2026-11-05 was 80%
consumed by 2026-11-06, on a site with two routes and no model calls at all. Builds have
been ruled out as the cause — the ignore hook lands on 2026-11-06 01:47, four main builds
have run since, and deploy previews are cancelled — so what remains is request-time
execution, which is exactly the budget a model call would be charged against.

**The meter is not optional.** [architecture.md §7](../architecture.md#7-cross-cutting-concerns)
makes an unmetered call a bug rather than an oversight, and `llm_usage` exists for it. The
row must be written before the result is used. A call site that can succeed without
writing that row will eventually do so.

**`llm_usage` lives in Postgres behind RLS**, like every other table. Writing to it from the
web host means the web host holds a credential that can write it.

**A provider key is a secret of the same class as the service role key**, which
[CLAUDE.md](../../CLAUDE.md) already forbids from any surface. A key in the web host's
environment is readable by every server component and every future server action in the
app, including ones written in a hurry.

## Decision

> We will make every model call from a Supabase Edge Function, never from `apps/web`.
> The function holds the provider credential, writes the `llm_usage` row before returning,
> and is invoked by the browser against the user's own Supabase session. The web host
> never holds a provider key and never waits on a model.

`packages/core` is unaffected and stays as ADR-0003 defines it: the prompt is a versioned
file, the response schema and its validation are `core` functions, and the Edge Function is
the adapter that moves bytes between them.

## Alternatives considered

| Option                                      | What it would give us                                                                               | Why not                                                                                                                                                                                                    |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Next.js server action in `apps/web`         | The least code. One file, no new deployment target, the session is already there                    | Charges every parse to the budget that is already at 80%, and puts a provider key in the surface that renders public pages. Both problems get worse with each plugin, and neither is visible in review     |
| Supabase Edge Function (chosen)             | Duration billed by Supabase; the key sits next to the only table that must record it; one call site | A second deployment target, a second language runtime, and local development needs the Supabase stack running                                                                                              |
| The agent runtime, as `plugins/jd-parser`   | Where plugins are supposed to end up, per the Phase 1 scope                                         | The runtime is not built. Making JD parsing wait for it inverts the roadmap, and the runtime is a pinned developer-preview dependency — a bad thing to make the first model call depend on                 |
| Call the provider directly from the browser | No server at all                                                                                    | The key would be in the client. Not an option; listed because it is what "just add fetch" turns into                                                                                                       |
| Do nothing — keep JD entry manual           | Zero cost, zero new surface. The create form already works                                          | The roadmap item exists because typing the same five fields out of every advert is the friction that stops applications being logged, and the Phase 1 gate is four weeks of every application being logged |

## Consequences

**What this makes easier**

- The meter cannot be bypassed: the only code that can call a provider is the code that
  writes `llm_usage`, in the same function, before it returns.
- Model cost and web hosting cost stop competing for one allowance.
- Every later plugin has a place to go that is already correct, rather than a precedent in
  `apps/web` to copy.
- Swapping providers is a change to one deployment, not a search across the app.

**What this makes harder**

- Local development of anything that parses now needs `supabase start`, where before the
  Next dev server was enough.
- Edge Functions are Deno. `packages/core` is imported across a runtime boundary, so its
  "no framework, no `process.env`" rule is now load-bearing rather than tidy — a violation
  becomes a deployment failure instead of a lint error.
- A parse is a network call the web app cannot see inside. Failures surface as a status
  from another service, and the error message has to survive the trip.

**What this commits us to**

- Secrets in two places — Netlify for Supabase's public URL and publishable key, Supabase
  for the provider key — and a deployment document that says which belongs where.
- Exit cost if wrong: moderate and bounded. The prompt, the schema and the validation are
  in `core` and move unchanged; what is thrown away is the function wrapper and its
  deployment, which is tens of lines. The expensive version of this mistake is the one
  this ADR exists to prevent — discovering it after six plugins have copied the pattern.

**What to watch**

- Round-trip latency. If parsing a pasted advert feels slower than typing it, the feature
  has failed regardless of where it runs.
- Supabase's own function budget. This decision moves a cost, it does not remove one; the
  signal to revisit is Supabase's invocation limit being approached the way Netlify's was.
- Whether a second caller ever needs the same parse. If so, the Edge Function is right and
  a server action would have been a dead end.
