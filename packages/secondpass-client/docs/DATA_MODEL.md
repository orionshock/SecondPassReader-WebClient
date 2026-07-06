# Data model notes

This package reflects server-owned reading/library contracts while providing an app-friendly API.

## Library file invariant

Server convention: **1 book === 1 backing file**.

App/UI code should not treat "file availability" as an optional feature flag. If a book exists, open/download should be allowed; failures are handled as errors.

## Reading position vs progress

- `cfi` is the meaningful restore anchor (persist + resume).
- `href` is useful context for display/TOC matching and as a fallback.
- `bookProgress` is approximate whole-book UI metadata.
  - It maps to server `progression` when provided, but is not authoritative.

## Annotations

- Live annotations use the **SPL Marginalia Profile** shape with EPUB CFI selectors.
- App code should use `spl.reading.annotations.*` helpers for common workflows instead of constructing raw payloads.

### Listing and ordering

The annotation list endpoint supports workflow-friendly filters:

- `kind` (repeatable): `highlight`, `bookmark`
- `session_id`
- `book_id`
- `include_deleted`
- `ordering`: `"created" | "-created" | "modified" | "-modified"`

Server contract: comments are represented on highlights with `comment_text` / `has_comment`.

Standalone comment-only annotations are not supported in current workflows.

### Server limits (reader-relevant)

- `selector` (EPUB CFI) max length: 8192 chars
- `highlight_text` max length: 65536 chars
- `comment_text` max length: 65536 chars
- `highlight_color` max length: 64 chars (must be an allowed token)
- `Idempotency-Key` header max length: 128 chars

### Update immutability

- Anchor fields (`selector`/CFI) and `highlight_text` are immutable after creation.
- Updates use PATCH and send only `comment_text` and/or `highlight_color`.
- To change a highlight range: delete + create.

### Highlight anchoring context

For highlights, the live API accepts `selector: { kind: "epub_cfi", value }` plus `highlight_text`, optional `quote`, optional `comment_text`, and optional `highlight_color`.
