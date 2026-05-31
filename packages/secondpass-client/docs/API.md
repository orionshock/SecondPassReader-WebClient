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

- `spl.reading.annotations.list({ sessionId, page?, motivation?, ordering? })`
  - `motivation` may be a single value or an array; arrays are sent as **repeatable** query params:
    - `motivation=highlighting&motivation=bookmarking`
  - Motivation output from the server is represented as an array:
    - Bookmark: `["bookmarking"]`
    - Highlight: `["highlighting"]`
    - Highlight with note: `["highlighting", "commenting"]`
  - `ordering` may be:
    - `"created" | "-created" | "modified" | "-modified"`
- `spl.reading.annotations.createHighlight(input, { idempotencyKey? }?)`
- `spl.reading.annotations.createBookmark(input, { idempotencyKey? }?)`
- `spl.reading.annotations.updateNote(annotationId, input)`
- `spl.reading.annotations.remove(annotationId)` (server-side soft-delete)

## Errors

The client throws normal JavaScript errors. For server failures, the package exports:

- `ApiError`
- `ApiErrorKind`

Callers should catch errors and render user-friendly messages. Never log or persist bearer tokens.

## Highlight quote context (TextQuoteSelector)

`createHighlight` accepts optional quote context fields:

- `quotePrefix?: string`
- `quoteSuffix?: string`

Behavior:

- CFI (from `cfiRange`) remains the primary anchor (`FragmentSelector`).
- If `quotePrefix` or `quoteSuffix` is provided, the client sends `target.selector` as:
  - `[FragmentSelector, TextQuoteSelector]`
- `TextQuoteSelector.exact` is the highlight `text` (must match the describing body text).
- `prefix` / `suffix` are optional anchoring/repair/export metadata (not display text).
- The client clamps `quotePrefix`/`quoteSuffix` to **500 chars max** to satisfy server limits.
- Selection heuristics (how much context to capture) belong to the reader/selection layer.

## Annotation updates (PATCH immutability)

The server treats anchor fields as immutable after creation:

- CFI / CFI range selectors are immutable.
- `TextQuoteSelector` exact/prefix/suffix are immutable.
- To change a highlight range: delete the old annotation and create a new one.

Client update helpers reflect this:

- `spl.reading.annotations.updateNote(id, { profileVersion?, note?, color?, text? })`
  - sends **PATCH** with **body updates only** (+ optional `profile_version`)
  - does **not** send `target`, `selector`, `session`, `book`, or `motivation`
  - if `color` is provided, `text` (describing body value) is required because the server stores highlight color on the describing body

## Server limits (reader-relevant)

- `target` JSON max size: 16 KB
- `body` JSON max size: 64 KB
- `target.selector.value` (EPUB CFI) max length: 8192 chars
- `body[].value` max length: 65536 chars
- `TextQuoteSelector.prefix` max length: 500 chars
- `TextQuoteSelector.suffix` max length: 500 chars
- `TextQuoteSelector.exact` required, non-empty, max 65536 chars
- `body[].color` max length: 64 chars (must be an allowed token)
- `Idempotency-Key` header max length: 128 chars
