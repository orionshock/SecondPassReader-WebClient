# SPL API (`@secondpass/client`)

This document describes the internal **Second Pass Library (SPL)** client contract exposed by `@secondpass/client`.

## 1) Purpose

- Stable client-side API boundary between app/features and the Second Pass server.
- Hides endpoint paths, auth headers, `fetch`, and response quirks behind a single facade.
- **Pure TypeScript** package:
  - no React
  - no EPUB renderer integration (no epub.js / react-reader)
  - no DOM/UI assumptions
  - no routing
  - no `localStorage`

## 2) Import rule

App code imports server/API behavior **only** from:

```ts
import { createSecondPassClient } from "@secondpass/client";
```

App code must not import:
- package-private implementation modules (e.g. `clientApiAuthApi`, `libraryApi`, `readingApi`, `shelvesApi`, `apiHttp`)
- endpoint paths or raw `fetch`
- legacy app shims (the old `src/api/*` folder)

## 3) Client facade

The current public facade is:
- `createSecondPassClient(config) -> SecondPassClient`

Notes:
- The API is domain-shaped (namespaces) and instance-based; config supplies `apiBaseUrl`, `accessToken`, and `tokenType`.

## 4) Major API areas (current)

All methods return Promises and throw on failures (see Error model).

### Create client

```ts
const spl = createSecondPassClient({ apiBaseUrl, accessToken, tokenType });
```

Notes:
- `accessToken` is optional for server-level discovery/linking calls (`spl.server.*`). Auth-required namespaces throw if called without credentials.

### server

- `spl.server.discover(serverBaseUrl)`
- `spl.server.createLoginRequest(discovery, input?)`
- `spl.server.pollLoginRequest(pollUrl)`

### account

- `spl.account.getCurrent()`

### library.books

- `spl.library.books.list(params?)`
- `spl.library.books.get(bookId)`
- `spl.library.books.downloadEpub(bookIdOrBook)` (preferred)
- `spl.library.books.downloadFile(downloadUrl)` (low-level / escape hatch)

### library.series

- `spl.library.series.list(params?)`
- `spl.library.series.get(seriesId)`
- `spl.library.series.books(seriesId, params?)` (delegates to book listing with `series=<seriesId>`)

### library.authors

- `spl.library.authors.list(params?)`
- `spl.library.authors.get(authorId)`
- `spl.library.authors.books(authorId, params?)` (delegates to book listing with `author=<authorId>`)

### shelves

- `spl.shelves.list(params?)`
- `spl.shelves.get(shelfId)`
- `spl.shelves.items(shelfId, params?)`

### reading

- `spl.reading.openForReading(bookIdOrBook)` (open session + download EPUB blob)

### reading.sessions

- `spl.reading.sessions.open(bookId)`
- `spl.reading.sessions.startOver(bookId)`
- `spl.reading.sessions.recent(params?)`
- `spl.reading.sessions.list(params?)`
- `spl.reading.sessions.get(sessionId)`
- `spl.reading.sessions.updateDetails(sessionId, { name?, notes? })`
- `spl.reading.sessions.close(sessionId)`

### reading.progress

- `spl.reading.progress.save(sessionId, { profileVersion, cfi, href?, bookProgress?, format? })` (preferred)

### reading.annotations

- `spl.reading.annotations.list({ sessionId, page? })`
- `spl.reading.annotations.createHighlight(input, { idempotencyKey? }?)`
- `spl.reading.annotations.createBookmark(input, { idempotencyKey? }?)`
- `spl.reading.annotations.updateNote(annotationId, input)`
- `spl.reading.annotations.remove(annotationId)` (server-side soft-delete)
- `spl.reading.annotations.raw.create(payload, { idempotencyKey? }?)` (escape hatch)
- `spl.reading.annotations.raw.update(annotationId, payload)` (escape hatch)

## 5) Error model

Public errors exported by the package:
- `ApiError`
- `ApiErrorKind`

Callers should treat thrown errors as normal JavaScript errors:
- catch and render user-friendly messages
- do not log bearer tokens

Future: structured server error codes may be surfaced later without changing the import boundary.

## 6) Events

No event bus currently; the boundary is standard request/response via Promises.

Possible future events (not implemented):
- `pairing.completed`
- `profile.changed`
- `auth.expired`
- `session.closed`
- `annotation.saved`

## 7) Boundary with reader renderer

`@secondpass/client` does not know about EPUB rendering.

- Renderer boundary remains `ReaderBridge` + the concrete renderer implementation (currently `EpubReaderPanel`).
- Reader adapters translate between SPL domain models (sessions/annotations) and renderer highlight/location models.
