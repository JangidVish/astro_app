# Implementation Backlog (Phase 5)

- **Status:** Draft. Awaiting approval (Phase 5 gate)
- **Date:** 2026-10-17

**Legend**

- **Complexity:** S = under half a day, M = 1–2 days, L = 3+ days.
- **Priority:** P0 = MVP-blocking, P1 = MVP-required but not blocking other work.
- **Workflow:** every task follows the Phase 6 cycle: explain → edge cases → implement → static checks → tests → review → report → **stop for approval**.
- **Ordering:** tasks run in the order below unless marked ∥, which means they can run in parallel and have no code dependency.

---

## M0. Accounts and prerequisites (owner: **you**, runs ∥ with everything)

| ID   | Item                                                                                                                      | Needed by    |
| ---- | ------------------------------------------------------------------------------------------------------------------------- | ------------ |
| M0.1 | AstrologyAPI account. Store the User ID and API key in a password manager (**not** in chat or files)                      | T3.4         |
| M0.2 | Google Cloud billing account. Two projects: `astro-app-staging` and `astro-app-prod` (names are suggestions)              | T10.1        |
| M0.3 | Apple Developer Program ($99/yr) and legal entity                                                                         | T10.4        |
| M0.4 | Google Play Console ($25)                                                                                                 | T10.4        |
| M0.5 | Expo account (for EAS)                                                                                                    | T8.1 builds  |
| M0.6 | Privacy policy and terms text, covering the DPDP Act and naming AstrologyAPI as a processor. **Legal review recommended** | T8.7, launch |
| M0.7 | App name, icon, and brand colours (U-8). Placeholders are used until these arrive                                         | T8.8         |
| M0.8 | Install the gcloud CLI and Firebase CLI locally. I can guide you                                                          | T1.3, T10.1  |

---

## M1. Project setup

### T1.1 Monorepo scaffold and tooling. S / P0

- **Objective:** a working npm-workspaces monorepo with TypeScript, lint, format, test runners, and git hooks. There is no user-facing outcome.
- **Depends on:** nothing.
- **Files:**
  - root `package.json`, `tsconfig.base.json`, `.gitignore`, `.env.example`, `.editorconfig`, `.prettierrc`, `eslint.config.js`
  - empty `services/api` and `packages/shared` workspaces, each with a placeholder test
- **API/DB changes:** none.
- **Edge cases:**
  - Windows path separators and line endings (`.gitattributes` with `eol=lf`)
  - Node version pinned with `.nvmrc` and `engines`
- **Security:**
  - `.gitignore` covers `.env*`, credentials, keystores, and `google-services.json` / `GoogleService-Info.plist`
  - gitleaks pre-commit hook
- **Tests:** `npm run lint`, `npm run typecheck`, and `npm test` all pass on an empty scaffold. A deliberately planted fake secret is blocked by gitleaks; this is verified, then removed.
- **Acceptance:** all root scripts exit 0. The planted secret is caught.
- **Rollback:** revert the commit.

### T1.2 CI pipeline. S / P0

- **Objective:** GitHub Actions runs lint, typecheck, tests, gitleaks, and `npm audit` on every PR and push to `main`.
- **Depends on:** T1.1.
- **Files:** `.github/workflows/ci.yml`.
- **Edge cases:**
  - Dependency cache keyed on the lockfile
  - Fork PRs get no secrets
- **Security:** workflow `permissions: contents: read`. Third-party actions are pinned by SHA.
- **Tests:** one push showing a green run, and one deliberately failing lint showing a red run.
- **Acceptance:** CI status is visible on the GitHub commit. Making it a required check for `main` is optional.
- **Rollback:** delete the workflow.

### T1.3 Firebase emulators and Firestore rules. S / P0

- **Objective:** a local Auth + Firestore emulator setup, with rules that deny all client access.
- **Depends on:** T1.1, M0.8 (Firebase CLI).
- **Files:**
  - `infra/firebase/firebase.json`, `firestore.rules`, `firestore.indexes.json`
  - `scripts/emulators.(sh|ps1)`
- **Edge cases:**
  - Java must be present (it is: v25)
  - Port conflicts
- **Security:** the rules file is `allow read, write: if false;` for every path.
- **Tests:** a rules unit test (`@firebase/rules-unit-testing`) confirms that authenticated and unauthenticated clients both get denied on `users/*` and all other paths.
- **Acceptance:** emulators start with one command. The rules tests pass.
- **Rollback:** revert.

