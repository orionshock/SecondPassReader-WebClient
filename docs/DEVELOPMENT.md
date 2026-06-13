# Development

## Prerequisites

- Windows 10 + VS Code is the assumed primary development environment.
- Install Node.js LTS, including `npm`.
- Keep the repo in a normal local folder rather than a synced/network folder when possible.

## Install

```bash
npm install
```

## Run Locally

```bash
npm run dev
```

Vite prints a local URL, usually `http://localhost:5173/`.

The Django server is separate from this repo. For local development, configure the server to allow the Vite origin with CORS. Do not try to bypass CORS in the client.

## Build

```bash
npm run build
```

Build does three things:

1. Builds `@secondpass/client`.
2. Runs TypeScript project build with `tsc -b`.
3. Runs `vite build`.

## Preview

```bash
npm run preview
```

## Tests

```bash
npm run test
```

Tests use Vitest. Current app tests live under `src/__tests__/`.

For the client package only:

```bash
npm run test -w @secondpass/client
```

## Static Deployment

The app builds to `dist/` and is intended to be served by a static HTTP server. Runtime server selection happens in the browser through the connection flow.

## Common Local State

The app stores non-server local state in browser storage, including:

- connection profiles and bearer token
- app theme
- reader settings
- library display preferences
- reader return targets
- marginalia layer preferences

Bearer tokens are password-equivalent. Do not log them or add them to URLs.

