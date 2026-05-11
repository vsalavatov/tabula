# Tabula

Tabula is a web-first Kotlin Multiplatform finance/inventory app.

The active app path is:

- `web-app/` for the React + Vite UI
- `shared-bridge-web/` for the Kotlin JS bridge
- `shared-db/` for SQLDelight-backed browser DB/session logic
- `shared-core/` for shared business logic and presenters

## Prerequisites

- JDK 21
- Node.js 22.x with `npm`
- Windows PowerShell for the commands below

If you use `nvm-windows`, activate the validated Node version first:

```powershell
nvm use 22.14.0
```

## Install

```powershell
cd web-app
npm install
```

## Run the web app

```powershell
cd web-app
npm run dev -- --host 127.0.0.1 --port 4173
```

Then open [http://127.0.0.1:4173](http://127.0.0.1:4173).

## Build

```powershell
cd web-app
npm run build
```

Production output goes to `web-app/dist/`.

## E2E tests

Install the Playwright browser once:

```powershell
cd web-app
npx playwright install chromium
```

Run the suite:

```powershell
npm run test:e2e
```

The E2E suite runs the real app and mocks only the Google Drive layer.

## Verification

Repo-level build:

```powershell
.\gradlew.bat build
```

Web build:

```powershell
cd web-app
npm run build
```

## Project layout

```text
shared-core/         Portable business logic and presenters
shared-db/           SQLDelight schema, repositories, JS DB session
shared-bridge-web/   JS-facing Kotlin bridge
web-app/             React + TypeScript + Vite frontend
```

## Notes

- `web-app/package-lock.json` is committed intentionally.
- Do not run `npm run build`, `npm run test:e2e`, and `npm run build:kotlin-bridge` in parallel.
- The web app persists the browser DB locally and can cache the Google Drive access token in browser storage.