---

## M2. API foundation

### T2.1 Shared package: schemas and validation. M / P0

- **Objective:** zod schemas and error codes shared by the app and the API. These are the validation rules from `data-model.md` section 4, except the timezone rules, which come in T5.1.
- **Depends on:** T1.1.
- **Files:** `packages/shared/src/{errors.ts, profile.ts, me.ts, chart.ts, dasha.ts, prediction.ts, places.ts}`.
- **Edge cases:** leap days, 1900-01-01 boundary, hour 23:59, `timeKnown` and `birthTime` mismatch, Unicode names (Devanagari, accents), names that are empty after trimming, control characters, unknown extra fields.
- **Security:** `.strict()` on every input schema, and a body-size limit constant.
- **Tests:** unit tests (Vitest) using a table of at least 40 valid and invalid cases.
- **Acceptance:** 100% of the rules listed in data-model section 4.1, 4.2, and 4.4 have a test.
- **Rollback:** revert.

### T2.2 API core: config, logger with redaction, error model, Fastify app, `/healthz`. M / P0

- **Objective:** a running API skeleton.
- **Depends on:** T2.1.
- **Files:** `services/api/src/{app.ts, server.ts}` and `common/{config.ts, logger.ts, redact.ts, errors.ts, hashing.ts}`.
- **Edge cases:**
  - A missing required env var means **fail fast at startup** with a clear message that does not include the value.
  - Unhandled errors return 500 with a stable shape and no stack trace.
  - Oversized bodies return 413.
  - Malformed JSON returns 400.
- **Security:**
  - The redactor strips birth fields, names, coordinates, `authorization`, and `x-firebase-appcheck`.
  - `uidHash` uses an HMAC pepper.
  - Security headers are set.
- **Tests:**
  - Unit tests: redactor, config validation, error mapping.
  - Integration test with `app.inject`: `/healthz` returns 200, unknown routes return 404 in the stable shape.
- **Acceptance:** `npm run dev` serves `/healthz`. A log snapshot test proves the redaction works.
- **Rollback:** revert.

### T2.3 Auth module: Firebase ID token and App Check. M / P0

- **Objective:** every `/v1` route requires a valid token. `uid` is attached to the request.
- **Depends on:** T2.2, T1.3.
- **Files:** `modules/auth/{plugin.ts, plugin.test.ts}`.
- **Edge cases:** missing, malformed, expired, or revoked token. A token from a different Firebase project. Clock skew. App Check missing in prod versus disabled locally (a config flag that **cannot** be off in prod; the config validator enforces this).
- **Security:**
  - `uid` comes only from the token.
  - Failures return 401 without saying why.
  - Auth failures are rate-limited in the logs.
- **Tests:** integration tests against the Auth emulator: valid, expired, wrong-audience, and missing token, plus App Check enforced and not enforced.
- **Acceptance:** all cases above behave as specified.
- **Rollback:** revert.

---

## M3. Provider adapter (Phase 7 work, brought forward because every feature depends on it)

### T3.1 Provider interface and MockProvider. M / P0

- **Objective:** an `AstrologyProvider` interface, typed internal models, and a fixture-backed mock with failure injection (timeout, 401, 402, 429, 5xx, malformed).
- **Depends on:** T2.2.
- **Files:** `modules/astrology-provider/{provider.ts, errors.ts, models.ts, mock/*}` and `test/fixtures/provider/*`. The fixtures are built from the documented samples.
- **Edge cases:** the mock must be impossible to enable in prod. The config validator rejects `PROVIDER=mock` when `ENV=prod`.
- **Security:** fixtures contain synthetic birth data only.
- **Tests:** unit tests covering each failure mode and the prod guard.
- **Acceptance:** the mock is selectable by env, and the prod guard is proven by a test.
- **Rollback:** revert.

### T3.2 AstrologyAPI HTTP client. M / P0

- **Objective:** a Basic-auth POST client:
  - 10 s timeout
  - retries only on 5xx or network errors (1 s, 2 s, 4 s; 4 attempts in total)
  - no retry on 4xx
  - error classification into typed errors
  - call metadata written to `providerCalls`
