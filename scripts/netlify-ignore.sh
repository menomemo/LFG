#!/usr/bin/env bash
#
# Netlify's build-ignore hook, wired up in apps/web/netlify.toml.
#
# READ THE EXIT CODES TWICE, THEY ARE INVERTED:
#
#   exit 0  ->  nothing relevant changed, CANCEL the build
#   exit 1  ->  something changed, RUN the build
#
# Getting them the wrong way round does not fail loudly. It produces a site
# that silently stops deploying, or one that rebuilds for every typo.
#
# Why this exists: on 2026-11-05 the project spent half a month's Netlify
# credits in a day. Most of it went on pull requests that changed only
# documentation and SQL migrations and could not possibly have changed the
# built site, yet each one installed the whole workspace and built Next.js.
#
# What is excluded below cannot affect the bundle that gets served:
#   - docs/ and Markdown: prose
#   - .github/ and LICENSE: never read at build time
#   - supabase/migrations, tests, seed, config: SQL and local tooling, none of
#     it imported by apps/web
#   - supabase/database.types.ts: types only, erased before any JavaScript is
#     emitted, so the output is byte-identical. A type error in it is still
#     caught by the required `Format, lint, types, tests` CI job, which cannot
#     be skipped, so nothing is lost by not type-checking it a second time here
#
# Everything else builds. When in doubt this script builds: every failure path
# below exits 1.

set -u

if [ -z "${CACHED_COMMIT_REF:-}" ] || [ -z "${COMMIT_REF:-}" ]; then
  echo "netlify-ignore: no commit range available — building."
  exit 1
fi

if ! git cat-file -e "${CACHED_COMMIT_REF}^{commit}" 2>/dev/null; then
  echo "netlify-ignore: ${CACHED_COMMIT_REF} is not in this clone — building."
  exit 1
fi

git diff --quiet "${CACHED_COMMIT_REF}" "${COMMIT_REF}" -- . \
  ':(exclude)docs' \
  ':(exclude)*.md' \
  ':(exclude).github' \
  ':(exclude)LICENSE' \
  ':(exclude)supabase/migrations' \
  ':(exclude)supabase/tests' \
  ':(exclude)supabase/seed.sql' \
  ':(exclude)supabase/config.toml' \
  ':(exclude)supabase/database.types.ts'
changed=$?

if [ "${changed}" -eq 0 ]; then
  echo "netlify-ignore: only docs, SQL and CI changed — skipping the build."
  exit 0
fi

echo "netlify-ignore: files that reach the built site changed — building."
exit 1
