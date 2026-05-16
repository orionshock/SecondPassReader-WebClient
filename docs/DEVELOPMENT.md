# Development (Windows 10 + VS Code)

## Prereqs

- Install Node.js **LTS** (includes `npm`).
- Use a local folder (avoid OneDrive/network-synced folders when possible to prevent file watcher issues).

## Setup

```bash
npm install
npm run dev
```

Vite prints a local URL (typically `http://localhost:5173/`).

## Backend server

- The Django server runs separately and is not part of this repo.
- During local development you will likely need **CORS** enabled on the server for the Vite dev origin.

## Common notes

- Connection profiles are stored in the browser via `localStorage` (no server auth in the connection phase).
- Prefer using a `.env.local` file for local-only settings (never commit secrets).
- If you see strange reload or watcher behavior, move the repo out of synced folders and retry.
