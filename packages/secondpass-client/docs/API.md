# API

`@secondpass/client` exposes an initialized, workflow-shaped client:

```ts
import { createSecondPassClient } from "@secondpass/client";

const spl = createSecondPassClient({ apiBaseUrl, accessToken, tokenType });
```

## Auth model

- `spl.server.*` is allowed without an access token.
- All other namespaces require an access token and throw `ApiError(kind="unauthorized")` if missing/invalid.

## server

- `spl.server.discover(serverBaseUrl)`
- `spl.server.createLoginRequest(discovery, input?)`
- `spl.server.pollLoginRequest(pollUrl)`

## account

- `spl.account.getCurrent()`

## library

### library.books

- `spl.library.books.list(params?)`
- `spl.library.books.get(bookId)`
- `spl.library.books.download(bookIdOrBook)`
  - Downloads the backing file bytes as a `Blob` (format-neutral).
  - Hides the server `download_url` field from normal app flows.
- `spl.library.books.getDownloadUrl(bookIdOrBook)`
  - Returns a server-provided URL for deliberate URL workflows only.

### library.series

- `spl.library.series.list(params?)`
- `spl.library.series.get(seriesId)`
- `spl.library.series.books(seriesId, params?)`

### library.authors

- `spl.library.authors.list(params?)`
- `spl.library.authors.get(authorId)`
- `spl.library.authors.books(authorId, params?)`

## shelves

- `spl.shelves.list(params?)`
- `spl.shelves.get(shelfId)`
- `spl.shelves.items(shelfId, params?)`

## reading

### reading.openForReading

```ts
const { open, blob } = await spl.reading.openForReading(bookIdOrBook);
```

Opens/creates the server reading session (and returns its response) and downloads the backing book file as a `Blob`.

### reading.sessions

- `spl.reading.sessions.open(bookId)`
- `spl.reading.sessions.startOver(bookId)`
- `spl.reading.sessions.recent(params?)`
- `spl.reading.sessions.list(params?)`
- `spl.reading.sessions.get(sessionId)`
- `spl.reading.sessions.updateDetails(sessionId, { name?, notes? })`
- `spl.reading.sessions.close(sessionId)`

### reading.progress

```ts
await spl.reading.progress.save(sessionId, {
  profileVersion,
  cfi,
  href,
  bookProgress,
});
```

The client maps app-friendly input into the server wire payload:

- `profileVersion` -> `profile_version`
- `cfi` -> `current_location.cfi`
- `href` (optional) -> `current_location.href`
- `bookProgress` (optional) -> `progression` (approximate UI metadata)
- uses `PATCH` internally

### reading.annotations

High-level helpers for common workflows:

- `spl.reading.annotations.list({ sessionId?, bookId?, page?, pageSize?, kind?, includeDeleted?, ordering? })`
  - `kind` may be a single value or an array; arrays are sent as **repeatable** query params:
    - `kind=highlight&kind=bookmark`
  - `sessionId` maps to `session_id`
  - `bookId` maps to `book_id`
  - `includeDeleted` maps to `include_deleted`
  - `ordering` may be:
    - `"created" | "-created" | "modified" | "-modified"`
- `spl.reading.annotations.createHighlight(input, { idempotencyKey? }?)`
- `spl.reading.annotations.createBookmark(input, { idempotencyKey? }?)`
- `spl.reading.annotations.batchCreate(input)`
- `spl.reading.annotations.updateNote(annotationId, input)`
- `spl.reading.annotations.remove(annotationId)` (server-side soft-delete)

## Errors

The client throws normal JavaScript errors. For server failures, the package exports:

- `ApiError`
- `ApiErrorKind`

Callers should catch errors and render user-friendly messages. Never log or persist bearer tokens.

## Highlight quote context

`createHighlight` accepts optional quote context fields:

- `quotePrefix?: string`
- `quoteSuffix?: string`

Behavior:

- CFI (from `cfiRange`) is sent as `selector: { kind: "epub_cfi", value }`.
- `quotePrefix` / `quoteSuffix` are sent inside the optional `quote` object when present.
- Selection heuristics (how much context to capture) belong to the reader/selection layer.

## Annotation updates (PATCH immutability)

The server treats anchor fields as immutable after creation:

- CFI / CFI range selectors are immutable.
- `highlight_text` is immutable.
- To change a highlight range: delete the old annotation and create a new one.

Client update helpers reflect this:

- `spl.reading.annotations.updateNote(id, { note?, color? })`
  - sends **PATCH** with only `comment_text` and/or `highlight_color`
  - does **not** send `selector`, `session`, `book`, `kind`, `quote`, or `highlight_text`

## Server limits (reader-relevant)

- `selector` (EPUB CFI) max length: 8192 chars
- `highlight_text` max length: 65536 chars
- `comment_text` max length: 65536 chars
- `highlight_color` max length: 64 chars (must be an allowed token)
- `Idempotency-Key` header max length: 128 chars
