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

4. **`ReaderBridge`**
   - Stable interface the rest of the app uses for "open book", "go to location", "get current location", "create highlight", etc.
   - Hides renderer quirks and provides events in app-owned types.

5. **EPUB renderer implementation**
   - Initial renderer implementation: react-reader + epubjs (replaceable).
   - Replaceable via `ReaderBridge` without rewriting app state/model.

6. **Session/annotation adapter**
   - Maps renderer events (selection/range, location) into:
     - reading session updates (server-owned)
     - W3C Web Annotation JSON-LD (canonical annotation form)
   - See local read-only spec reference at `docs/specs/reading-session-annotation-profile`.
   - Client-side preview conversion helper lives in `src/features/reader/w3cAnnotationAdapter.ts` (local-only; not persisted).

7. **Local storage**
   - Stores connection profile(s) and user preferences (non-sensitive).
   - Reader settings are currently **local-only** browser preferences and are not synced to the server:
     - Phase 1: font size, theme, reader width
     - Phase 2: line height, font family, page margin
   - Avoid storing password-equivalent tokens unless explicitly designed/encrypted.

## Source layout (current scaffold)

`src/`
- `app/` App shell entrypoints/components
- `bridges/` `ServerBridge` and `ReaderBridge` abstractions
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
- Progress saving supports manual save (Save Progress) plus a debounced autosave (default on). The server upserts progress, and the client debounces writes to avoid chatty PATCH calls.
- Progress capture uses epub.js `rendition` `relocated` events when available (CFI + href + percentage progression), with CFI-only fallback.

## Reader architecture (practical)

- **Renderer boundary:** `src/features/reader/EpubReaderPanel.tsx` is the intended replaceable boundary for react-reader/epub.js. It is responsible for CFI selection capture, highlight injection/reflow, and applying local reader settings into the renderer.
- **Domain hooks:** `useReaderAnnotations.ts` (current session + drafts) and `usePreviousSessionLayers.ts` (read-only historical session layers) work in app-owned/domain types (`LocalHighlight`, semantic color tokens, CFI strings). They call the API client, but do not touch epub.js/renderer internals.
- **Server adapters:** `readingAnnotationAdapter.ts` and `w3cAnnotationAdapter.ts` own the mapping between server/W3C-ish payload shapes and the local domain types so UI components do not parse raw `body[]` arrays directly.
- **UI components:** `ReaderArea.tsx` orchestrates and wires together the hooks, panels, and renderer; panels like `SelectionToolbar.tsx`, `AnnotationPanel.tsx`, `ReaderSettingsPanel.tsx`, and `MarginaliaLayersPanel.tsx` are presentational and should not depend on renderer internals.

## Annotation adapters

- `src/features/reader/w3cAnnotationAdapter.ts`: local W3C Web Annotation JSON-LD preview/export shape (not persisted yet).
- `src/features/reader/readingAnnotationAdapter.ts`: tight Reading API `POST /reading/annotations/` create payload adapter (manual save).

## Annotation rehydration (Phase 1)

- The reader converts server annotations returned by `POST /reading/books/{book_id}/open/` into local renderable highlights and feeds them into the renderer overlay layer.
- Server delete uses `DELETE /reading/annotations/{annotation_id}/` (soft-delete).
- Saved note-backed annotations can be updated via `PATCH /reading/annotations/{annotation_id}/` (note text only in Phase 1; target/CFI editing not supported yet).
