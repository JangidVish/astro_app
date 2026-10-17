#!/usr/bin/env bash
# T10.3: monitoring, alerts and backups for one environment. Idempotent; run after the first
# deploy (the uptime check needs the service URL).
# Usage: source infra/gcp/env.staging.sh && bash infra/gcp/ops.sh
source "$(dirname "$0")/lib.sh"
: "${ALERT_EMAIL:?}"

URL=$(g run services describe "$SERVICE" --region "$REGION" --format 'value(status.url)')
HOST="${URL#https://}"

step "Notification channel (${ALERT_EMAIL})"
CHANNEL=$(g beta monitoring channels list --filter "labels.email_address=\"${ALERT_EMAIL}\"" \
  --format 'value(name)' | head -n1)
if [[ -z "$CHANNEL" ]]; then
  CHANNEL=$(g beta monitoring channels create --type email --display-name "Astro alerts" \
    --channel-labels "email_address=${ALERT_EMAIL}" --format 'value(name)')
fi

step "Uptime check on /healthz"
if ! g monitoring uptime list-configs --format 'value(displayName)' | grep -qx "astro-api-health"; then
  g monitoring uptime create astro-api-health --resource-type uptime-url \
    --resource-labels "host=${HOST},project_id=${PROJECT_ID}" --path /healthz \
    --protocol https --period 5 --timeout 10
fi

step "Alert policies (uptime failure, 5xx responses)"
policy() {
  local name="$1" file="$2"
  if ! g alpha monitoring policies list --format 'value(displayName)' | grep -qx "$name"; then
    g alpha monitoring policies create --policy-from-file "$file" --notification-channels "$CHANNEL"
  fi
}
policy "Astro API down" "$(dirname "$0")/policies/uptime.json"
policy "Astro API 5xx" "$(dirname "$0")/policies/errors-5xx.json"

step "Firestore daily backups, kept 30 days"
if [[ -z "$(g firestore backups schedules list --database '(default)' --format 'value(name)')" ]]; then
  g firestore backups schedules create --database '(default)' --recurrence daily --retention 30d
fi

printf '\nDone. Run the restore drill (README.md, "Restore drill") once a backup exists.\n'
