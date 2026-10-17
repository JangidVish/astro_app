#!/usr/bin/env bash
# Post-deploy smoke test: the service is up and refuses unauthenticated requests.
# Usage: bash infra/gcp/smoke.sh <service-url>
set -euo pipefail
URL="${1:?service url}"

check() {
  local path="$1" want="$2" got
  got=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "${URL}${path}")
  if [[ "$got" != "$want" ]]; then
    echo "FAIL ${path}: expected ${want}, got ${got}"
    exit 1
  fi
  echo "ok   ${path} -> ${got}"
}

check /healthz 200
check /v1/me 401
check /v1/profiles 401
