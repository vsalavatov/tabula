# Tabula

Tabula is a client-only web personal finance/inventory app.
Hosted on [GitHub Pages](https://vsalavatov.github.io/tabula/). 

Features:
* arbitrary customizable currencies
* multiple accounts (but not multiple users)
* multi-transfer transactions
* quick transactions input via keyboard shortcuts and quick-search
* data stays in your browser, see [PRIVACY.md](PRIVACY.md) for details on data handling 
* optional backup & sync via Google Drive

Transaction input tips (while the help is not implemented inside the app):
* date can be adjusted by using up/down arrows, or just start typing the date you want, the field mimics the insert mode
* use Tab to change fields
* to select an account / currency, start typing its name, press Enter to select it
* press Enter to add the transaction

(input is not super polished still, but it mostly does what is expected)

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
