# Project Status

- **Last updated:** 2026-10-17
- **Current milestone:** Phase 5, Implementation backlog (awaiting approval)

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

## In progress
- Phase 5 backlog review (owner: you).

## Blocked / failed
- None.

## Test results
- None. No code exists yet.

## Outstanding risks
| Risk | Mitigation |
|---|---|
| Provider credits per call are unknown, so the real cost per user is unknown | Measure with the 150 free credits in Phase 7, then set the quota |
| Provider rate limits are undocumented, and "abuse" can lead to suspension | Caching, per-user quota, App Check, max-instances cap |
| Cross-user caching is not explicitly allowed in the provider's terms | Ask the provider in writing before launch |
| Historical timezone or DST errors would corrupt charts silently | Local tzdb plus a fixture cross-check against `timezone_with_dst` |
| Store compliance (Sign in with Apple, account deletion, privacy policy) | These are built into the MVP scope and acceptance criteria |
| Developer accounts and legal entity are unowned (U-7) | Needed before staging builds reach TestFlight or Play |

## Next recommended task
Approve the backlog. Then Phase 6 begins with **T1.1, the monorepo scaffold and tooling**.

## Decisions awaiting your approval
1. The backlog and milestone order in `backlog.md`.
2. Your M0 items: AstrologyAPI account, GCP billing, Apple and Google developer accounts, Expo account, privacy policy, branding. These can run in parallel with development.
