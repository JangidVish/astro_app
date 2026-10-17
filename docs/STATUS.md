# Project Status

- **Last updated:** 2026-10-17
- **Current milestone:** Phase 6, working through modules continuously (approved 2026-10-17). T4.3 is done. Next is T6.1 (charts and the providerCalls log).

## Approved decisions

- Requirements v0.2. Approved 2026-10-17. See `requirements.md`.
- Provider: **AstrologyAPI.com**, Indian Astrology suite.
- FR-16 revised: **Vedic daily personal prediction only** (`daily_nakshatra_prediction`). No Horoscope Suite. Weekly, monthly, and yearly are deferred.
- Architecture A1–A10 approved 2026-10-17:
  - Cloud Run modular monolith
  - Node 24 + TypeScript + Fastify
  - **Firestore**
  - Firebase Auth with Google, Apple, and **email + password**
  - Luxon tzdb
  - Our own chart renderer
  - Separate staging and prod GCP projects
  - **GitHub** + Actions + EAS
  - min-instances 0
  - npm-workspaces monorepo
- Phase 4 approved 2026-10-17:
  - data model, validation, retention, and migrations
  - quota placeholder of 30 calls per user per day
  - predictions kept 90 days
  - Maestro for E2E
  - gcloud scripts instead of Terraform
  - repo structure
- Git hosting: https://github.com/JangidVish/astro_app
- **Pre-1948 Indian births (2026-10-17): option (a).** Use the tz database offset and show the UTC offset used on the profile. User override is deferred.

## Completed

- Phase 1: requirements discovery and approval.
- Provider documentation review. See `api-provider-notes.md`.
- Phase 2: current-state assessment. New project, nothing to preserve. See `architecture.md` section 0.
- Phase 3: architecture approved. See `architecture.md`.
- Phase 4: approved. See `data-model.md` and `repo-structure.md`.
- Phase 5: backlog drafted. See `backlog.md`.
- Git repository initialised, and docs pushed to GitHub.
- Phase 5: backlog approved 2026-10-17.
- **T1.1 Monorepo scaffold and tooling**, completed 2026-10-17.
- **T1.2 CI workflow**: written and committed locally. **Not yet pushed or verified** (see Blocked).
- **T1.3 Firebase emulators and deny-all Firestore rules**, completed 2026-10-17.
- **T2.1 Shared schemas and validation**, completed 2026-10-17.
- **T2.2 API core** (config, redacting logger, error model, `/healthz`, esbuild build), completed 2026-10-17.
- **T2.3 Auth module** (Firebase ID token and App Check on `/v1`), completed 2026-10-17.
- **T3.1 Provider interface and MockProvider**, completed 2026-10-17.
- **T3.2 AstrologyAPI HTTP client**, completed 2026-10-17.
- **T3.3 Response schemas, mappers and AstrologyApiProvider**, completed 2026-10-17.
- **T5.1 Timezone resolution library** (`packages/shared/src/time/resolve.ts`), completed 2026-10-17.
- **T3.4 Live provider spike**, completed 2026-10-17. It used 24 live calls. Findings are in `api-provider-notes.md`.
- **T4.1 Users module** (`GET/PATCH /v1/me`, consent), completed 2026-10-17.
- **T4.2 Quota module** (per-user daily provider-call budget), completed 2026-10-17.
- **T5.2 Places module** (`GET /v1/places`, cache, `resolvePlace`), completed 2026-10-17.
- **T5.3 Birth profiles CRUD** (`/v1/profiles`), completed 2026-10-17.
- **T4.3 Account deletion** (`DELETE /v1/me`), completed 2026-10-17.
- `UID_HASH_PEPPER` was generated into `.env` on 2026-10-17. The value was not displayed.

## In progress

- T5.3 review (owner: you).
- **Not yet wired:** the `providerCalls` metadata log. Planned with T6.1.
- **Gap found:** there is no API to change which profile is primary. The contract does not have one yet. Propose adding `isPrimary: true` to `PATCH /profiles/{id}` in T8.3, when the UI needs it.

