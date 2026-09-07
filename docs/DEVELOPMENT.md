# Development

## Prerequisites

- The primary development environment is Windows 10 with VS Code.
- Install the Node.js version in `.node-version` and the npm major declared in
  `package.json`.
- Keep the repo in a normal local folder rather than a synced/network folder when possible.

## Install

```bash
npm install
```

## Run Locally

```bash
npm run dev
```

Vite prints the local URL, usually `http://localhost:5173/`.

The Django server is separate from this repo. For local development, configure the server to allow
the Vite origin with CORS. Do not bypass CORS in the client.

## Build

```bash
npm run build
```

The build command:

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

## Verify

Run the complete local verification gate with:

```bash
npm run verify
```

This runs repository hygiene, Vitest in noninteractive mode, and the production build. The VS Code
`Verify: all` task runs the same command.

## Static Deployment

The build output is in `dist/`. Serve it from a static HTTP server. Users select a Second Pass server
in the browser connection flow.

## Common Local State

Browser storage contains:

- connection profiles and bearer token
- app theme
- reader settings
- library display preferences
- reader return targets
- marginalia layer preferences

Bearer tokens are password-equivalent. Do not log them or add them to URLs.
