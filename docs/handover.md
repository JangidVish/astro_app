# Handover guide (M11)

This guide covers operating and developing the Astro app. Read it with:

- `docs/STATUS.md`: progress, test evidence and risks;
- `docs/architecture.md`;
- `docs/data-model.md`;
- `infra/gcp/README.md`: cloud setup.

## 1. What is in the repository

| Path              | What it is                                                                                                                |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `packages/shared` | Zod schemas and types shared by the API and the app, plus birth-time and timezone resolution (Luxon/tzdb)                 |
| `services/api`    | Fastify API (Node 24, TypeScript): auth, users, places, profiles, charts, dasha, predictions, quota, the provider adapter |
| `apps/mobile`     | Expo / React Native app (expo-router, TanStack Query, Firebase JS SDK auth, SVG North Indian chart)                       |
| `infra/firebase`  | Firestore rules, indexes, emulator config, and rules tests                                                                |
| `infra/gcp`       | gcloud scripts for setup, deploy, smoke tests, ops, the restore drill, and teardown                                       |
| `scripts`         | Repository tooling: the emulator wrapper, gitleaks, the invisible-character guard, and the mobile bundle secret check     |

## 2. Local setup

**Prerequisites:**

- Node **24.13.0** (`.nvmrc`), npm 11, and Java 21+ (for the Firebase emulators);
- optionally, Android Studio or Xcode for a simulator.

**Steps:**

1. Install dependencies:

   ```bash
   npm ci
   ```