## Blocked / failed

- **T1.2 acceptance (a green CI run on GitHub) is pending.**
  - Cause: the push was rejected because your GitHub token lacks the `workflow` scope.
  - Fix: you will fix the credential and push later, per your decision on 2026-10-17. Local commits are queued until then.
  - Once the push lands, I will check the first CI run.

## Test results

**T1.1, 2026-10-17. All checks were actually run:**

- `npm run format:check`, `lint`, and `typecheck` (root plus 2 workspaces) all exit 0.
- `npm test`: 2 test files, 2 tests passed (Vitest 5.0.5).
- A planted fake GitHub token was blocked by gitleaks (`github-pat`, exit 1).
- With gitleaks missing, the hook fails closed (exit 1, shows install instructions).
- ESLint `no-console` rejects a violation (exit 1).
- The full-history gitleaks scan finds no leaks.

**T1.2, 2026-10-17:**

- The workflow passes Prettier.
- actionlint was not run, because the Docker daemon is not running.
- **It has not run on GitHub yet.**

**T1.3, 2026-10-17. All checks were actually run:**

- Rules tests on the Firestore emulator: **85/85 pass**. They cover 9 paths × read, write, delete × 3 client types, plus a collection list and a server-bypass control.
- **Mutation test.** With rules set to `allow if request.auth != null`, **56 tests fail**, which is the expected set. This shows the tests can detect a permissive rule.
- Back-to-back runs pass. This confirms the fix for the Windows emulator-orphan bug.
- The busy-port guard refuses to start and exits 1.
- `npm run check` passes: format, lint, typecheck, and 87 tests.

**T2.1, 2026-10-17. All checks were actually run:**

- `@astro/shared`: **101 tests pass**. Over 70 of them are validation cases covering:
  - dates: leap years, 1900 bounds, future dates
  - times: 0:00 to 23:59, 24:00, decimals, strings, NaN
  - names: Devanagari, ZWJ, Tamil, NFC/NFD, apostrophes, emoji, control and bidi characters, length limits
  - unknown-time consistency
  - injected fields
  - coordinates (NaN, Infinity, out of range)
  - timezone format
  - place query length
  - the prediction date window
  - consent
  - dasha lords
  - chart shape
- **Mutation test.** Removing the ZWJ/ZWNJ allowance makes exactly the Devanagari-ZWJ test fail.
- **New guard, `check-invisible-chars`.** It is part of `npm run lint` and lint-staged. It catches planted U+202E (bidi) and U+200D in `.ts` and `.md` files, and passes on a clean repo.
- `npm run check` passes: format, lint, typecheck, and **187 tests** (101 + 1 + 85).

**T2.2, 2026-10-17. All checks were actually run:**

- `@astro/api`: **37 tests pass**.
  - Config: 14 tests covering missing variables, prod refusing the mock provider and disabled App Check, a weak pepper, and checking that values never appear in errors.
  - Redaction and hashing: 10 tests.
  - App via `inject`: 13 tests covering:
    - `/healthz` and its headers;
    - 404, malformed and empty JSON, 413 at the 16 KB boundary, 415;
    - AppError, ZodError, and a 500 that leaks nothing;
    - captured logs, which contain no query, token, or birth data.
- **Mutation test.** Disabling redaction fails 8 tests, including both end-to-end log tests.
- **Real process.**
  - The esbuild bundle (23 KB) starts, and `/healthz` and a 404 work over HTTP.
  - A bad config exits 1 and names the variables without their values.
  - `tsx` dev mode works against the shared TS source.
  - Local runs bind to 127.0.0.1 only.
- **Not verified:** graceful SIGTERM shutdown. Git Bash cannot deliver SIGTERM to a native Windows process. This will be verified on Linux or Cloud Run in T10.
- `npm run check` passes (223 tests). The prod `npm audit` finds 0 vulnerabilities.

**T2.3, 2026-10-17. All checks were actually run:**

