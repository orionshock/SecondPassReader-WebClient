# Reader

The reader is a session-centered EPUB workflow. It renders a book, tracks location, persists progress, manages annotations, and supports guided marginalia import.

## Main Files

- `src/features/reader/ReadingActivity.tsx`
- `src/features/reader/session/ReadingSessionOrchestrator.tsx`
- `src/features/reader/shell/ReadingShell.tsx`
- `src/features/reader/engine/EpubTsBookEngine.ts`
- `src/features/reader/viewport/ReaderViewport.tsx`

## Opening a Book

Reader launch starts from library/home/shelf/session UI and uses `openBookForReader(...)`.

The open flow:

1. Calls `spl.reading.openForReading(book)`.
2. Receives server reading-open state plus the book `Blob`.
3. Creates an object URL for the blob.
4. Navigates to `#/reader/:bookId`.
5. Restores saved CFI when available.

Direct navigation to `#/reader/:bookId` reopens the book through the same route restore path.

`#/reader/:bookId?search=query` opens the search drawer and runs an initial search after the engine search handle is ready, if the query satisfies normal search length rules.

## Reader Layers

`ReadingActivity`
: Reader page layout, header controls, search/import drawers, marginalia menu, annotation workspace, end-of-book dialogs, and side-panel layout resize commands.

`ReadingSessionOrchestrator`
: Server/session coordination, progress autosave, current session metadata, current annotations, previous session layers, shell command creation, search jump commands, and staged-selection callbacks.

`ReadingShell`
: Shell chrome around the EPUB viewport, table of contents drawer, display settings, staged selection toolbar, and engine lifecycle.

`EpubTsBookEngine`
: `@likecoin/epub-ts` adapter for display, navigation, selection extraction, location reporting, TOC normalization, search, highlight painting, and CFI description.

## Progress

- CFI is the canonical restore anchor.
- Href is useful context for display and TOC matching.
- Book progress is approximate UI metadata.
- Autosave is debounced in the session layer.

## Search

In-book search is client-side within the currently opened EPUB.

Search behavior:

- Runs only on Enter, Search button, or URL-triggered initial search.
- Searches the linear EPUB spine through epub-ts section search.
- Uses `section.search(query, maxSeqEle)` so nearby sequential text nodes can match.
- Loads and unloads sections safely.
- Streams/progressively collects results and batches display in the drawer.
- Result jumps navigate to the result CFI and may show a temporary search flash.

Search drawer code lives under `src/features/reader/shell/bookSearch/`.

## Annotations

Current session annotations are shown in the bottom annotation workspace. Bookmarks and highlights are server-backed annotations.

Highlight creation path:

1. User selection or guided import creates staged selection state.
2. The staged toolbar gathers color/note intent.
3. Commit calls the normal annotation creation action.
4. The server-created annotation updates local annotation state.
5. Durable highlight marks are recomputed from canonical annotation data.

Annotation persistence should not know whether the highlight began as manual selection, search, or import.

## Renderer Marks

epub-ts renderer annotations are keyed by CFI range plus renderer type, not by app annotation id. Search flashes, staged previews, and durable annotation highlights can collide if layered at the same CFI with the same renderer type.

Rules:

- Temporary search marks are cleared before staging a highlight at the same CFI.
- Staged marks are cleared before commit/cancel handoff.
- Durable marks are restored from annotation state.
- Cleanup paths must be explicit for cancel, commit, failed commit, skip, clear, and navigation/focus-driven teardown.

Renderer mark code lives in `src/features/reader/engine/EpubTsHighlightRenderer.Engine.ts`.

## Marginalia And Previous Sessions

The marginalia menu can show previous session layers and import tools.

Previous session layers are read-only context. They are loaded through `usePreviousSessionLayers(...)` and rendered as additional highlight marks.

## Guided Glasp CSV Import

Import state is in memory only and scoped to the current reader activity.

Current workflow:

1. Open Marginalia menu.
2. Choose `Import marginalia...`.
3. Select a Glasp CSV file.
4. Parse rows client-side with PapaParse.
5. Open the import drawer.
6. Click one row to search and stage it.
7. Confirm through the normal staged-selection toolbar.
8. Mark the row accepted only after the normal commit path completes.

Import code does not call annotation APIs directly.

Fragment search repair:

- Full imported text is searched first.
- If full search fails and a fragment search succeeds, the engine attempts same-section range repair.
- Repair runs against the matched section, flattens normalized text with source mapping, finds the full quote near the fragment anchor, creates a DOM `Range`, and calls `Section.cfiFromRange(range)`.
- If repair fails, the fragment CFI is staged as before.

Import code lives under `src/features/reader/imports/`.

## End Of Book

Near the end of a book, the reader can show end-of-book controls. Closing a session uses session metadata and then can navigate to the next book, restart, return home, view the closed session, or go to sessions.
