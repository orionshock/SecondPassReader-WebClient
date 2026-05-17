# Architecture (intended)

This app is a standalone static web client that talks to a Second Pass Library server over HTTP.

## Layers

1. **App shell**
   - Workflow shell (connect → pair → verify → library), global error handling, basic persistence (connection profile, preferences).

2. **Connection & auth flow**
   - UI/state for “pick server URL” + Client API linking flow.

3. **`ServerBridge` / API client**
   - Typed client for server endpoints.
   - Owns request/response shaping, auth headers, pagination patterns, and error normalization.

4. **`ReaderBridge`**
   - Stable interface the rest of the app uses for “open book”, “go to location”, “get current location”, “create highlight”, etc.
   - Hides renderer quirks and provides events in app-owned types.

5. **EPUB renderer implementation**
   - Initial candidate: epub.js / react-reader (added later).
   - Replaceable via `ReaderBridge` without rewriting app state/model.

6. **Session/annotation adapter**
   - Maps renderer events (selection/range, location) into:
     - reading session updates (server-owned)
     - W3C Web Annotation JSON-LD (canonical annotation form)

7. **Local storage**
   - Stores connection profile(s) and user preferences (non-sensitive).
   - Avoid storing password-equivalent tokens unless explicitly designed/encrypted.

## Source layout (current scaffold)

`src/`
- `app/` App shell entrypoints/components
- `api/` Low-level HTTP client(s)
- `bridges/` `ServerBridge` and `ReaderBridge` abstractions
- `features/` Feature-area modules (`connection/`, `library/`, `reader/`, `sessions/`, `annotations/`)
- `schemas/` Shared TypeScript types for API/data shapes (no validation libs yet)
- `storage/` Local persistence (connection profiles, preferences)
- `styles/` Minimal global/app CSS (no framework)

## App workflow

- The app derives a workflow step from the selected connection profile and only renders one primary step at a time:
  - connect server → pair device → verify connection → library home
- Debug/internal state is shown in a collapsible DebugDetails panel (no tokens displayed).