- **Hook tests (fake verifier): 17 pass.** They cover:
  - a valid token;
  - uid hints in a header, query, or body being ignored;
  - 8 rejection cases, each giving the same generic 401 with the reason logged;
  - 503 when verification is unavailable;
  - no tokens in logs;
  - `/healthz` staying public;
  - App Check enforced (missing, forged, and valid, with order verified) and App Check off;
  - config refusing emulator variables in prod.
- **firebase-admin unit tests (mocked): 13 pass.** They assert `checkRevoked = true` and the error mapping (401 vs 503).
- **Integration against the Auth emulator: 9 pass.** Covers a real token, plus expired, wrong-project, malformed, revoked, disabled-user, and deleted-user tokens.
- **Mutation tests.**
  - Turning off `checkRevoked` was **not** caught by the emulator tests. firebase-admin always checks revocation in emulator mode (`base-auth.js:121`). The mocked unit test now catches it.
- `npm run check` passes (**262 tests**). The prod audit finds 0. The full audit still shows the same 12 dev-only findings.
- **Deviation from the backlog:** auth-failure logs are not rate-limited. Each failure is one small warn line. Volume at our scale is far below the Cloud Logging free tier. Revisit if abuse appears.

**T3.1, 2026-10-17. All checks were actually run:**

- **Provider module: 46 tests pass.**
  - Contract: every fixture parses against the shared zod schemas.
  - Consistency:
    - houses follow the Lagna, and padas follow the degrees;
    - D1 houses match the planet table;
    - Sun, Moon, and Lagna match the documented AstrologyAPI sample;
    - Mahadashas are 9, contiguous, total 120 years, start with Ketu (Moon in Ashwini), and contain the birth instant;
    - Antardashas exactly fill their Mahadasha.
  - Labelling: every result is marked `source: 'mock'`, and the prediction text starts with `[MOCK]`.
  - Input checks: NaN, out-of-range values, and a bad offset all give `bad_request`.
  - Failure injection: all 8 kinds, plus one-shot, persistent, reset, and the call log.
  - Error mapping: each kind maps to the right API error, operator alerts fire only for auth and quota, and user messages never name an endpoint or credentials.
  - Factory: the prod guard works even when config validation is bypassed.
- **Bug found and fixed.** The mock threw failures synchronously, unlike a real async provider. It now always returns rejected promises, and a regression test covers this.
- **Mutation test.** Removing the factory's prod guard is caught.
- `npm run check` passes (**308 tests**).
- **Deviation from the backlog.** Mock fixtures are TypeScript built to match the documented samples. Raw provider-JSON fixtures arrive with the mappers in T3.3.

**T3.2, 2026-10-17. All checks were actually run:**

- **Client: 51 tests pass.** No real network calls; `fetch` and `sleep` are injected.
  - Requests: Basic auth, JSON body, credentials kept out of the URL, redirects refused.
  - 9 malicious endpoint strings (`../`, a full URL, `//host`, a query, and others) are refused before any request.
  - Status classification for 13 codes.
  - No retry on 401, 402, 429, or 400.
  - 5xx is retried with 1, 2, and 4 s backoff, then gives up after 4 attempts.
  - Network errors, hung requests, a body stalled after headers, and a connection dropped mid-body are all retried.
  - Malformed responses: non-JSON, truncated, empty, null body, `200` with `status: false`, and a body over 2 MB (stopped mid-stream) all fail cleanly.
  - Multi-byte UTF-8 split across chunks is reassembled correctly.
  - Call records hold metadata only; a throwing hook is ignored.
  - Credentials and birth data never appear in errors or records.
- **Coverage of `client.ts`:** 98.4% of branches (target was 90%). The only uncovered line is an unreachable defensive branch.
- **Mutation test.** Making 4xx retryable fails 3 tests.
- `npm run check` passes (**359 tests**). The prod audit finds 0.

**T3.3, 2026-10-17. All checks were actually run:**

