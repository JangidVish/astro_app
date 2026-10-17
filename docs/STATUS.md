# Project Status

- **Last updated:** 2026-10-17
- **Current milestone:** Phase 6, M2 API foundation. T2.1 is done and awaiting approval. T1.2 is waiting on GitHub verification. Next is T2.2.

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

## In progress

- T2.1 review (owner: you).

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

## Outstanding risks

| Risk                                                                                     | Mitigation                                                                                                                                                         |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Provider credits per call are unknown, so the real cost per user is unknown              | Measure with the 150 free credits in Phase 7, then set the quota                                                                                                   |
| Provider rate limits are undocumented, and "abuse" can lead to suspension                | Caching, per-user quota, App Check, max-instances cap                                                                                                              |
| Cross-user caching is not explicitly allowed in the provider's terms                     | Ask the provider in writing before launch                                                                                                                          |
| Historical timezone or DST errors would corrupt charts silently                          | Local tzdb plus a fixture cross-check against `timezone_with_dst`                                                                                                  |
| Store compliance (Sign in with Apple, account deletion, privacy policy)                  | These are built into the MVP scope and acceptance criteria                                                                                                         |
| Developer accounts and legal entity are unowned (U-7)                                    | Needed before staging builds reach TestFlight or Play                                                                                                              |
| 12 dev-only npm audit findings (8 high) in firebase-tools / firebase SDK transitive deps | Local emulator only, bound to 127.0.0.1, never shipped. The prod audit finds 0. `--force` would downgrade majors, so it was rejected. Re-check on Firebase updates |

## Next recommended task

Approve T1.3. Then **T2.1: shared package schemas and validation**.

## Decisions awaiting your approval

1. T2.1 results. There are three contract changes:
   - prediction date window is ±2 days from the server's UTC date (was ±1);
   - new route `GET /profiles/{id}/planets` for unknown-time profiles;
   - profiles reference places by `placeId` only.
2. Fix the GitHub credential (`workflow` scope), then push. T1.2 is verified after that.
3. Your M0 items (see `backlog.md`).
