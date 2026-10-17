#!/usr/bin/env bash
# Deploys one image to Cloud Run and smoke-tests it. Used by .github/workflows/deploy.yml.
# Usage: source infra/gcp/env.staging.sh && bash infra/gcp/deploy-api.sh <image-uri>
# ASTRO_PROVIDER=mock is allowed in staging only (the server refuses it in prod).
source "$(dirname "$0")/lib.sh"
IMAGE="${1:?image uri}"
PROVIDER="${ASTRO_PROVIDER:-astrologyapi}"

secrets="UID_HASH_PEPPER=UID_HASH_PEPPER:latest"
if [[ "$PROVIDER" == "astrologyapi" ]]; then
  secrets+=",ASTROLOGYAPI_USER_ID=ASTROLOGYAPI_USER_ID:latest"
  secrets+=",ASTROLOGYAPI_API_KEY=ASTROLOGYAPI_API_KEY:latest"
fi
env_vars="APP_ENV=${APP_ENV},ASTRO_PROVIDER=${PROVIDER},FIREBASE_PROJECT_ID=${PROJECT_ID}"
env_vars+=",APP_CHECK_ENFORCED=true,LOG_LEVEL=info"
env_vars+=",QUOTA_PROVIDER_CALLS_PER_DAY=${QUOTA_PROVIDER_CALLS_PER_DAY:-30}"

# min-instances 0 (A9); max-instances is the hard cost ceiling (architecture.md, abuse row).
g run deploy "$SERVICE" --image "$IMAGE" --region "$REGION" \
  --service-account "$API_SA" --allow-unauthenticated \
  --min-instances 0 --max-instances 3 --concurrency 80 --cpu 1 --memory 512Mi --timeout 30 \
  --set-env-vars "$env_vars" --set-secrets "$secrets"

URL=$(g run services describe "$SERVICE" --region "$REGION" --format 'value(status.url)')
echo "Deployed: $URL"
bash "$(dirname "$0")/smoke.sh" "$URL"