- **Provider module: 161 tests pass.**
  - All 9 documented samples (saved as fixtures) map cleanly.
  - The chart and planets samples agree on every graha's house.
  - 8 schema rejections pass.
  - 25 consistency rejections pass, covering charts, planets, dasha, places, time, ayanamsa, and the prediction date.
  - Date conversion for dasha and prediction dates works (year crossing, leap day, negative offset).
  - Requests send the right body: `tzone` in hours (including 5.75 and -3.5), the documented endpoints, and the lowercase `sub_vdasha` path.
  - Each result keeps the raw response and is labelled with its source.
  - Schema and mapping failures become `malformed`.
  - The factory builds the real provider with the call hook connected.
- **Coverage (branches):** `mappers.ts` 93.8%, `client.ts` 98.4%, provider class 83% (the only gap is a defensive rethrow).
- **Mutation tests.** Removing dasha contiguity fails exactly 1 test. Removing the sign-vs-longitude check fails exactly 1 test.
- `npm run check` passes (**423 tests**).
- **New finding.** The prediction response includes `prediction_date`, so predictions are cached under the provider's own date. See `api-provider-notes.md`.

**T5.1, 2026-10-17. All checks were actually run:**

- **28 documented tz database cases pass.** They cover:
  - India: IST, the 1941–45 war-time +06:30 periods, and Madras time in 1900 (+05:21:10, rounded);
  - Nepal: +05:30 before 1986 and +05:45 after;
  - New York and Sydney: DST gaps and overlaps, with both offset choices;
  - London: all-year BST in 1970 and double summer time in 1941;
  - Brazil after DST was abolished;
  - DST in Dhaka (2009) and Karachi (2008);
  - Kiritimati at +14;
  - Samoa's skipped day (2011-12-30);
  - unknown time resolving to noon.
- **15 more tests pass.** They cover:
  - the exact future check in the birthplace calendar, including UTC+14;
  - invalid zones;
  - times just outside a gap.
- **Bug found and fixed.** The runtime accepted `"IST"` as a valid zone, but "IST" is ambiguous (India, Israel, Ireland). Zones must now be in `Area/Location` form.
- **New guard.** A `tsconfig.src.json` keeps Node APIs out of the shared `src` code, which the React Native app imports. A planted `node:fs` import fails the check.
- **Mutation test.** Hiding ambiguity fails 3 overlap cases.
- `npm run check` passes (**466 tests**).

**T3.4, 2026-10-17. This was a live run that spent 24 API calls:**

- **20 of 22 data probes mapped** on the first live run.
  - Both Mahadasha calls failed the schema because the live API puts **two spaces** in dasha dates. The fix was to accept any whitespace.
  - Re-validated offline against the saved responses, nothing else needed changing.
  - The last probe (`sub_vdasha`) was then run live and maps correctly.
- **Confirmed:**
  - The ayanamsa is Lahiri.
  - Dasha dates are birth-local, and our UTC conversion gives identical periods for both tzone variants.
  - Planets depend only on the instant.
  - The birth falls inside the first Mahadasha.
  - The prediction "today" follows the birth place's tzone.
  - The 401 body format.
- **Timezone cross-check:** 9 of 10 match. The Kolkata 1900 case differs (a decision is needed).
- **Live-fixture tests:** 10 pass offline. They pin the real response formats with no credits used.
- **Credential check:** 24 saved files contain none of the credential values. The gitleaks history and staged scans are clean.

**T4.1, 2026-10-17. All checks were actually run:**

- **Integration tests on the Firestore emulator: 16 pass.** They cover:
  - the first call creates the user, with consent required and no email stored;
  - one pseudonymous `account_created` audit event (uidHash only, 180-day `expireAt`);
  - **exactly one user under 20 concurrent first requests**;
  - 401 without a token;
  - a deleting user is treated as signed out;
  - a corrupt document gives a generic 500;
  - display names: Devanagari normalized, and clearing works;
  - 400s for an invalid name, an empty update, an injected `uid`, and `profileCount` tampering;
  - consent: accepted with a timestamp, the outdated version refused with 409 and nothing stored, and re-required after a policy bump;
  - cross-user isolation;
  - the `requireConsent` guard.
