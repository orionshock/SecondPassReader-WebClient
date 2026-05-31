# Architecture (intended)

This app is a standalone static web client that talks to a Second Pass Library server over HTTP.

## Layers

1. **App shell**
   - Product workflow shell (connect -> pair -> verify -> library -> reader/settings), global error handling, basic persistence (connection profile, preferences).

2. **Connection & auth flow**
   - UI/state for "pick server URL" + Client API linking flow.

3. **SPL client package (`@secondpass/client`)**
   - Pure TypeScript client for server endpoints (no React, renderer, DOM, routing, or storage).
   - Owns request/response shaping, auth headers, pagination patterns, and error normalization.
   - **Boundary rule:** feature/UI code should import and call the public facade from `@secondpass/client`.
     - Endpoint modules inside the package (`clientApiAuthApi.ts`, `libraryApi.ts`, `readingApi.ts`, `shelvesApi.ts`, `apiHttp.ts`) are **private implementation details**.
     - No `fetch()` calls should exist outside `packages/secondpass-client/`.

4. **Reader feature (`src/features/reader`)**
   - Session-centered reader architecture (route/activity -> session orchestrator -> reading shell -> engine/viewport).
   - Renderer-specific code stays inside the reader engine boundary (`EpubTsBookEngine`).
   - Reader shell emits normalized events (e.g. location changed) and accepts commands (e.g. display target).

5. **Annotation/session coordination (future)**
   - The session layer coordinates server state (sessions/progress/annotations) with the reader shell.
   - Canonical annotation data remains W3C Web Annotation JSON-LD with EPUB CFI selectors (server-owned contract).

7. **Local storage**
   - Stores connection profile(s) and user preferences (non-sensitive).
   - Reader settings are currently **local-only** browser preferences and are not synced to the server:
     - Phase 1: font size, theme, reader width
     - Phase 2: line height, font family, page margin
   - Avoid storing password-equivalent tokens unless explicitly designed/encrypted.

## Source layout (current scaffold)

`src/`
- `app/` App shell entrypoints/components
- `features/` Feature-area modules (`connection/`, `library/`, `reader/`, `sessions/`, `annotations/`)
- `storage/` Local persistence (connection profiles, preferences)
- `styles/` Minimal global/app CSS (no framework)

`packages/`
- `secondpass-client/` SPL client package (`@secondpass/client`) with endpoint + transport internals (pure TypeScript)

## API boundary (SPL)

`@secondpass/client` is the app-facing "Second Pass Library" (SPL) boundary:
- Feature modules (`src/features/*`) should call the configured SPL client returned by `createSecondPassClient()` and not depend on endpoint URLs, headers, auth construction, or pagination details.
- Endpoint modules inside the package are free to change internally as long as the facade remains stable.
- Schema/types for server contracts live in the package and are re-exported from `@secondpass/client`.
- SPL API contract doc: `docs/SPL_API.md`.

Future (optional): if the facade grows too endpoint-shaped, we can introduce a dedicated `src/spl/` package for app-facing domain methods while keeping the package's internal endpoint/transport layer private.

### Potential future app events (not implemented)

The current app uses promise-returning request/response calls, not an event bus. If we later add lightweight events, likely candidates:
- `pairing.completed`
- `profile.changed`
- `auth.expired`
- `session.closed`
- `annotation.saved`

## App workflow

- The app derives a workflow step from the selected connection profile and only renders one primary step at a time:
  - connect server -> pair device -> verify connection -> library home -> reader mode (when a book is open)
- Debug/internal state is shown in a collapsible DebugDetails panel (no tokens displayed).
- Reader mode uses a book-focused layout and hides the normal app header to keep reading focused.
- Session lifecycle UI is intentionally surfaced only near end-of-book (currently a compact banner; actions are placeholders except Resume).
- Banner supports same-session "Go to start"; "close session first + Go to start" uses `POST /reading/books/{book_id}/start-over/` when available.

## Reader launch

- The Open Reader flow bootstraps server reading state by calling `POST /reading/books/{book_id}/open/` (session + progress + first page of annotations) before downloading/rendering the EPUB.
- Progress saving uses a debounced autosave in the session layer, persisting CFI as the restore anchor and sending approximate progression metadata when available.

## Reader architecture (practical)

- **Route/activity container:** `src/features/reader/ReadingActivity.tsx`
- **Session orchestration:** `src/features/reader/session/ReadingSessionOrchestrator.tsx` owns session coordination and server sync.
- **Reading shell:** `src/features/reader/shell/ReadingShell.tsx` owns reader interaction surface and events/commands.
- **Engine boundary:** `src/features/reader/engine/EpubTsBookEngine.ts` owns `@likecoin/epub-ts` details.
- **Viewport boundary:** `src/features/reader/viewport/ReaderViewport.tsx` owns the DOM mount container only.

## Annotation adapters

Not implemented in the current reader rebuild yet. When reintroduced, adapters should live in the session layer and keep renderer concerns isolated in the shell/engine boundary.

## Annotation rehydration (Phase 1)

Not implemented in the current reader rebuild yet.
