# AGENTS

## Specifications

Specifications are located under `/specs/` directory, they describe different aspects of the project, conventions, user stories, etc. 
They need to be respected, they serve as the source of truth about the project 
(perhaps, apart from parts that are not described as specs, in which case it is always a good idea to cover such things with a spec).

## Project Overview

- `shared-core`
  - Kotlin Multiplatform domain and presenter layer.
  - Holds UI-facing state models, transaction/account/unit/analytics/sync/settings presenters, and business rules.
- `shared-db`
  - Kotlin Multiplatform SQLDelight data layer.
  - Owns the schema, migrations, repository implementations, browser DB session/cache helpers, and transaction/account/unit persistence.
- `shared-bridge-web`
  - JS-facing Kotlin bridge for the web app.
  - Exposes serialized state slices and commands for the React app.
  - This is the boundary between TypeScript UI and Kotlin business/data logic.
- `web-app`
  - React + Vite frontend.
  - Renders the UI, subscribes to bridge state slices, and calls bridge commands.
  - Google Drive integration is wired here through the Kotlin bridge, while Playwright E2E tests mock the Drive-facing behavior.

## Runtime Shape

- The web app is the main active client under development.
- Browser state is intentionally fragmented:
  - transactions
  - units
  - accounts
  - analytics
  - sync
  - settings
- Do not reintroduce a single app-wide snapshot boundary for the web app.
- Transaction lists are intentionally windowed:
  - only the visible transaction slice should be observed from the DB
  - older rows are loaded explicitly
- Account details must react to:
  - accounts changes
  - assets changes
  - units changes

## Working Notes

- Do not run any build or test scripts (npm, gradle) in parallel!
- In particular, `npm run build`, `npm run test:e2e`, and `npm run build:kotlin-bridge` must be run one at a time.
- Reason: those scripts rebuild and copy the Kotlin web bridge artifacts from `shared-bridge-web/build/...` into `web-app/public/generated/kotlin`. Parallel runs can delete or overwrite files mid-run and cause `ENOENT` failures in `sync-kotlin-bridge.mjs`.
- Safe pattern:
  - finish `npm run build`
  - then run `npm run test:e2e`
- Unsafe pattern:
  - starting `npm run build` and `npm run test:e2e` at the same time
- When finalizing some codebase change, always verify that the full test suite passes, not only some specific test cases (of course, while doing the changes, you can run only a part of the tests, that's ok).

## DB Migrations

- Add new schema upgrades as new SQLDelight migration files under `shared-db/src/commonMain/sqldelight/migrations/`.
- Do not rewrite old migration files to introduce new schema changes. Existing users may already have databases on older versions, so migration history must stay compatible.
- When renaming tables or columns, prefer a forward migration that creates the new shape, copies data across, and drops the old shape if needed.
- Keep compatibility in mind for users upgrading from older DB versions, not just for freshly created databases.
- Add or update migration tests whenever the schema changes, so upgrades from older DB versions are verified explicitly.