- **Mutation tests.**
  - Removing the policy-version check fails exactly 1 test.
  - Reading outside the transaction fails the concurrency test.
- **Harness bug fixed.** With 2 emulators, tests could start before the Auth emulator was ready (ECONNREFUSED). `with-emulators.mjs` now waits for the CLI's "All emulators ready" banner as well as open ports. It then ran green twice in a row (263/263).
- **Refactor.** firebase-admin now uses one shared app for the auth verifier and Firestore.

**T4.2, 2026-10-17. All checks were actually run:**

- **Quota tests on the Firestore emulator: 12 pass, plus 1 app-level test.** They cover:
  - limit then 429 with `Retry-After` until UTC midnight;
  - **exactly 10 of 20 concurrent reservations succeed** at a limit of 10;
  - per-user separation;
  - the midnight reset;
  - one pseudonymous audit event per day, not per request;
  - a 7-day `expireAt`;
  - `runMetered` counts successes, refunds failures, and never calls the provider when over quota;
  - the `Retry-After` header reaches the HTTP response.
- **Contention measured.** With 5, 10, and 20 concurrent calls, exactly `limit` succeed and the rest get `QUOTA_EXCEEDED`. No contention errors leak. The emulator takes 3.7 to 7.3 s, so the two concurrency tests have a 30 s timeout.
- **Test-harness flakiness found and fixed.**
  - Integration files ran in parallel and wiped each other's emulator data. Files now run sequentially.
  - The emulator start could hang in `npx` or the CLI update check. The wrapper now runs the pinned local binary with `NO_UPDATE_NOTIFIER=1`.
  - Per-test timeout is 15 s in the API package.
  - Result: **5 of 5 consecutive runs green (276/276).**
- **Mutation tests** (each fails exactly its own target test):
  - reading outside the transaction;
  - removing the refund;
  - auditing every breach.
- `npm run check` passes (**505 tests**).

**T5.2, 2026-10-17. All checks were actually run:**

- **Places tests on the Firestore emulator: 20 pass.** They cover:
  - the contract shape and stable `placeId` values;
  - repeat and case or spacing variants serve from cache (**1 provider call and 1 quota unit in total**, shared across users);
  - the same `placeId` from different searches;
  - the 30-day cache refetches after expiry;
  - empty results are cached for 1 day only;
  - short and long queries get 400 with no provider call;
  - provider down gives 503, nothing is cached, and the quota is refunded;
  - over quota gives 429 with no provider call;
  - 401 without a token;
  - junk is dropped (an `IST` zone, an unknown zone, bad latitude), and coordinates are rounded;
  - malformed data gives 502 with the quota refunded;
  - `resolvePlace` works for searched places and rejects unknown, malformed, path-like, empty, and expired IDs.
- **Mutation tests.** Ignoring expiry on read fails the 2 expiry tests. Removing the timezone filter fails the hygiene test.
- **Bug found in my test stub and fixed.** It spread a class instance (losing its methods). It is now a `MockProvider` subclass.
- `npm run check` passes. The API suite was green on 2 consecutive runs (296/296).

**T5.3, 2026-10-17. All checks were actually run:**

- **Profile tests on the Firestore emulator: 27 pass.** They cover:
  - consent is required;
  - create with the resolved offset, with the first profile as primary;
  - unknown time gives noon;
  - a forged `placeId`, raw coordinates, a future date, and "later today in India" are rejected;
  - a NY DST gap is rejected; a NY overlap needs a choice, and with "later" stores -300;
  - a 6th profile gets 409;
  - **10 concurrent creates give exactly 5**;
  - list order and the primary flag;
  - **cross-user isolation:** read, edit, delete, and list by another user all give 404 with nothing changed, and 4 malformed or path-like IDs give 404;
  - a name-only edit keeps the hash and readings; a birth edit changes the hash and deletes readings;
  - switching to unknown time;
  - an edit that becomes ambiguous is refused with nothing changed;
  - a place change re-resolves the offset (Mumbai to London, 60);
  - delete removes readings, decrements the count, and audits;
  - deleting the primary promotes the oldest remaining profile;
  - a deleted profile frees a slot;
  - a double delete gives 404 without corrupting the count;
  - `loadForReadings` uses noon for unknown time.
