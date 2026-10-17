# Project Status

- **Last updated:** 2026-10-17
- **Current milestone:** Phase 6, M3 Provider adapter. T3.3 is done and awaiting approval. T1.2 is waiting on GitHub verification. Next is T5.1 (it must precede T3.4).

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

## In progress

- T3.3 review (owner: you).

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

## Outstanding risks

| Risk                                                                                     | Mitigation                                                                                                                                                         |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Provider credits per call are unknown, so the real cost per user is unknown              | Measure with the 150 free credits in Phase 7, then set the quota                                                                                                   |
| Provider rate limits are undocumented, and "abuse" can lead to suspension                | Caching, per-user quota, App Check, max-instances cap                                                                                                              |
| Cross-user caching is not explicitly allowed in the provider's terms                     | Ask the provider in writing before launch                                                                                                                          |
| Historical timezone or DST errors would corrupt charts silently                          | Local tzdb plus a fixture cross-check against `timezone_with_dst`                                                                                                  |
| Store compliance (Sign in with Apple, account deletion, privacy policy)                  | These are built into the MVP scope and acceptance criteria                                                                                                         |
| Emulator env vars in a deployed env would make firebase-admin accept unsigned tokens     | Config refuses `FIREBASE_AUTH_EMULATOR_HOST` / `FIRESTORE_EMULATOR_HOST` in staging and prod (tested)                                                              |
| Developer accounts and legal entity are unowned (U-7)                                    | Needed before staging builds reach TestFlight or Play                                                                                                              |
| 12 dev-only npm audit findings (8 high) in firebase-tools / firebase SDK transitive deps | Local emulator only, bound to 127.0.0.1, never shipped. The prod audit finds 0. `--force` would downgrade majors, so it was rejected. Re-check on Firebase updates |

## Next recommended task

Approve T1.3. Then **T2.1: shared package schemas and validation**.

## Decisions awaiting your approval

1. T3.3 results.
2. **Order change.** Do T5.1 (timezone library) next, before T3.4, because the T3.4 live spike cross-checks it. The backlog's critical path already shows this order.
3. Fix the GitHub credential (`workflow` scope), then push. T1.2 is verified after that.
4. Your M0 items. **M0.1 (AstrologyAPI account) is needed for T3.4.**
