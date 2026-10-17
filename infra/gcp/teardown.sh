#!/usr/bin/env bash
# Removes what setup.sh and the deploys created, except Firestore data, backups and the project.
# DESTRUCTIVE: asks for the project id to be typed back before doing anything.
# Usage: source infra/gcp/env.staging.sh && bash infra/gcp/teardown.sh
source "$(dirname "$0")/lib.sh"

read -r -p "Type the project id (${PROJECT_ID}) to delete its Astro resources: " answer
if [[ "$answer" != "$PROJECT_ID" ]]; then
  echo "Aborted."
  exit 1
fi

step "Cloud Run service"
if exists g run services describe "$SERVICE" --region "$REGION"; then
  g run services delete "$SERVICE" --region "$REGION"
fi
step "Workload Identity pool"
if exists g iam workload-identity-pools describe "$WIF_POOL" --location global; then
  g iam workload-identity-pools delete "$WIF_POOL" --location global
fi
step "Service accounts"
for sa in "$DEPLOY_SA" "$API_SA"; do
  if exists g iam service-accounts describe "$sa"; then g iam service-accounts delete "$sa"; fi
done
step "Secrets (their values are destroyed)"
for s in "${SECRETS[@]}"; do
  if exists g secrets describe "$s"; then g secrets delete "$s"; fi
done
step "Artifact Registry"
if exists g artifacts repositories describe "$REPO" --location "$REGION"; then
  g artifacts repositories delete "$REPO" --location "$REGION"
fi

echo
echo "Kept: Firestore data, the backup bucket, the budget and the project. Delete the project"
echo "in the console to remove everything (restorable for 30 days)."