- **Mutation tests** (each fails exactly its own target test):
  - no ID validation;
  - cap read outside the transaction;
  - stale readings kept;
  - newest profile promoted instead of oldest.
- **Test bugs found and fixed.**
  - A frozen test clock gave every profile the same `createdAt`, so the order tests passed by luck. A 1 s ticking clock fixes this.
  - The promotion test could not tell oldest from newest with only 2 profiles. It now uses 3.
  - A bad slice in my own test edit broke the file. This was caught because the test count dropped (323 to 296) and was repaired.
- `npm run check` passes (**541 tests**). The API suite was green 3 times in a row.

**T4.3, 2026-10-17. All checks were actually run:**

- **Deletion tests on the Firestore and Auth emulators: 8 pass.** They cover:
  - **nothing is left behind:** a recursive scan of `users/{uid}` is empty, and the auth account is gone;
  - exactly one pseudonymous audit event, even when the request repeats;
  - other users are untouched;
  - a stale sign-in (10 minutes old) gets 401 `REAUTH_REQUIRED` with nothing deleted;
  - a user with no data;
  - resuming an interrupted deletion, while active users are ignored.
- **Bug found and fixed.** A repeated DELETE wrote a second audit event. A fully deleted account (no document and no auth user) is now a no-op.
- **Mutation tests.**
  - Skipping the recursive delete fails the 2 "nothing left" tests.
  - Removing the re-auth check fails the stale-session test.
- `npm run check` passes.

## Outstanding risks

| Risk                                                                                                                         | Mitigation                                                                                                                                                         |
| ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Provider credits per call are unknown, so the real cost per user is unknown                                                  | Measure with the 150 free credits in Phase 7, then set the quota                                                                                                   |
| Provider rate limits are undocumented, and "abuse" can lead to suspension                                                    | Caching, per-user quota, App Check, max-instances cap                                                                                                              |
| Cross-user caching is not explicitly allowed in the provider's terms                                                         | Ask the provider in writing before launch                                                                                                                          |
| Historical timezone or DST errors would corrupt charts silently                                                              | Local tzdb plus a fixture cross-check against `timezone_with_dst`                                                                                                  |
| Store compliance (Sign in with Apple, account deletion, privacy policy)                                                      | These are built into the MVP scope and acceptance criteria                                                                                                         |
| Emulator env vars in a deployed env would make firebase-admin accept unsigned tokens                                         | Config refuses `FIREBASE_AUTH_EMULATOR_HOST` / `FIRESTORE_EMULATOR_HOST` in staging and prod (tested)                                                              |
| Timezone history comes from the runtime's tz data (Node 24: tzdata 2025b). Dev and prod could differ if Node versions differ | Pin the Node image version in the Dockerfile (T10). Cross-check fixtures against the provider in T3.4                                                              |
| Developer accounts and legal entity are unowned (U-7)                                                                        | Needed before staging builds reach TestFlight or Play                                                                                                              |
| 12 dev-only npm audit findings (8 high) in firebase-tools / firebase SDK transitive deps                                     | Local emulator only, bound to 127.0.0.1, never shipped. The prod audit finds 0. `--force` would downgrade majors, so it was rejected. Re-check on Firebase updates |

## Next recommended task

Approve T1.3. Then **T2.1: shared package schemas and validation**.

## Decisions awaiting your approval

1. T5.3 results.
2. Next task: **T4.3 (account deletion)**. It was deferred because it needed profiles. After it comes M6: T6.1 (charts and the providerCalls log) and T6.2 (dasha).
3. Fix the GitHub credential (`workflow` scope), then push. T1.2 is verified after that.
