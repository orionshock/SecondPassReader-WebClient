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

- Canonical annotations are **W3C Web Annotation JSON-LD** (with EPUB CFI selectors).
- App code should use `spl.reading.annotations.*` helpers for common workflows instead of constructing raw payloads.

### Listing and ordering

The annotation list endpoint supports workflow-friendly filters:

- `motivation` (repeatable): `highlighting`, `bookmarking`, `commenting`
- `ordering`: `"created" | "-created" | "modified" | "-modified"`

### Update immutability

- Anchor fields (target/selector/CFI/TextQuoteSelector) are immutable after creation.
- Updates use PATCH and send **body updates only** (+ optional `profile_version`).
- To change a highlight range: delete + create.

### Highlight anchoring context

For highlights, the server accepts optional `TextQuoteSelector` context alongside the EPUB CFI selector:

- `target.selector = FragmentSelector`
  or
- `target.selector = [FragmentSelector, TextQuoteSelector]`

CFI remains the primary anchor. Quote prefix/suffix are optional repair/export metadata.
