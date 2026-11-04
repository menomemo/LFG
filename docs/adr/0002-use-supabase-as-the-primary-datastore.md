# ADR-0002: Use Supabase as the primary datastore

|              |            |
| ------------ | ---------- |
| **Status**   | Accepted   |
| **Date**     | 2026-11-04 |
| **Deciders** | @Yihong    |

## Context

The product needs, from the first phase: relational storage for roughly fifteen related
tables; vector search for JD and insight embeddings; authentication; per-user data
isolation strong enough to hold other people's résumés and private interview notes; and
scheduled jobs. It must be multi-tenant from the first migration, because the plan is to go
public in Phase 5 and retrofitting tenancy onto a single-user schema is a rewrite.

The constraints are a single part-time developer, near-zero cost at one user, and no
appetite for operating infrastructure. Whatever is chosen has to be learnable to real depth,
since Postgres and its security model are on the
[learning track](../learning-track.md) deliberately.

## Decision

> We will use Supabase — managed Postgres with pgvector, Auth, row-level security, and cron
> — as the single datastore for all modules. Every table carries `user_id` and has RLS
> enabled and policies defined in the same migration that creates it. Surfaces access data
> with the end user's token; the service key is confined to scheduler plugins, which pass
> an explicit user context.

## Alternatives considered

| Option                                                  | What it would give us          | Why not                                                                                                                                                    |
| ------------------------------------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Self-hosted Postgres plus a hand-written API and auth   | Full control, no vendor        | Auth, policies, vector search and cron is most of Phase 1 rebuilt by hand, and then operated forever                                                       |
| Firebase or another document store                      | Fast start, generous free tier | The data is deeply relational — the hub-and-spoke shape around `applications` is the product. Vector search and SQL aggregation would both fight the model |
| Postgres plus a separate vector database                | Best-in-class vector search    | Two stores to keep consistent for a corpus measured in thousands of rows. pgvector is comfortably sufficient at this scale                                 |
| Application-level tenancy (filter by `user_id` in code) | No policy language to learn    | One missing `where` clause leaks a stranger's résumé. The database is the right place for a boundary that must not fail                                    |
| Do nothing yet, start with local files                  | Fastest possible Phase 1       | Guarantees a migration later, and teaches nothing that is on the learning track                                                                            |

## Consequences

**What this makes easier**

- Auth, tenancy, vector search, storage and cron arrive together, which is most of the
  foundation phase
- RLS puts the security boundary in the database, where a bug in a surface cannot bypass it
- Generated TypeScript types keep `core` and the schema honest with each other
- Local development runs the same stack, so RLS policies are testable offline

**What this makes harder**

- Policy debugging is genuinely unpleasant, and an RLS bug tends to look like "no rows"
  rather than an error
- Logic that would be convenient as a database function sits in a product that makes
  versioning functions awkward, so it belongs in `core` instead — which is the right answer
  anyway
- Operations we do not control: pricing changes, limits, downtime

**What this commits us to**

- Postgres semantics throughout, and to RLS as the tenancy model. The exit cost is moderate
  and bounded: the data is plain Postgres and dumps out, but Auth and policies would need
  replacing, so budget weeks rather than days
- Never writing to the database from a surface with the service key, as that silently
  disables the entire security model

**What to watch**

- Vector search latency as insights grow past tens of thousands of rows
- Any pressure to use the service key "just for this one thing" — that is the moment the
  tenancy model starts to erode
- Cost per user once there are real users, measured rather than assumed
