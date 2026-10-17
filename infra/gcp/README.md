# GCP and Firebase setup (M10)

These scripts set up one environment (staging or prod). Each environment lives in its own GCP project.

> **Status:** written and syntax-checked, but **not run yet**. Running them creates billable cloud resources in your accounts, so each run needs your go-ahead (T10.x approval gates).

| Script                  | Purpose                                                                                                                                        | Re-runnable   |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| `setup.sh`              | Sets up APIs, Artifact Registry, service accounts, empty secrets, Firestore, TTL policies, rules, Workload Identity for GitHub, and the budget | Yes, additive |
| `deploy-api.sh <image>` | Deploys to Cloud Run, then runs `smoke.sh`                                                                                                     | Yes           |
| `smoke.sh <url>`        | Checks that `/healthz` returns 200 and that unauthenticated `/v1` requests return 401                                                          | Yes           |
| `ops.sh`                | Sets up the alert email channel, the uptime check, alert policies (`policies/*.json`), and daily Firestore backups kept 30 days                | Yes           |
| `restore-drill.sh`      | Restores the newest backup into a scratch database, counts users, then deletes the scratch database                                            | Yes           |
| `teardown.sh`           | Removes everything above except Firestore data, backups, the budget and the project. Asks you to type the project id first                     | Yes           |

## Prerequisites (yours)

- A GCP billing account. Create one Firebase project per environment and add Firebase to it (M0.2).
- The `gcloud` CLI, logged in as a project owner:

  ```bash
  gcloud auth login
  gcloud auth application-default login
  ```

- Node 24, for the Firebase CLI (it runs via `npx`).

## Order (per environment)

1. **Configure the environment file.** Copy `env.example.sh` to `env.staging.sh`; that file is git-ignored. Fill it in, then run:

   ```bash
   source infra/gcp/env.staging.sh
   ```

2. **Run setup:**

   ```bash
   bash infra/gcp/setup.sh
   ```

   It prints the four GitHub variables for step 5.

3. **Add the secret values.** Type them in from your terminal; they are never put in files or chat:

   ```bash
   printf '%s' "<user id>" | gcloud secrets versions add ASTROLOGYAPI_USER_ID --data-file=- --project "$PROJECT_ID"
   printf '%s' "<api key>" | gcloud secrets versions add ASTROLOGYAPI_API_KEY --data-file=- --project "$PROJECT_ID"
   node -e "process.stdout.write(require('crypto').randomBytes(32).toString('base64'))" |
     gcloud secrets versions add UID_HASH_PEPPER --data-file=- --project "$PROJECT_ID"
   ```

   Use a **different pepper per environment**, and never change it once in use: changing it unlinks existing usage counters and logs from users.

4. **Firebase console, manual steps** (there is no stable CLI for these):
   - Authentication → Sign-in method: enable **Email/Password**, **Google** and **Apple**. Apple needs the Services ID and key from your Apple Developer account (M0.3).
   - Project settings → add the **iOS** and **Android** apps. Their bundle ids replace `com.placeholder.astroapp` in `apps/mobile/app.json`. Put the web config values into the EAS environment as `EXPO_PUBLIC_FIREBASE_*`.
   - App Check: register **App Attest** (iOS) and **Play Integrity** (Android). The mobile App Check integration is still to do (see `docs/STATUS.md`). **Until it is done, the deployed API rejects the app**, because `APP_CHECK_ENFORCED=true` is mandatory in staging and prod.

5. **GitHub** → Settings → Environments:
   - Create `staging` and `production` environments.
   - Add each one's variables: `GCP_PROJECT_ID`, `GCP_REGION`, `GCP_WIF_PROVIDER`, `GCP_DEPLOY_SA`, and optionally `ASTRO_PROVIDER=mock` for staging.
   - Give `production` required reviewers.
   - The PAT used to push needs the `workflow` scope.

6. **First deploy.** Merge to `main`. When CI passes, `.github/workflows/deploy.yml` deploys staging. For prod, push a `v*` tag and approve it.

7. **Run the ops setup:**

   ```bash
   bash infra/gcp/ops.sh
   ```

   After the first nightly backup exists, run:

   ```bash
   bash infra/gcp/restore-drill.sh
   ```

   Record the result in `docs/STATUS.md`.

8. **Re-run the load test** with staging numbers (T9.2), then the **Maestro flow** on a staging build (T9.3).

## Rollback

- **Code.** Route traffic back to the previous revision:

  ```bash
  gcloud run services update-traffic astro-api --region "$REGION" --to-revisions <previous-revision>=100
  ```

  `gcloud run revisions list --service astro-api --region "$REGION"` lists the revisions.

- **Data.** Restore a backup into a **new** database (as `restore-drill.sh` does), check it, then switch over deliberately. Never restore over `(default)` in place.
- **Infrastructure.** `teardown.sh`.
