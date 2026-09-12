# Development

## Prerequisites

- Windows 10 with VS Code is the primary development environment.
- Install the Node.js version in `.node-version` and the npm major declared in `package.json`.
- Prefer a normal local directory over a synchronized or network directory.

## Install

Use the committed lockfile for a clean, reproducible install:

```powershell
npm.cmd ci
```

The root `postinstall` script applies patches with `patch-package`. Installation must report that
`patches/@likecoin+epub-ts+0.7.2.patch` applied successfully; a patch failure is an install failure.
See [epub-ts-support-issues.md](./epub-ts-support-issues.md) for the defect and regression evidence.

When intentionally changing a dependency, use:

```powershell
npm.cmd install <package>
```

Commit the resulting `package.json` and `package-lock.json` changes. Do not edit the lockfile by
hand. If the epub-ts version changes, re-evaluate the patch against pristine upstream code before
regenerating or removing it.

## Run locally

```powershell
npm.cmd run dev
```

Vite prints the local URL, usually `http://localhost:5173/`.

Second Pass Library runs separately. Its CORS policy must allow the Vite origin; do not bypass CORS
inside the Web Client.

## Local Library presets

Create the ignored file `public/secondpass-servers.json` to populate the local server picker. Vite
serves it at `/secondpass-servers.json`.

```json
[
  "https://library.example.com/",
  "http://localhost:8000/"
]
```

The file contains only Second Pass Library URLs. The connection page obtains names and descriptions
through public discovery. Each Library must allow the Vite origin through CORS. Never put bearer
tokens or other credentials in this file.

## Validation

Run the repository verification gate:

```powershell
npm.cmd run verify
```

It runs repository hygiene, Vitest in noninteractive mode, and the production build. The VS Code
`Verify: all` task runs the same script.

Individual commands are available when a narrower check is appropriate:

```powershell
npm.cmd run hygiene
npm.cmd test -- --run
npm.cmd run build
npm.cmd --prefix packages/secondpass-client test
npm.cmd --prefix packages/secondpass-client run build
git diff --check
```

The application and SDK tests are discovered recursively under their respective `src/__tests__/`
directories.

## Build and preview

```powershell
npm.cmd run build
npm.cmd run preview
```

The build writes the static application to `dist/`. Production container and reverse-proxy
requirements belong in [deployment.md](./deployment.md).

## Browser-local data

The browser stores one active connection, its bearer token, application appearance, Reader
settings, Library display preferences, Reader return targets, and Marginalia layer preferences.
IndexedDB separately stores namespace-scoped cached projections, explicitly retained publication
assets and covers, Reader continuity, and pending Reader work.

Bearer tokens are password-equivalent. Never log them or place them in URLs. See
[offline-mode.md](./offline-mode.md) for namespace, retention, repair, and cleanup rules.