- **Depends on:** T3.1.
- **Files:** `astrologyapi/{client.ts, client.test.ts}`.
- **Edge cases:** a slow response just under the timeout, a connection reset, a non-JSON body, a 200 response containing an error payload, and a large body.
- **Security:**
  - The credentials are read from config. They are never logged and never put in error messages.
  - The `Authorization` header is redacted.
- **Tests:** unit tests with an HTTP mock (`undici` MockAgent) covering every branch, plus a test that proves no request carries credentials into the logs.
- **Acceptance:** branch coverage of at least 90% on `client.ts`.
- **Rollback:** revert.

### T3.3 Response schemas and mappers. M / P0

- **Objective:** zod schemas and mappers for `geo_details`, `birth_details`, `planets`, `horo_chart/D1|D9`, `major_vdasha`, `sub_vdasha`, and `daily_nakshatra_prediction`.
- **Depends on:** T3.2.
- **Edge cases:**
  - Numbers and booleans arriving as strings
  - `d-m-yyyy H:m` dates converted to UTC using the birth offset
  - Charts that don't have exactly 12 houses
  - Missing grahas
  - Unknown planet names
  - Empty prediction sections
- **Tests:** unit tests on the documented samples, plus malformed variants (each must raise `ProviderMalformedError`).
- **Acceptance:** every endpoint used in the MVP has a schema, a mapper, and tests.
- **Rollback:** revert.

### T3.4 Live verification spike. M / P0. ⚠ **Spends provider credits, so it needs your go-ahead**

- **Objective:** run a script against the real API, with credentials taken from env only. It will:
  1. measure the credits each endpoint costs;
  2. confirm the ayanamsa is Lahiri;
  3. capture real error bodies for 401 and for zero credit;
  4. check what "today" the daily prediction uses;
  5. check whether the prediction text is the same for the same Moon sign, nakshatra, and date;
  6. cross-check at least 20 timezone fixtures against `timezone_with_dst`;
  7. record sanitized fixtures.
- **Depends on:** T3.3, T5.1, M0.1.
- **Files:** `scripts/provider-spike.ts` and `docs/api-provider-notes.md` (updated with the findings).
- **Budget:** about 60–100 calls in total, within the 150 free credits.
- **Security:** the key is supplied as an env var in your terminal session. Nothing is committed.
- **Acceptance:** the findings are documented, the quota value is set from real costs, and any mismatches are resolved or logged as risks.

---

## M4. Users, quota, deletion

### T4.1 Users module: `GET/PATCH /me`, consent. S / P0

- **Depends on:** T2.3.
- **Edge cases:**
  - First call creates the user document lazily, in an idempotent way
  - Consent version is outdated, so the user must re-accept
  - Two concurrent first calls
- **Tests:** integration tests on the emulator.
- **Acceptance:** a user document is created exactly once, consent is recorded, and profile creation is blocked until consent is given.

### T4.2 Quota module. S / P0

- **Depends on:** T4.1.
- **Edge cases:**
  - Concurrent increments (transaction)
  - Day rollover at UTC midnight
  - Cache hits do **not** consume quota
- **Tests:** a concurrency integration test with 20 parallel requests, and a test that over-quota returns 429 with `Retry-After`.
- **Acceptance:** the counter is exact under concurrency.

### T4.3 Account deletion: `DELETE /me`. M / P0

- **Depends on:** T4.1, T5.3.
- **Edge cases:**
  - The sign-in isn't recent, so the API returns 401 `REAUTH_REQUIRED`
  - The cascade is interrupted partway, so the nightly resume job has to finish it
  - Deleting a user who has no data
- **Security:** only the token owner can delete. An audit event is written using `uidHash`.
- **Tests:** an integration test that seeds a user with profiles, results, and predictions, deletes it, and asserts **zero** documents remain and the Auth user is gone. A resume test covers the interrupted case.
- **Acceptance:** acceptance criterion #11 from requirements.

---

## M5. Places and birth profiles

### T5.1 Timezone resolution library. M / P0

- **Objective:** a pure function `(date, time|null, timezoneId, offsetChoice?) → {utcOffsetMinutes, instantUtc, status: ok|gap|ambiguous}`.
- **Depends on:** T2.1.
- **Files:** `packages/shared/src/time/resolve.ts` and `test/fixtures/tz-cases.json`.
- **Edge cases:**
  - US DST gap and overlap
  - UK changes
  - India before 1955 and in wartime (+06:30)
  - Nepal +05:45
  - Southern-hemisphere DST
  - Unknown time, which defaults to noon
  - Year 1900
