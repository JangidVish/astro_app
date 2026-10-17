# Project Status

- **Last updated:** 2026-10-17
- **Current milestone:** Phase 6, M1 Project setup. T1.1 is done and awaiting approval. Next is T1.2.

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
- **T1.1 Monorepo scaffold and tooling**, completed 2026-10-17. See Test results.

## In progress

- T1.1 review (owner: you).

## Blocked / failed

- None.

## Test results

**T1.1, 2026-10-17. All checks were actually run:**

- `npm run format:check`, `lint`, and `typecheck` (root plus 2 workspaces) all exit 0.
- `npm test`: 2 test files, 2 tests passed (Vitest 5.0.5).
- A planted fake GitHub token was blocked by gitleaks (`github-pat`, exit 1).
- With gitleaks missing, the hook fails closed (exit 1, shows install instructions).
- ESLint `no-console` rejects a violation (exit 1).
- The full-history gitleaks scan finds no leaks.

## Outstanding risks

| Risk                                                                        | Mitigation                                                        |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Provider credits per call are unknown, so the real cost per user is unknown | Measure with the 150 free credits in Phase 7, then set the quota  |
| Provider rate limits are undocumented, and "abuse" can lead to suspension   | Caching, per-user quota, App Check, max-instances cap             |
| Cross-user caching is not explicitly allowed in the provider's terms        | Ask the provider in writing before launch                         |
| Historical timezone or DST errors would corrupt charts silently             | Local tzdb plus a fixture cross-check against `timezone_with_dst` |
| Store compliance (Sign in with Apple, account deletion, privacy policy)     | These are built into the MVP scope and acceptance criteria        |
| Developer accounts and legal entity are unowned (U-7)                       | Needed before staging builds reach TestFlight or Play             |

## Next recommended task

Approve T1.1. Then **T1.2: CI pipeline** (GitHub Actions).

## Decisions awaiting your approval

1. T1.1 results. Note: TypeScript is pinned to 6.0.3, not 7.0, because typescript-eslint supports only <6.1.
2. Your M0 items (see `backlog.md`).
