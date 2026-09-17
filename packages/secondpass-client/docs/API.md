# API

`@secondpass/client` exposes an initialized, workflow-shaped client:

```ts
import { createSecondPassClient } from "@secondpass/client";

const spl = createSecondPassClient({ apiBaseUrl, accessToken, tokenType });
```

## Authentication

Public operations:

- server discovery and PIN/code linking;
- `spl.library.books.downloadCover(coverUrl)`.

Cover URLs are public by contract. Relative URLs resolve against the configured Second Pass Library.
Relative, same-origin, and cross-origin requests use the same anonymous SDK path: it attaches no
Authorization header and does not opt into credential forwarding. A cross-origin response still
needs CORS before JavaScript can read its Blob.

`spl.server.info()` and all other account, Library, Shelf, publication, and Marginalia operations
require an access token. Missing or rejected credentials produce
`ApiError(kind="unauthorized")`.

The SDK keeps a supplied access token only in the configured client instance. It does not select or
provide persistent credential storage. A host application owns that policy and may persist a token
only when its security design explicitly defines the storage, exposure, and cleanup behavior. Treat
bearer tokens as passwords: never log them or place them in URLs.

## Server

- `spl.server.discover(serverBaseUrl)`
- `spl.server.info()`
- `spl.server.createLoginRequest(discovery, input?)`
- `spl.server.pollLoginRequest(pollUrl)`
- `spl.server.consumeLoginRequest(consumeUrl)`

## Account

- `spl.account.getCurrentUser()`
- `spl.account.revokeClientSession(clientSessionId)`
  - Revokes the authenticated browser client session with `DELETE`.

## Library

- `spl.library.search(params?)`
  - Uses `/api/v1/library/search` without a trailing slash.
  - Supports broad `q`, ordering, exclusions, and pagination.

### Books

- `spl.library.books.list(params?)`
- `spl.library.books.get(bookId)`
- `spl.library.books.download(bookIdOrBook)`
  - Downloads the authenticated backing publication as a format-neutral `Blob`.
  - Hides the server `download_url` from normal application flows.
- `spl.library.books.getDownloadUrl(bookIdOrBook)`
  - Returns a server-provided URL for deliberate URL workflows.
- `spl.library.books.downloadCover(coverUrl)`
  - Downloads a public cover as a `Blob` with response content type.
  - Adds no bearer authentication and does not opt into credential forwarding.

### Series

- `spl.library.series.list(params?)`
- `spl.library.series.get(seriesId, { includePreviewBooks?, previewLimit? }?)`

### Authors

- `spl.library.authors.list(params?)`
- `spl.library.authors.get(authorId, { includePreviewBooks?, previewLimit? }?)`

Author- and Series-filtered Books use `spl.library.books.list({ author })` and
`spl.library.books.list({ series })`.

### Tags

- `spl.library.tags.list(params?)`
- `spl.library.tags.get(tagId)`

Tags do not accept preview parameters.

### Library Groups

- `spl.library.groups.list(params?)`
- `spl.library.groups.get(groupId, { includePreviewBooks?, previewLimit? }?)`
- `spl.library.groups.books(groupId, params?)`
- `spl.library.groups.search(groupId, params?)`
- `spl.library.groups.authors(groupId, params?)`
- `spl.library.groups.series(groupId, params?)`
- `spl.library.groups.tags(groupId, params?)`

## Shelves

- `spl.shelves.list(params?)`
- `spl.shelves.create(input)`
- `spl.shelves.get(shelfId, { includePreviewBooks? }?)`
- `spl.shelves.update(shelfId, input)`
- `spl.shelves.remove(shelfId)`
- `spl.shelves.items(shelfId, params?)`
- `spl.shelves.addItem(shelfId, input)`
- `spl.shelves.updateItem(shelfId, itemId, input)`
- `spl.shelves.removeItem(shelfId, itemId)`

## Marginalia

### Books and Reading Sessions

- `spl.marginalia.books.list(params?)`
- `spl.marginalia.books.get(bookId)`
- `spl.marginalia.books.sessions(bookId, params?)`
- `spl.marginalia.books.open(bookId, { name?, notes? }?)`
- `spl.marginalia.books.getActiveSession(bookId)`
- `spl.marginalia.books.startOver(bookId, finalState, { idempotencyKey })`
- `spl.marginalia.sessions.list(params?)`
- `spl.marginalia.sessions.recent(params?)`
- `spl.marginalia.sessions.get(sessionId)`
- `spl.marginalia.sessions.update(sessionId, { name?, notes? })`
- `spl.marginalia.sessions.close(sessionId, finalState?)`

`open` is the normal Reader open/resume operation. A `201` response creates the active Reading
Session; `200` reuses it. `getActiveSession` performs the read-only lookup and may return
`session: null`. A concurrent close can make `open` return a closed snapshot, so callers must
still gate mutations on status.

`startOver` atomically closes the active Reading Session and creates a blank one. It requires a
1-128 character `idempotencyKey`, sent as `Idempotency-Key`.

### Progress and annotations

- `spl.marginalia.sessions.getProgress(sessionId)`
- `spl.marginalia.sessions.replaceProgress(sessionId, { cfi, locationLabel? })`
- `spl.marginalia.sessions.getAnnotations(sessionId)`
- `spl.marginalia.sessions.batchAnnotations(sessionId, operations)`

Progress replacement uses `PUT`; `locationLabel` maps to `location_label`. Annotation batches
map `clientId` to `client_id`. Bookmark upserts have no body. Highlight upserts require body
text.

Close may include final progress and commits it atomically with closed status. Progress replacement
against a closed Reading Session returns `409 SESSION_CLOSED` and must not be retried as an
ordinary autosave failure.

Bearer clients do not expose archive import or export methods.

## Errors

The package exports `ApiError` and `ApiErrorKind` for server failures. Other failures use normal
JavaScript errors. Callers own user-facing remediation.

Server-owned invariants and limits are collected in [DATA_MODEL.md](./DATA_MODEL.md).