- **Tests:** at least 20 fixture cases, with expected offsets taken from tzdb history and documented with their source.
- **Acceptance:** all fixtures pass. The cross-check against the provider happens in T3.4.

### T5.2 Places module: `GET /places`. S / P0

- **Depends on:** T3.3, T4.2.
- **Edge cases:**
  - Query shorter than 3 characters
  - Unicode place names
  - No results
  - Provider down, so an error is returned rather than an empty list
  - Cache hit
- **Tests:** integration tests with the mock provider and the cache.
- **Acceptance:** a repeated query hits the cache and makes 0 provider calls. This is proven by the call log.

### T5.3 Birth profiles CRUD. M / P0

- **Depends on:** T5.1, T5.2.
- **Edge cases:**
  - A 6th profile (409)
  - Two concurrent creates that would together exceed the cap (transaction)
  - Gap or ambiguous time
  - Editing a birth field invalidates results; editing only the name does not
  - Deleting the primary profile reassigns the primary
  - A profile owned by another user returns 404
- **Security:** every access is scoped to `users/{uid}`.
- **Tests:** integration tests, including **cross-user isolation tests** for each route.
- **Acceptance:** acceptance criteria #2, #3, and #10 (for profiles).

---

## M6. Charts and Dasha

### T6.1 Charts module: `GET /profiles/{id}/chart?type=D1|D9` and `GET /profiles/{id}/planets`. M / P0

- **Depends on:** T5.3, T3.3.
- **Edge cases:**
  - Time unknown, so 409 `BIRTH_TIME_REQUIRED` for charts, and a reduced planet view
  - Duplicate concurrent requests make only one provider call (idempotency and in-flight de-duplication)
  - Provider errors map to a typed 502 or 503 with nothing cached
  - The input hash changes during a fetch, so the stale result is discarded
- **Tests:** integration tests with the mock provider for all failure modes.
- **Acceptance:** acceptance criteria #4 (API side), #5, and #9.

### T6.2 Dasha module. M / P0

- **Depends on:** T6.1.
- **Edge cases:**
  - Working out the current period at a period boundary, given the timezone
  - Lazy Antardasha fetch
  - A birth whose current Mahadasha started before birth (balance of dasha)
- **Tests:** unit tests for current-period selection, and integration tests for the endpoints.
- **Acceptance:** acceptance criterion #6.

---

## M7. Daily prediction

### T7.1 Predictions module: `GET /profiles/{id}/prediction?date=`. M / P0

- **Depends on:** T6.1 and the findings from T3.4 (which "today" the provider uses).
- **Edge cases:**
  - A date outside ±1 day
  - Time unknown, so noon is assumed and the disclaimer flag is set
  - Requests near midnight
  - TTL expiry
  - Provider down
- **Tests:** integration tests.
- **Acceptance:** acceptance criterion #7.

---

## M8. Mobile app

### T8.1 Expo scaffold, dev build, and Firebase SDK. M / P0

- **Depends on:** T1.1, M0.5. The Firebase config files come from M0.2; until then the app uses emulators.
- **Includes:** expo-router, TanStack Query, an API client using shared types, environment profiles, and a Jest setup.
- **Security:** only `EXPO_PUBLIC_*` values are bundled, and the API base URL is the only one. A bundle check proves no secrets are included.
- **Acceptance:** a dev build runs on an Android emulator and an iOS device or simulator, and calls `/healthz`.

### T8.2 Auth screens: sign-in, sign-up, reset, Google, Apple. M / P0

- **Edge cases:**
  - Wrong password
  - Email already in use with a different provider
  - Apple "hide my email"
  - Offline
  - Session expiry
- **Tests:** component tests and a Maestro flow.
- **Acceptance:** acceptance criterion #1.

### T8.3 Profiles UI and place search. M / P0

- **Includes:** list, create, and edit screens, debounced place search, and the date and time pickers.
- **Edge cases:**
  - An unknown-time toggle
  - Gap and ambiguous-time prompts
  - The 6th-profile message
  - Validation messages from the shared schemas
- **Acceptance:** acceptance criteria #2 and #3 (UI side).

### T8.4 North Indian chart renderer and chart screen. L / P0

