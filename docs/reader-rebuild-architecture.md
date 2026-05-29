# Reader Rebuild Architecture (react-reader/epub.js -> @likecoin/epub-ts)

Status: documentation + scaffolding only (branch: `typescript-eupb`).

## Why rebuild the reader

The current reader worked, but several responsibilities were implicitly bundled inside `react-reader` + `epubjs` and the surrounding feature components. This made it harder to:

- separate "book engine facts" (locations, selections, spine/nav) from "reading session meaning" (progress, annotations, bookmarks, navigation intent)
- own a stable, SecondPass-defined reader boundary that we can evolve without being constrained by `react-reader` API shape
- swap the engine substrate (target: `@likecoin/epub-ts`) without rewriting all session/annotation logic at the same time

This rebuild is explicitly not about eliminating layers; it is about making them owned and explicit.

## Reading Session is the central domain

This app is not merely "rendering an EPUB". It manages a live Reading Session:

- active book + file/blob
- current location and visible range
- progress and last-location persistence
- bookmarks and W3C Web Annotation JSON-LD annotations (with EPUB CFI selectors)
- TOC navigation intent
- selected text and draft annotation workflows
- server sync via the existing SPL client library

Principle: the engine reports book-mechanics facts; the session layer decides what those facts mean and what to persist.

## Current implementation (pre-archive)

Route / activity entry:

- Reader route is hash-based: `#/reader/<bookId>`
- Entry point is `src/app/App.tsx` which renders the reader feature when `route.kind === "reader"`

Where the old stack was coupled:

- Direct `react-reader` usage lived in the old `EpubReaderPanel` implementation.
- Direct epub.js usage lived behind `react-reader`'s `getRendition` callback and used rendition events (`relocated`, `selected`) plus `rendition.annotations.*` and `rendition.themes.*`.
- Orchestration concerns (progress autosave, near-end lifecycle, annotation sync, selection toolbar coordination, panel layout) had accumulated around the old route container.

## Intended target architecture (owned by SecondPass)

Ownership model:

- Reading Activity / Route: page layout; owns viewport region and sibling panels; does not know engine details.
- Reading Session Orchestrator: canonical session state; translates server/session data into app state; coordinates cross-talk.
- ReadingShell: owned SecondPass boundary; owns engine lifecycle and exposes commands/events.
- ReaderViewport: host container for the shell/engine mount surface.
- AnnotationList / panels: sibling UI; sends intent to orchestrator; does not know engine details.
- SPL client library: stable; existing contracts remain unchanged.
- `@likecoin/epub-ts`: engine substrate only; not the app domain model.

Key principle:

- `epub-ts` reports book-engine facts.
- ReadingSession decides what those facts mean.
- SecondPass UI presents and acts on the session.

## Progress + navigation notes (typescript-eupb)

- `cfi` is the canonical restore anchor / primary persisted reading position. This is what we rely on to resume reading position across renderer changes.
- `href` is useful context and a fallback for TOC matching / display, but is not authoritative for precise restore.
- `bookProgress` is approximate whole-book UI progress (0..1) derived from engine location reporting. It may be sent to the server for presentation (e.g. "12%"), but it is not authoritative and must not be used for restore.
- Display progress may later combine approximate whole-book progress (`bookProgress`) and a chapter-local progress concept (planned `chapterProgress`) for UX.
- Initial navigation/restore flows through the orchestrator -> shell -> engine `display(target)` command path (same mechanism as future TOC jumps).
- TOC is normalized at the engine/shell boundary into app-owned `ReaderTocItem[]` (no raw epub-ts nav item leakage).
- Progress autosave lives in the session layer (orchestrator-owned hook) and calls `spl.reading.progress.save(...)`. The shell/engine never call SPL directly.
- Autosave persists `current_location.cfi` as the meaningful restore anchor; `progression` is populated from `bookProgress` only as approximate presentation metadata.
- Reader open/download choreography should be owned by the SPL client where practical (e.g. `spl.reading.openForReading(...)` / `spl.library.books.downloadEpub(...)`), with the app owning only browser concerns like `URL.createObjectURL(...)`.

## What must remain stable

- SPL client library APIs and server contracts (no redesign in this pass).
- Canonical persisted annotation/session format remains W3C Web Annotation JSON-LD with EPUB CFI selectors.

## Rough migration sequence (practical, low-risk)

1. Introduce explicit layers (types + boundaries).
2. Bring up a minimal `@likecoin/epub-ts` engine adapter behind `EpubTsBookEngine`.
3. Move reader route UI onto `ReadingActivity` + orchestrator + shell (feature-flagged if needed).
4. Add back behaviors incrementally (display, nav, location events, selection, annotations painting).
5. After parity, remove legacy dependencies and implementation (done on this branch).

## Archived legacy reader stack

The old `src/features/reader` implementation was removed on the `typescript-eupb` branch because it was centered around `react-reader` / `epub.js` and had accumulated renderer-specific orchestration. The rebuild intentionally keeps the SPL client/server contract stable while replacing the reader feature implementation with a Reading Session centered architecture.

Important legacy responsibilities to preserve conceptually:

- route-driven opening of a reading session
- progress persistence
- near-end/session lifecycle handling
- bookmark and annotation server sync
- annotation list/panel behavior
- text selection/highlight toolbar behavior
- reader layout CSS intent

The old implementation can be recovered from git history if needed.

## Open questions

- What `@likecoin/epub-ts` exposes for:
  - selection -> text extraction + CFI range capture
  - location reporting: current location + visible range + percentage (for UI only)
  - annotation marking primitives and reflow behavior
  - TOC/spine navigation primitives and href <-> CFI mapping
- How to represent "visible range" as an engine-agnostic type (likely `{ startCfi, endCfi, href?, bookProgress? }`).
