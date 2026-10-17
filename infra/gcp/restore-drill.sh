#!/usr/bin/env bash
# T10.3 restore drill: restores the newest Firestore backup into a scratch database, counts the
# users, then deletes the scratch database. Never touches the (default) database.
# Usage: source infra/gcp/env.staging.sh && bash infra/gcp/restore-drill.sh
source "$(dirname "$0")/lib.sh"
SCRATCH="restore-drill-$(date +%Y%m%d%H%M)"

BACKUP=$(g firestore backups list --location "$REGION" \
  --format 'value(name)' --sort-by '~snapshotTime' | head -n1)
if [[ -z "$BACKUP" ]]; then
  echo "No backups yet; the daily schedule creates the first one within 24 hours."
  exit 1
fi

step "Restoring ${BACKUP} into ${SCRATCH}"
g firestore databases restore --source-backup "$BACKUP" --destination-database "$SCRATCH"

step "Checking the restored data"
TOKEN=$(gcloud auth print-access-token)
COUNT=$(curl -s -X POST -H "Authorization: Bearer ${TOKEN}" -H 'Content-Type: application/json' \
  "https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/${SCRATCH}/documents:runAggregationQuery" \
  -d '{"structuredAggregationQuery":{"structuredQuery":{"from":[{"collectionId":"users"}]},"aggregations":[{"alias":"n","count":{}}]}}' |
  grep -o '"integerValue": *"[0-9]*"' | grep -o '[0-9]*' || true)
echo "Users in the restored copy: ${COUNT:-unknown}"

step "Deleting ${SCRATCH}"
g firestore databases delete --database "$SCRATCH"

if [[ -z "$COUNT" ]]; then
  echo "Drill FAILED: could not read the restored database."
  exit 1
fi
echo "Drill passed. Record the date and user count in docs/STATUS.md."