- **Objective:** a pure function from chart data to SVG, plus a planet table, D1/D9 tabs, and retrograde markers.
- **Edge cases:**
  - Up to 5+ planets in one house (layout overflow)
  - Small screens
  - Dynamic text size
  - Dark mode
- **Tests:**
  - Snapshot tests of the SVG for 5 reference charts
  - Accessibility labels
  - A visual comparison against the provider's `horo_chart_image` for the same input (from T3.4 fixtures)
- **Acceptance:** acceptance criterion #4.

### T8.5 Dasha screen. S / P1

- Timeline, the current period highlighted, and expandable Antardashas.

### T8.6 Daily prediction screen. S / P1

- Today, previous, and next day. Shows the Moon sign and nakshatra used, and the disclaimer when the time was unknown.

### T8.7 Settings: account deletion, privacy, terms, disclaimer, sign-out. S / P0

- Requires re-authentication before deletion. Satisfies Apple's guideline 5.1.1(v).

### T8.8 States and accessibility pass. M / P1

- Loading, empty, error, retry, and offline states on every screen. Screen-reader labels, dynamic type, and WCAG AA contrast. Placeholder branding until M0.7 arrives.

---

## M9. Security, performance, regression

### T9.1 Security test suite. M / P0

- **Includes:**
  - Cross-user isolation tests on **every** route
  - Auth abuse checks
  - A secret scan of the repo and the built app bundle
  - Log redaction checks
  - A `npm audit` review
- **Acceptance:** acceptance criteria #10 and #12.

### T9.2 Performance test. S / P1

- **Includes:** a k6 or autocannon run against staging **with the mock provider**: 50 concurrent users, chart and prediction requests, both cache-hit and cache-miss.
- **Acceptance:** NFR-6 is met, or the gap is documented.

### T9.3 E2E regression with Maestro. M / P0

- **Includes:** register → create profile → chart → dasha → prediction → reopen saved reading → provider failure shown → delete account.
- **Acceptance:** the full flow passes on Android and iOS staging builds.

---

## M10. Deployment and operations (⚠ each step that affects the cloud **needs your approval**)

### T10.1 Staging GCP and Firebase setup scripts. M / P0

- **Includes:** documented, idempotent gcloud scripts that set up:
  - the needed APIs
  - Artifact Registry
  - the Cloud Run service account (least privilege)
  - Secret Manager entries (values added by **you**)
  - Firestore, TTL policies, and the rules deploy
  - Firebase Auth providers
  - App Check
  - budget alerts
- **Rollback:** the scripts are additive. A teardown script is provided.

### T10.2 Deploy pipeline. M / P0

- GitHub Actions authenticates with Workload Identity Federation, builds the Docker image, deploys to staging on merge to `main`, and runs smoke tests. Prod deploys require a tag and manual approval.

### T10.3 Monitoring, alerts, backups, restore drill. S / P0

- Uptime check, error alerts, a daily Firestore export with 30-day retention, and a **tested restore** into a scratch database.

### T10.4 EAS builds: internal testing. M / P0

- TestFlight internal and the Play internal track. Needs M0.3 and M0.4. Acceptance criterion #14.

### T10.5 Production setup and launch checklist. M / P0. ⚠ **production, so it needs approval**

- Prod project, smoke test, and store listings. Acceptance criterion #13 (cost review).

---

## M11. Handover documentation. M / P1

- Includes: env var reference, local setup, test guide, deploy and rollback runbook, monitoring and troubleshooting, known limitations, and a cost summary (Phase 10 list).

---

## Critical path

```
T1.1 → T1.2 → T1.3 → T2.1 → T2.2 → T2.3 → T3.1 → T3.2 → T3.3 → T5.1 → T3.4* → T4.1 → T4.2 → T5.2 → T5.3 → T4.3
→ T6.1 → T6.2 → T7.1 → T8.1 → T8.2 → T8.3 → T8.4 → T8.5 → T8.6 → T8.7 → T8.8 → T9.1 → T10.1 → T10.2 → T9.2 → T9.3 → T10.3 → T10.4 → T10.5 → M11
```

`*` T3.4 needs your AstrologyAPI credentials (M0.1). If they aren't available yet, T3.4 slips. Everything except T7.1's date semantics and the final quota value can continue on the mock provider.

**Rough total:** about 35–45 dev-days of implementation and testing, not counting store review time or waiting on M0 items.
