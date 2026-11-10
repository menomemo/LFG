#!/usr/bin/env bash
#
# Post-deploy check for an Edge Function's CORS contract.
#
# WHY THIS EXISTS, AND WHY A STATUS CODE CANNOT REPLACE IT:
#
# On 2026-11-09 the parse-advert function was unreachable from the browser
# for its entire first day. Every call died in the preflight because
# Access-Control-Allow-Headers omitted `x-client-info`, which supabase-js
# sends of its own accord.
#
# It had been "verified" with `curl -X OPTIONS`, which returned 200. So did
# the broken version. So does every broken version: the SERVER answers 200
# whatever it allows, and the browser then compares what it asked for
# against what came back and refuses the request on its own. There is no
# failing status code anywhere in the exchange -- the rejection happens in
# the client, and nothing on the wire looks wrong.
#
# So this script does what the browser does: it asks for the headers the
# client library actually sends, then checks each one against the allow-list
# that comes back. That comparison is the only thing that can fail.
#
# Usage:
#   scripts/check-function-cors.sh <project-ref> [function-name]
set -uo pipefail

REF="${1:-}"
FUNCTION="${2:-parse-advert}"

if [ -z "${REF}" ]; then
  echo "usage: $0 <project-ref> [function-name]" >&2
  echo "the linked ref is in supabase/.temp/project-ref" >&2
  exit 2
fi

URL="https://${REF}.supabase.co/functions/v1/${FUNCTION}"

# Every header supabase-js puts on a functions.invoke() call. Add to this
# list when the client library starts sending another one -- this list is
# the client's, not the function's.
REQUIRED="authorization x-client-info apikey content-type"
REQUESTED="$(echo "${REQUIRED}" | tr ' ' ',' | sed 's/,/, /g')"

echo "preflight → ${URL}"

RESPONSE="$(curl -s -i -X OPTIONS "${URL}" \
  -H 'Origin: https://example.invalid' \
  -H 'Access-Control-Request-Method: POST' \
  -H "Access-Control-Request-Headers: ${REQUESTED}" 2>/dev/null)"

if [ -z "${RESPONSE}" ]; then
  echo "  FAIL  no response at all — is the function deployed?"
  exit 1
fi

STATUS="$(printf '%s' "${RESPONSE}" | head -1 | tr -d '\r')"
ALLOWED="$(printf '%s' "${RESPONSE}" \
  | grep -i '^access-control-allow-headers:' \
  | cut -d: -f2- \
  | tr -d '\r' \
  | tr '[:upper:]' '[:lower:]')"

echo "  ${STATUS}"
echo "  allow-headers:${ALLOWED:- (absent)}"

if [ -z "${ALLOWED}" ]; then
  echo "  FAIL  no Access-Control-Allow-Headers — the browser will refuse every call"
  exit 1
fi

MISSING=""
for header in ${REQUIRED}; do
  case "${ALLOWED}" in
    *"${header}"*) ;;
    *) MISSING="${MISSING} ${header}" ;;
  esac
done

if [ -n "${MISSING}" ]; then
  echo "  FAIL  not allowed:${MISSING}"
  echo "        The server answered 200 and the browser will still block the"
  echo "        request. Add these to the CORS allow-list in the function."
  exit 1
fi

echo "  OK    every header the client sends is allowed"
