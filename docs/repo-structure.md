# Repository Structure (Phase 4)

- **Status:** Draft. Awaiting approval (Phase 4 gate)
- **Tooling:** npm workspaces monorepo, TypeScript everywhere.

```
astrology/
├── apps/
│   └── mobile/                     Expo app (iOS + Android)
│       ├── app/                    expo-router routes (screens only; thin)
│       │   ├── (auth)/             sign-in, sign-up, reset-password
│       │   ├── (app)/              signed-in area: home, profiles, settings
│       │   └── _layout.tsx
│       ├── src/
│       │   ├── features/           auth, profiles, chart, dasha, prediction, settings
│       │   │                       each: components/, hooks/, api.ts, *.test.tsx
│       │   ├── chart-renderer/     North Indian SVG renderer (pure, unit-tested)
│       │   ├── lib/                api-client, firebase, query-client, i18n, errors
│       │   └── ui/                 shared design-system components
│       ├── assets/
│       ├── app.config.ts           reads EXPO_PUBLIC_* only (no secrets)
│       ├── eas.json                build profiles: development / staging / production
│       └── package.json
├── services/
│   └── api/                        Cloud Run modular monolith
│       ├── src/
│       │   ├── modules/
│       │   │   ├── auth/           token + App Check verification hook
│       │   │   ├── users/
│       │   │   ├── places/
│       │   │   ├── birth-profiles/
│       │   │   ├── charts/
│       │   │   ├── dasha/
│       │   │   ├── predictions/
│       │   │   ├── quota/
│       │   │   └── astrology-provider/
│       │   │       ├── provider.ts         interface + error types
│       │   │       ├── astrologyapi/       HTTP client, zod schemas, mappers
│       │   │       └── mock/               fixture-backed mock + failure injection
│       │   │   (each module: routes.ts, service.ts, repository.ts, *.test.ts)
│       │   ├── common/             config, errors, logger+redaction, hashing,
│       │   │                       idempotency, firestore client
│       │   ├── app.ts              builds Fastify instance (used by tests)
│       │   └── server.ts           entrypoint
│       ├── migrations/             NNNN_*.ts idempotent data migrations
│       ├── test/
│       │   ├── integration/        against Firebase emulators + mock provider
│       │   └── fixtures/           recorded provider responses, tz cases, birth cases
│       ├── Dockerfile
│       └── package.json
├── packages/
│   └── shared/                     zod schemas, API types, error codes, validation
│       └── src/
├── e2e/                            Maestro mobile flows (+ API e2e script)
├── infra/
│   ├── firebase/                   firebase.json, firestore.rules, firestore.indexes.json
│   ├── gcp/                        documented gcloud setup scripts (idempotent)
│   └── README.md
├── .github/workflows/              ci.yml, deploy-api.yml
├── docs/                           requirements, architecture, data model, status, runbooks
├── scripts/                        dev helpers (start emulators, seed, etc.)
├── .env.example                    placeholders only
├── .gitignore                      .env*, node_modules, build output, logs, *.keystore, google-services files
├── package.json                    workspaces + root scripts
├── tsconfig.base.json
└── README.md
```

## Responsibilities and rules

| Directory                    | Owns                                                                                         | Must not                                                                                  |
| ---------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `apps/mobile`                | UI, navigation, on-device caching, chart drawing                                             | Hold any secret. Call AstrologyAPI directly. Contain business rules beyond display.       |
| `services/api/src/modules/*` | One domain each                                                                              | Import another module's `repository.ts`. Cross-module calls go through `service.ts` only. |
| `astrology-provider`         | All knowledge of AstrologyAPI field names and quirks                                         | Leak provider types outside the module. Others see internal models only.                  |
| `packages/shared`            | Contracts and validation used by the app and the API                                         | Import Node-only or React Native-only code                                                |
| `infra`                      | Rules, indexes, cloud setup                                                                  | Contain secrets or service-account keys                                                   |
| `test/fixtures`              | Provider responses recorded from staging, **with birth data replaced by synthetic profiles** | Contain real user data                                                                    |

## Differences from the brief's example layout

- **Unit tests sit next to the code** (`*.test.ts`). Only integration fixtures live in a central `test/` folder. Keeping tests beside the code makes them easier to keep in sync, which rule 14 asks for.
- There is a separate `packages/shared` folder, because both the app and the API must agree on schemas.
- `infra/` uses documented `gcloud` scripts instead of Terraform. At 2 projects and a handful of resources, Terraform's added state and tooling don't pay off yet. We can move to it if the infra grows.

## Tooling

| Concern                         | Tool                                                                                                                         |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| API and shared tests            | Vitest                                                                                                                       |
| Mobile unit and component tests | Jest (`jest-expo`) + React Native Testing Library                                                                            |
| Mobile E2E                      | **Maestro** (simple YAML flows, works with Expo dev builds). Detox is the alternative: more powerful, but heavier to set up. |
| Integration environment         | Firebase Emulator Suite (Auth + Firestore)                                                                                   |
| Lint and format                 | ESLint (typescript-eslint) + Prettier                                                                                        |
| Type checking                   | `tsc --noEmit` per workspace                                                                                                 |
| Secret scanning                 | gitleaks (in CI and as a pre-commit hook)                                                                                    |
| Dependency audit                | `npm audit --omit=dev` in CI                                                                                                 |
| Git hooks                       | husky + lint-staged                                                                                                          |