2. Copy `.env.example` to `.env`. It works as is for mock mode. To use the real provider, set `ASTRO_PROVIDER=astrologyapi` and add your credentials. `.env` is git-ignored; never commit it or paste its values anywhere.
3. Copy `apps/mobile/.env.example` to `apps/mobile/.env`. The demo values work with the emulators.
4. Start the backend. One command starts the Auth and Firestore emulators and the API (with auto-reload):

   ```bash
   npm run dev:lan
   ```

   The API and the Auth emulator are reachable from your Wi-Fi so a real phone can use them. The Firestore emulator and the emulator UI (http://127.0.0.1:4000) stay on this PC only. **Use it only on a network you trust**: the Auth emulator accepts unsigned tokens.

   Loopback only (no phone): run `npm run emulators` in one terminal, then in another:

   ```bash
   FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 FIRESTORE_EMULATOR_HOST=127.0.0.1:8085 npm run dev --workspace @astro/api
   ```

5. Start the app in a second terminal:

   ```bash
   npm run start --workspace @astro/mobile
   ```

   - **Real phone:** install **Expo Go**, put the phone on the same Wi-Fi, and scan the QR code. Use the Camera app on iOS, or Expo Go on Android.
   - **Android emulator:** press `a`.

   The app reaches the API and the Auth emulator at the same computer address it loaded from, so no IP needs configuring. This is why `EXPO_PUBLIC_API_URL` stays unset and `EXPO_PUBLIC_FIREBASE_AUTH_EMULATOR_URL=auto`.

**If the phone can't connect:**

- **Windows firewall.** Allow Node.js and Java on **Private** networks when Windows asks. Also set the Wi-Fi's network profile to Private (Settings → Network → Wi-Fi → Properties).
- **Expo picked the wrong network adapter.** The QR code should show your Wi-Fi address (for example `192.168.x.x`), not a VPN or WSL adapter. If it doesn't, set `REACT_NATIVE_PACKAGER_HOSTNAME=<your Wi-Fi IP>` before starting Expo.
- **Network isolation.** Guest and office networks often stop devices from seeing each other. Use a home network or a phone hotspot instead.
- **Tunnel mode won't work.** `expo start --tunnel` serves the app through the internet, but the API stays on your Wi-Fi, so the app still can't reach it.

## 3. Environment variables

**API** (validated at startup by `services/api/src/common/config.ts`; startup fails, naming the variable, if any value is invalid):

| Variable                                                 | Required                            | Notes                                                                                                                              |
| -------------------------------------------------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `APP_ENV`                                                | yes                                 | `local`, `test`, `staging` or `prod`                                                                                               |
| `PORT`                                                   | no (8080)                           | Cloud Run sets it                                                                                                                  |
| `LOG_LEVEL`                                              | no (`info`)                         | Logs are JSON with personal data redacted                                                                                          |
| `ASTRO_PROVIDER`                                         | yes                                 | `astrologyapi` or `mock`. **`mock` is refused in prod**                                                                            |
| `ASTROLOGYAPI_USER_ID`, `ASTROLOGYAPI_API_KEY`           | when the provider is `astrologyapi` | **Secret.** Kept in Secret Manager when deployed                                                                                   |
| `UID_HASH_PEPPER`                                        | yes                                 | **Secret.** 32+ random bytes, base64. Use one per environment and never rotate it casually                                         |
| `FIREBASE_PROJECT_ID`                                    | yes                                 |                                                                                                                                    |
| `APP_CHECK_ENFORCED`                                     | no (true)                           | **Must be true** in staging and prod (enforced)                                                                                    |
| `LISTEN_ON_LAN`                                          | no (false)                          | `true` makes the API listen on all interfaces, for phone testing. **Allowed only when `APP_ENV=local`**; `npm run dev:lan` sets it |
| `QUOTA_PROVIDER_CALLS_PER_DAY`                           | no (30)                             | Provider calls per user per UTC day. **This is a placeholder:** set it from real credit costs                                      |
| `FIREBASE_AUTH_EMULATOR_HOST`, `FIRESTORE_EMULATOR_HOST` | local and test only                 | **Refused in staging and prod**, because with them set firebase-admin trusts unsigned tokens                                       |

**Mobile:** the `EXPO_PUBLIC_*` variables in `apps/mobile/.env.example` are public identifiers that get inlined into the bundle. **Never put a secret in an `EXPO_PUBLIC_*` variable.** CI's `mobile-bundle` job fails if a secret value ends up in the bundle.

## 4. Tests

| Command                                                      | What it runs                                                                                                                  | Time      |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- | --------- |
| `npm run check`                                              | format, lint (ESLint and the invisible-character guard), typecheck, and all tests (shared, API with emulators, mobile, rules) | ~5–10 min |
| `npm test --workspace @astro/api`                            | API unit and integration tests, including the security suite and the real-server end-to-end journey (starts emulators itself) | ~3 min    |
| `npm run test:perf --workspace @astro/api`                   | Load test: 50 users, measured against NFR-6 (on demand)                                                                       | ~1 min    |
| `node scripts/check-bundle-secrets.mjs`                      | Builds the Android JS bundle and scans it for secrets                                                                         | ~1 min    |
| `maestro test apps/mobile/.maestro -e EMAIL=… -e PASSWORD=…` | Device journey on a staging build (needs Maestro and an emulator or device)                                                   | ~3 min    |
| `npx tsx services/api/scripts/provider-spike.ts`             | **Spends real provider credits.** Manual only                                                                                 |           |

The pre-commit hook runs gitleaks, ESLint, Prettier and the invisible-character guard on staged files. Do not bypass it.

## 5. Deploy and rollback

- **Deploys:** see `infra/gcp/README.md`.
  - Staging deploys automatically after CI passes on `main`.
  - Prod deploys on a `v*` tag, after a reviewer approves in GitHub.
  - Each deploy ends with `smoke.sh`.
- **Rollback:** move traffic to the previous Cloud Run revision (the command is in `infra/gcp/README.md`). It takes seconds and needs no rebuild.

## 6. Monitoring and troubleshooting

`infra/gcp/ops.sh` sets up these alerts:

- **API down:** uptime check on `/healthz`;
- **API 5xx:** more than 5 server errors in 5 minutes;
- the budget at 50/90/100 %.

Daily Firestore backups are kept 30 days.

| Symptom                           | Likely cause                                                            | What to do                                                                                                                                    |
| --------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Many 503 `SERVICE_UNAVAILABLE`    | The astrology provider is down or slow (10 s timeout, 3 retries)        | Check the provider's status. Cached readings still work. Users' quota is refunded on failure                                                  |
| 429 `QUOTA_EXCEEDED` complaints   | The per-user daily limit was reached                                    | Check the real credit use (`providerCalls` collection, last 30 days), then adjust `QUOTA_PROVIDER_CALLS_PER_DAY` and redeploy                 |
| Every app request returns 401     | App Check is not integrated in the app yet, or a token or clock problem | Logs show `authFailure` with a reason (`app_check_invalid`, `id_token_expired`, …). Logs never show tokens                                    |
| The API will not start            | Invalid config                                                          | Cloud Run logs show `Invalid configuration:` and name the variable                                                                            |
| Wrong chart for an old birth date | Historical timezone data                                                | The profile shows the UTC offset that was used. Compare it with the provider's `timezone_with_dst`. tzdata comes from the pinned Node version |
| Spending is climbing              | Provider credits (most likely), or instances                            | Cloud Run is capped at 3 instances. Check the call volume in `providerCalls`                                                                  |

Request logs carry a request id (`x-request-id` response header) and a peppered uid hash, never a raw uid, name, birth data or token. To trace one user, compute their hash with the environment's pepper in a secure shell. Never log the pepper itself.

## 7. Known limitations (MVP)

**Blocks a working staging app:**

- **App Check is not in the app yet.** Staging and prod enforce it, so the deployed API rejects the app until the native module is added. Run `infra/gcp/README.md` step 4 first.

**Waiting on your accounts or decisions:**

- **Google sign-in is hidden** until OAuth client IDs exist. Email/password and Apple are wired.
- **App ID** is `com.jangidvish.astro` (set for the POC build; change before a store release if the publisher differs).
- **Privacy policy and terms text** are not written yet (M0.6). Their versions are `2026-10-17`.
- **The quota value (30 per day)** is a placeholder until the credit cost per call is known.

**Product gaps:**

- **There is no API to change the primary profile.** The first profile is primary.
- **Daily prediction is Vedic only** (FR-16), within ±2 days of today in the birth place's timezone.

**Not yet verified:**

- **The Maestro flow has never been run.**
- **Load numbers come from the emulator.** Re-measure on staging.
- **The chart has not been compared visually** against the provider's chart image.
- **Device-level accessibility checks** (VoiceOver, TalkBack, largest text size) are not done.
- **The Docker image has not been built here.** There was no Docker daemon, so the build and install steps were simulated outside Docker and the bundle was booted against the emulators.

## 8. Cost summary

**Fixed costs:**

| Item                                                                                                      | Estimate                                                    |
| --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| GCP infrastructure (Cloud Run scale-to-zero, Firestore, Auth, Secret Manager, Artifact Registry, backups) | ≈ $1–5 per month for both environments; budget alert at $50 |
| Optional: Cloud Run min-instances = 1 (no cold starts)                                                    | + ≈ $5–15 per month                                         |
| AstrologyAPI Indian suite                                                                                 | from ₹1,500 per month, plus credits                         |
| Apple Developer Program                                                                                   | $99 per year                                                |
| Google Play developer account                                                                             | $25 once                                                    |
| EAS Build                                                                                                 | free tier                                                   |

**Where costs can grow:**

- **Provider credits are the main variable cost.** The per-user daily quota caps them.
- **Readings are cached per profile**, so reopening a reading costs nothing. The load test shows 0 provider calls on cache hits.
- **Cloud Run `max-instances 3`** puts a hard ceiling on compute.
