# Shared helpers for the infra/gcp scripts. Sourced, not run.
set -euo pipefail

: "${PROJECT_ID:?set PROJECT_ID (source your env.<stage>.sh first)}"
: "${REGION:?set REGION}"
: "${APP_ENV:?set APP_ENV}"

API_SA="astro-api@${PROJECT_ID}.iam.gserviceaccount.com"
DEPLOY_SA="astro-deployer@${PROJECT_ID}.iam.gserviceaccount.com"
REPO="astro"
SERVICE="astro-api"
WIF_POOL="github"
WIF_PROVIDER="github-actions"
BACKUP_BUCKET="${PROJECT_ID}-firestore-backups"
SECRETS=(ASTROLOGYAPI_USER_ID ASTROLOGYAPI_API_KEY UID_HASH_PEPPER)
# Collection groups whose documents carry an expireAt field (data-model.md 2.6).
TTL_GROUPS=(predictions usage places placeIds providerCalls auditEvents)

g() { gcloud --project "$PROJECT_ID" --quiet "$@"; }
step() { printf '\n== %s\n' "$*"; }
exists() { "$@" >/dev/null 2>&1; }
