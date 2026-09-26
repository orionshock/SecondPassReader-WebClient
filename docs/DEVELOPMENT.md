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

During development, run the smallest affected Vitest files first. Touched-file hygiene is available
for a quick local loop:

```powershell
npm.cmd run hygiene:touched
```

Before completing an ordinary change, run the authoritative repository gate:

```powershell
npm.cmd run verify
```

It always scans the complete repository with `hygiene:all`, runs the complete application and SDK
Vitest suite noninteractively, builds SDK declarations, type-checks the application and Vite config,
and creates the production Vite bundle. The VS Code `Verify: all` task runs the same script.

Individual commands remain useful for diagnosis:

```powershell
npm.cmd run hygiene:all
npm.cmd --prefix packages/secondpass-client test
npm.cmd --prefix packages/secondpass-client run build
```

Root Vitest discovers application and SDK tests recursively under their respective
`src/__tests__/` directories. `verify` already includes `git diff --check` through all-file hygiene.

### Coverage

Run coverage selectively for test-strategy or substantial correctness work:

```powershell
npm.cmd run test:coverage
```

Coverage measures executable TypeScript and TSX under the application and SDK production roots.
Tests, test fixtures, declarations, type-only modules, entry-only bootstrap code, and the SDK barrel
are excluded. The report is an honest diagnostic rather than a release threshold; React rendering
and browser lifecycle code often need integration or manual evidence that line coverage cannot
provide. A denominator guard fails if either production root disappears or the measured file/line
universe becomes implausibly small.

### Specialized checks

Run `npm.cmd audit` and `npm.cmd audit --omit=dev` during dependency updates or periodic dependency
maintenance. They require registry access and do not belong in deterministic routine verification.

Docker validation remains separate because it requires a suitable runner. After Docker, nginx,
runtime preset, healthcheck, dependency-install, or deployment changes, dispatch the `Build
development image` workflow. It builds the production Dockerfile, exercises the resulting image,
publishes immutable and `dev` tags, and proves the immutable registry image after pulling it back.
See [deployment.md](./deployment.md).

## Build and preview

```powershell
npm.cmd run build
npm.cmd run preview
```

The build writes the static application to `dist/`. Production container and reverse-proxy
requirements belong in [deployment.md](./deployment.md).

## Browser-local data

Origin-scoped `localStorage` stores one active connection, including its bearer token, plus
application appearance, Reader settings, Library display preferences, Reader return targets, and
Marginalia layer preferences.
IndexedDB separately stores namespace-scoped cached projections, explicitly retained publication
assets and covers, Reader continuity, and pending Reader work.

Bearer tokens are password-equivalent, and any script executing in the application origin can read
this stored token. Never log tokens or place them in URLs. Sign-out and connection removal delete
the active connection record. See [offline-mode.md](./offline-mode.md) for namespace, retention,
repair, and cleanup rules.
