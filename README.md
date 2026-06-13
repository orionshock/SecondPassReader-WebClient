# Second Pass Reading Client

A standalone, statically deployable browser reader client for a Second Pass Library server.

This repo is **not** the Django server. The backend already exists separately and must be run/deployed independently.

## Current App

- React + TypeScript + Vite
- Static build output suitable for any ordinary static HTTP server
- Hash-routed browser app with home, setup, library, shelf, sessions, and reader views
- User-provided Second Pass server URL with PIN/code Client API linking
- In-browser EPUB reading through `@likecoin/epub-ts`
- Reading sessions, progress restore/autosave, annotations, in-book search, and guided Glasp CSV marginalia import

See [`docs/README.md`](docs/README.md) for the current documentation index.

## Development (Windows 10 + VS Code)

Prereq: install Node.js **LTS** (includes `npm`).

```bash
npm install
npm run dev
```

Vite prints a local URL, typically `http://localhost:5173/`.

## Build / Preview

```bash
npm run build
npm run preview
```

## Notes

- The Django server runs separately; expect CORS configuration during development.
- Keep this app standalone with no coupling to Django templates or server-rendered pages.
- Server calls belong behind the Second Pass client/API bridge; renderer-specific behavior belongs behind the reader engine bridge.
