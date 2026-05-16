# Second Pass Reading Client

A standalone, statically-deployable browser reader client for a Second Pass Library server.

This repo is **not** the Django server. The backend already exists separately and must be run/deployed independently.

## Tech direction

- React + TypeScript + Vite
- Static build output suitable for any dumb static HTTP server
- Connects to a user-provided Second Pass server URL using the server’s Client API linking flow
- In-browser EPUB reading (renderer will be integrated later)

## Development (Windows 10 + VS Code)

Prereq: install Node.js **LTS** (includes `npm`).

```bash
npm install
npm run dev
```

Vite prints a local URL (typically `http://localhost:5173/`).

### Build / preview

```bash
npm run build
npm run preview
```

## Notes

- The Django server runs separately; expect CORS configuration during development.
- Keep this app standalone (no coupling to Django templates or server-rendered pages).

