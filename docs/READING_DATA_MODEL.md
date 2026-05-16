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

