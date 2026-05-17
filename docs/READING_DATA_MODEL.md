# Reading data model (intended)

## Canonical sources of truth

- The **server** is canonical for reading sessions and library state.
- **Annotations** are canonical as **W3C Web Annotation JSON-LD**.
- EPUB location/selectors use **EPUB CFI**.

## Renderer is replaceable

- Renderer implementation must be swappable.
- Initial candidate is epub.js / react-reader, but renderer state must remain an implementation detail.
- The app’s model should be renderer-agnostic via a `ReaderBridge`.

## Sessions

- Old reading sessions are **immutable** (historical record).
- The current reading session is **mutable** until it is closed/archived server-side.
- Previous sessions may be layered into the UI as **read-only** context (e.g., prior highlights/notes).

## Annotation lifecycle

- Promoting or “editing” a historical annotation should create a **new** annotation derived from the old one (do not mutate history).
- Keep provenance links/metadata as needed (server-defined).

## Local spec reference (read-only)

- Path: `docs/specs/reading-session-annotation-profile`
- This folder is a **Windows junction** / reference copy of a **server-owned** spec.
- Use it as reference material for:
  - W3C Web Annotation JSON-LD conventions
  - EPUB CFI selector usage
  - reading sessions and layered sessions
  - export/import expectations
- Do **not** import runtime code from `docs/`.
  - Runtime types should live in `src/schemas/`.
  - Conversion/helpers should live in app code (e.g. `src/features/reader/` or a future annotation adapter module).
