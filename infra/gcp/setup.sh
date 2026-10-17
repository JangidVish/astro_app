#!/usr/bin/env bash
# T10.1: idempotent project setup for one environment. Safe to re-run; it only adds.
# Usage: source infra/gcp/env.staging.sh && bash infra/gcp/setup.sh
# Needs: gcloud authenticated as a project owner, and Node (for the firebase CLI via npx).
source "$(dirname "$0")/lib.sh"
: "${BILLING_ACCOUNT:?}" "${BUDGET_USD:?}" "${GITHUB_REPO:?}" "${ALERT_EMAIL:?}"

step "Enable APIs"
g services enable \
  run.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com \
  firestore.googleapis.com iam.googleapis.com iamcredentials.googleapis.com sts.googleapis.com \
  firebase.googleapis.com identitytoolkit.googleapis.com firebaseappcheck.googleapis.com \
  monitoring.googleapis.com logging.googleapis.com billingbudgets.googleapis.com \
  cloudscheduler.googleapis.com storage.googleapis.com

step "Artifact Registry"
exists g artifacts repositories describe "$REPO" --location "$REGION" ||
  g artifacts repositories create "$REPO" --location "$REGION" --repository-format docker \
    --description "API images"

step "Runtime service account (least privilege)"
exists g iam service-accounts describe "$API_SA" ||
  g iam service-accounts create astro-api --display-name "Astro API runtime"
for role in roles/datastore.user roles/firebaseauth.admin roles/firebaseappcheck.tokenVerifier \
  roles/logging.logWriter roles/monitoring.metricWriter; do
  g projects add-iam-policy-binding "$PROJECT_ID" --member "serviceAccount:$API_SA" \
    --role "$role" --condition None >/dev/null
done

step "Secrets (created empty; you add the values)"
for s in "${SECRETS[@]}"; do
  exists g secrets describe "$s" || g secrets create "$s" --replication-policy automatic
  # Access is granted per secret, not project-wide.
  g secrets add-iam-policy-binding "$s" --member "serviceAccount:$API_SA" \
    --role roles/secretmanager.secretAccessor >/dev/null
done

step "Firestore (native mode), TTL policies, rules and indexes"
exists g firestore databases describe --database "(default)" ||
  g firestore databases create --location "$REGION" --type firestore-native
for group in "${TTL_GROUPS[@]}"; do
  g firestore fields ttls update expireAt --collection-group "$group" --enable-ttl --async
done
npx --yes firebase-tools@15 deploy --only firestore:rules,firestore:indexes \
  --project "$PROJECT_ID" --config "$(dirname "$0")/../firebase/firebase.json" --non-interactive

step "Deployer identity for GitHub Actions (Workload Identity Federation, no keys)"
exists g iam service-accounts describe "$DEPLOY_SA" ||
  g iam service-accounts create astro-deployer --display-name "GitHub Actions deployer"
for role in roles/run.developer roles/artifactregistry.writer; do
  g projects add-iam-policy-binding "$PROJECT_ID" --member "serviceAccount:$DEPLOY_SA" \
    --role "$role" --condition None >/dev/null
done
# The deployer may deploy services that run as the runtime account, nothing more.
g iam service-accounts add-iam-policy-binding "$API_SA" \
  --member "serviceAccount:$DEPLOY_SA" --role roles/iam.serviceAccountUser >/dev/null
exists g iam workload-identity-pools describe "$WIF_POOL" --location global ||
  g iam workload-identity-pools create "$WIF_POOL" --location global --display-name "GitHub"
exists g iam workload-identity-pools providers describe "$WIF_PROVIDER" --location global \
  --workload-identity-pool "$WIF_POOL" ||
  g iam workload-identity-pools providers create-oidc "$WIF_PROVIDER" --location global \
    --workload-identity-pool "$WIF_POOL" \
    --issuer-uri https://token.actions.githubusercontent.com \
    --attribute-mapping "google.subject=assertion.sub,attribute.repository=assertion.repository" \
    --attribute-condition "assertion.repository == \"${GITHUB_REPO}\""
PROJECT_NUMBER=$(g projects describe "$PROJECT_ID" --format 'value(projectNumber)')
POOL_PATH="projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${WIF_POOL}"
g iam service-accounts add-iam-policy-binding "$DEPLOY_SA" --role roles/iam.workloadIdentityUser \
  --member "principalSet://iam.googleapis.com/${POOL_PATH}/attribute.repository/${GITHUB_REPO}" \
  >/dev/null

step "Budget alert (50/90/100% of ${BUDGET_USD} USD)"
if ! gcloud billing budgets list --billing-account "$BILLING_ACCOUNT" \
  --format 'value(displayName)' | grep -qx "astro-${APP_ENV}"; then
  gcloud billing budgets create --billing-account "$BILLING_ACCOUNT" \
    --display-name "astro-${APP_ENV}" --budget-amount "${BUDGET_USD}USD" \
    --filter-projects "projects/${PROJECT_ID}" \
    --threshold-rule percent=0.5 --threshold-rule percent=0.9 --threshold-rule percent=1.0
fi

printf '\nDone. Manual steps with no stable CLI are listed in infra/gcp/README.md.\n'
printf 'GitHub environment "%s" variables for .github/workflows/deploy.yml:\n' "$APP_ENV"
printf '  GCP_PROJECT_ID=%s\n  GCP_REGION=%s\n' "$PROJECT_ID" "$REGION"
printf '  GCP_WIF_PROVIDER=%s/providers/%s\n  GCP_DEPLOY_SA=%s\n' "$POOL_PATH" "$WIF_PROVIDER" "$DEPLOY_SA"
