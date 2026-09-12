# Data model

The SDK projects Second Pass Library's server-owned contracts into application-facing TypeScript
types. Method signatures belong in [API.md](./API.md).

## Publication

Second Pass Library defines one Book as one backing publication file. Application code does not
treat file availability as an optional Book capability; failed open or download operations remain
errors.

Publication download is authenticated. Cover retrieval is a separate public, unauthenticated
operation.

## Progress

- `cfi` is the canonical restore anchor.
- `locationLabel` is opaque display metadata mapped to `location_label`.
- `updatedAt` is assigned by Second Pass Library.

Reader close includes the latest stable CFI and location label. The server commits final progress
atomically with Reading Session metadata and closed status. Progress replacement that loses a race
with close returns `409 SESSION_CLOSED`.

## Reading Sessions

- Status is `active` or `closed`.
- The server permits at most one active Reading Session per user and Book.
- `open` creates that active Reading Session with `201` or reuses it with `200`.
- `startOver` atomically closes the active Reading Session and creates a blank one.
- Reading Session names are limited to 255 characters.
- Reader Reading Session notes use 65,536 characters as the portable client limit; the live REST
  limit remains informal.
- REST serializers trim leading and trailing whitespace while preserving internal whitespace and
  newlines.

`startOver` requires an `Idempotency-Key` no longer than 128 characters.

## Marginalia

Live annotations use the Marginalia API projection. Applications write them through
`spl.marginalia.sessions.batchAnnotations()`.

Bookmarks contain identity, kind, location, and timestamps but no body. Highlights contain body
text and may include quote context, color, and notes.

Upserts, updates, restores, and retry-safe deletes use annotation batch operations keyed by
`client_id`. A batch contains 1-100 operations.
