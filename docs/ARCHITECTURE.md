# Architecture (intended)

This app is a standalone static web client that talks to a Second Pass Library server over HTTP.

## Layers

1. **App shell**
   - Product workflow shell (connect → pair → verify → library → reader/settings), global error handling, basic persistence (connection profile, preferences).

2. **Connection & auth flow**
   - UI/state for “pick server URL” + Client API linking flow.

3. **`ServerBridge` / API client**
   - Typed client for server endpoints.
   - Owns request/response shaping, auth headers, pagination patterns, and error normalization.

4. **`ReaderBridge`**
   - Stable interface the rest of the app uses for “open book”, “go to location”, “get current location”, “create highlight”, etc.
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
   - Reader settings (font size/theme/width) are currently **local-only** browser preferences (Phase 1) and are not synced to the server.
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
  - connect server → pair device → verify connection → library home → reader mode (when a book is open)
- Debug/internal state is shown in a collapsible DebugDetails panel (no tokens displayed).
- Reader mode uses a book-focused layout and hides the normal app header to keep reading focused.
- Session lifecycle UI is intentionally surfaced only near end-of-book (currently a compact banner; actions are placeholders except Resume).
- Banner supports same-session “Go to start”; “close session first + Go to start” uses `POST /reading/books/{book_id}/start-over/` when available.

## Reader launch

- The Open Reader flow bootstraps server reading state by calling `POST /reading/books/{book_id}/open/` (session + progress + first page of annotations) before downloading/rendering the EPUB.
- Progress saving supports manual save (Save Progress) plus a debounced autosave (default on). The server upserts progress, and the client debounces writes to avoid chatty PATCH calls.
- Progress capture uses epub.js `rendition` `relocated` events when available (CFI + href + percentage progression), with CFI-only fallback.

## Annotation adapters

- `src/features/reader/w3cAnnotationAdapter.ts`: local W3C Web Annotation JSON-LD preview/export shape (not persisted yet).
- `src/features/reader/readingAnnotationAdapter.ts`: tight Reading API `POST /reading/annotations/` create payload adapter (manual save).

## Annotation rehydration (Phase 1)

- The reader converts server annotations returned by `POST /reading/books/{book_id}/open/` into local renderable highlights and feeds them into the renderer overlay layer.
- Server delete uses `DELETE /reading/annotations/{annotation_id}/` (soft-delete).
- Saved note-backed annotations can be updated via `PATCH /reading/annotations/{annotation_id}/` (note text only in Phase 1; target/CFI editing not supported yet).
