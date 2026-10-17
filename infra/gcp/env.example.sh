# Copy to env.staging.sh / env.prod.sh (git-ignored) and fill in. No secrets go here:
# secret values are added straight into Secret Manager (see README.md, step 3).
export APP_ENV=staging                  # staging | prod
export PROJECT_ID=astro-app-staging     # your GCP/Firebase project id
export REGION=asia-south1               # Mumbai: closest to most users
export BILLING_ACCOUNT=XXXXXX-XXXXXX-XXXXXX
export BUDGET_USD=50                    # NFR-10
export GITHUB_REPO=JangidVish/astro_app # owner/name allowed to deploy via Workload Identity
export ALERT_EMAIL=you@example.com      # budget and uptime alerts
