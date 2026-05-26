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
import { SecondPassApiClient } from "@secondpass/client";
```

App code must not import:
- package-private implementation modules (e.g. `clientApiAuthApi`, `libraryApi`, `readingApi`, `shelvesApi`, `apiHttp`)
- endpoint paths or raw `fetch`
- legacy app shims (the old `src/api/*` folder)

## 3) Client facade

The current public facade is:
- `SecondPassApiClient`

Notes:
- Method names are currently conservative / endpoint-shaped.
- A future pass may add more domain-shaped namespaces without changing app behavior (the facade remains the boundary).

## 4) Major API areas (current)

All methods return Promises and throw on failures (see Error model).

### Discovery / auth / profile

- `SecondPassApiClient.discoverSecondPass(serverBaseUrl)`
- `createLoginRequest(discovery, input?)`
- `pollLoginRequest(pollUrl)`
- `getMe({ apiBaseUrl, accessToken, tokenType? })`

### Library / books

- `listBooks({ apiBaseUrl, accessToken, tokenType?, params? })`
- `getBook({ apiBaseUrl, accessToken, tokenType?, bookId })`
- `downloadBookFile({ downloadUrl, accessToken, tokenType? })`

### Library / series

- `listSeries({ apiBaseUrl, accessToken, tokenType?, page? })`
- `getSeries({ apiBaseUrl, accessToken, tokenType?, seriesId })`

### Library / authors

- `listAuthors({ apiBaseUrl, accessToken, tokenType?, page? })`
- `getAuthor({ apiBaseUrl, accessToken, tokenType?, authorId })`

### Shelves

- `listShelves({ apiBaseUrl, accessToken, tokenType? })`
- `getShelf({ apiBaseUrl, accessToken, tokenType?, shelfId })`
- `listShelfItems({ apiBaseUrl, accessToken, tokenType?, shelfId, page? })`

### Reading sessions

- `listRecentReadingSessions({ apiBaseUrl, accessToken, tokenType?, limit? })`
- `listReadingSessions({ apiBaseUrl, accessToken, tokenType?, page?, pageSize?, bookId?, status?, isActive? })`
- `getReadingSession({ apiBaseUrl, accessToken, tokenType?, sessionId })`
- `updateReadingSession({ apiBaseUrl, accessToken, tokenType?, sessionId, payload })`
- `closeReadingSession({ apiBaseUrl, accessToken, tokenType?, sessionId })`
- `openReadingSession({ apiBaseUrl, accessToken, tokenType?, bookId })`
- `startOverReadingSession({ apiBaseUrl, accessToken, tokenType?, bookId })`

### Progress

- `updateReadingProgress({ apiBaseUrl, accessToken, tokenType?, sessionId, payload, method? })`

### Annotations

- `listReadingAnnotations({ apiBaseUrl, accessToken, tokenType?, sessionId, page? })`
- `createReadingAnnotation({ apiBaseUrl, accessToken, tokenType?, payload, idempotencyKey? })`
- `updateReadingAnnotation({ apiBaseUrl, accessToken, tokenType?, annotationId, payload })`
- `deleteReadingAnnotation({ apiBaseUrl, accessToken, tokenType?, annotationId })` (server-side soft-delete)

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

