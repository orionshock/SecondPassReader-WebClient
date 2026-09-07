# Data model notes

This package reflects server-owned reading/library contracts while providing an app-friendly API.

## Library file invariant

Server convention: **1 book === 1 backing file**.

App/UI code should not treat "file availability" as an optional feature flag. If a book exists, open/download should be allowed; failures are handled as errors.

## Marginalia progress

- `cfi` is the meaningful restore anchor (persist + resume).
- `locationLabel` is opaque display metadata and maps to live API `location_label`.
- `updatedAt` is server-assigned.

Reader close should include the latest stable CFI and location label. The server atomically applies
that final progress with metadata and closed status. A progress replacement that loses a race with
close is rejected with `409 SESSION_CLOSED`.

## Session lifecycle and metadata

- Session statuses are `active` and `closed`.
- The server enforces at most one active session per user and book.
- `open` creates (`201`) or reuses (`200`) that active session.
- `startOver` atomically closes the active session and creates a blank active session; callers must
  supply an `Idempotency-Key`.
- Session names are limited to 255 characters.
- Reader session notes use 65,536 characters as the portable client limit while the live REST limit
  remains informal.
- REST serializers trim leading and trailing whitespace but preserve internal whitespace and
  newlines.

## Annotations

- Live annotations use the Marginalia API projected types.
- App code should use `spl.marginalia.sessions.batchAnnotations()`.

Bookmarks contain only their identity, kind, location, and timestamps. They never contain a body. Highlights contain body text and optional quote context, color, and note fields.

### Server limits (reader-relevant)

- annotation batch: 1-100 operations
- `Idempotency-Key` header max length: 128 chars
- session name: 255 characters
- portable Reader session notes: 65,536 characters

Upserts, updates, restores, and retry-safe deletes use annotation batch operations keyed by `client_id`.
