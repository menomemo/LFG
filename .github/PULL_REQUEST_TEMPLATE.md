<!--
The description is the part worth re-reading in six months. Write it for the person who
has forgotten everything about this change — probably you.
-->

## What changed

## Why

<!-- The problem, not the implementation. If an issue covers it: Refs #123 -->

## How this was verified

<!-- Commands run, tests added, what you clicked. "CI is green" is not verification. -->

## What this deliberately leaves out

<!-- Scope you decided against, and why. Prevents the next reader "finishing" it wrongly. -->

## Checklist

- [ ] Business logic is in `packages/core`, not in a plugin or an app
      ([ADR-0003](../docs/adr/0003-keep-business-logic-in-packages-core.md))
- [ ] External and model input is schema-validated at the boundary
- [ ] New tables enable RLS and add policies in the same migration, with a test proving
      isolation
- [ ] Model calls are metered to `llm_usage` and the plugin declares a cap
- [ ] Generated content carries provenance (`generated_by`, source link,
      `source_bullet_id`)
- [ ] Failures fail loudly rather than producing a confident wrong answer
- [ ] Format, lint, types and tests pass locally
- [ ] Documents this change makes wrong are fixed here
- [ ] `README.zh-CN.md` updated if `README.md` changed — they are one document
      in two languages, and a stale translation states things that are not true
- [ ] If this decides something a future reader could reverse by accident, there is an ADR
