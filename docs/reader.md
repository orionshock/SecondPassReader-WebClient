# Reader Architecture

The Reader centers each EPUB workflow on a reading session. The server stores books, sessions,
progress, and annotations. The browser manages the UI lifecycle and sends EPUB operations through
an engine adapter. EPUB CFI is the canonical spatial and restore anchor. Renderer state is
transient, not an annotation model.

## Top-Level Flow

1. `src/app/AppReaderOpen.Controller.ts` restores the route, fetches book metadata, opens the
   marginalia session, downloads the EPUB, and manages object URL replacement and cleanup.
2. `src/features/reader/ReadingActivity.Orchestrator.tsx` renders Reader chrome, panels, dialogs, settings,
   import review, and completion controls.
3. `src/features/reader/session/ReadingSession.Orchestrator.tsx` wires server-backed session state
   to renderer-neutral bridge capabilities.
4. `src/features/reader/shell/ReadingShell.Orchestrator.tsx` renders the viewport and wires shell lifecycles.
5. `src/features/reader/engine/EpubTsBook.Engine.ts` is the public adapter around
   `@likecoin/epub-ts`.

Direct navigation to `#/reader/:bookId` uses the same open/restore path. A `search` query parameter
starts an in-book search after the search capability is readable and ready.

## Activity Owners

| Owner | Responsibility |
| --- | --- |
| `ReaderActivityImport.Controller.ts` | Activity-level import modal/drawer wiring, activation handoff, manual completion, clear/hide cleanup, and layout resize requests. Matching and range repair remain under `imports/`. |
| `ReaderActivityCompletion.Controller.ts` | End-of-book state, next-series lookup, close-dialog transitions, return-target persistence, and post-close navigation/reload choices. |
| `ReaderActivityHeader.UI.tsx` | Reader header controls and status presentation. |
| `ReaderActivitySidePanels.UI.tsx` | Search, import, marginalia, and annotation workspace composition. |
| `ReaderActivityDialogs.UI.tsx` | Import, close-session, and end-of-book dialog composition. |

Import code must clear its temporary search/staging state before hiding, clearing, skipping, or
handing confirmed annotation intent to the session layer. It must not call annotation endpoints
directly.

## Session Owners

`ReadingSession.Orchestrator.tsx` wires server-backed data and actions to renderer-neutral handles
used by the activity.

| Owner | Responsibility |
| --- | --- |
| `ReadingSessionBridge.Controller.ts` | Stores shell capabilities and events, creates sequenced shell commands, scopes location state to the active book, and owns temporary search-flash state. |
| `annotations/SessionAnnotations.Controller.ts` | Loads current-session annotations, resets by active session generation, and coordinates CFI descriptions. |
| `annotations/SessionAnnotations.Presenter.ts` | Maps canonical annotations to bookmark/highlight view models and durable renderer marks. |
| `annotations/CurrentSessionAnnotation.Controller.ts` | Serializes current-session mutations and rejects stale generations. |
| `annotations/CurrentSessionAnnotation.Actions.ts` | Composes bookmark and highlight actions without changing their payload builders. |
| `progress/ReadingProgressAutosave.Controller.ts` | Debounces and serializes progress replacement. |
| `progress/ReadingProgressAutosave.Lifecycle.ts` | Seeds saved progress, performs a bounded best-effort exit flush, and drains/stops writes before session close. |
| `previousSession/PreviousSessionLayers.Controller.ts` | Loads and selects previous-session annotation layers as read-only context. |
| `CurrentSessionMetadata.Controller.ts` | Loads and updates editable metadata for the active session. |
| `ReadingSessionClose.Actions.ts` | Applies changed metadata, closes the session with final progress when available, and leaves activity-level navigation outside this owner. |
| `ReadingSessionRender.Presenter.ts` | Builds render state, toolbar items, and the ordered current-plus-previous durable mark list. |

Current-session owners may mutate. `previousSession/` and the general Sessions feature are read-only
with respect to Reader annotation mutation modules.

### Live session contract

- Normal `POST /books/:id/open/` responses contain one active session: `201` creates it and `200`
  reuses it. The server's unique constraint owns the one-active-session-per-user/book invariant;
  clients must not select between competing active sessions.
- The shared bootstrap type allows for `GET /books/:id/active-session/` to return no
  session and a concurrent close can rarely make an `open` response contain a closed snapshot. A
  closed snapshot is rendered read-only and does not start progress autosave.
- Closing from Reader first drains and stops pending progress writes. Close then sends the latest
  stable CFI and location label so metadata, final progress, and closed status commit atomically.
- A progress `409` means the server has already closed the session. Autosave treats that as closed
  state drift, stops further writes for that session, and leaves the Reader usable.

## Shell Owners

`ReadingShell.Orchestrator.tsx` holds composition refs and renders chrome. The modules below own its behavior.

| Owner | Responsibility |
| --- | --- |
| `ReaderEngineBootstrap.Lifecycle.ts` | Creates the engine generation, attaches it to runtime control, applies initial durable marks, performs the initial display, publishes capabilities after readable readiness, and tears the generation down. |
| `ReaderCapabilityPublication.Lifecycle.ts` | Publishes and unpublishes renderer-neutral describe/probe/display/search handles only while the current engine generation is readable. |
| `ReaderCommandRouting.Lifecycle.ts` | Defers one pre-ready command, routes post-ready display/search/next/previous/resize commands, classifies navigation intent, and reports command failures. |
| `ReaderLocationPublication.Lifecycle.ts` | Converts relocation callbacks into readable-viewport state, guarded progress events, staged-selection relocation decisions, durable toolbar close, and protected re-anchor requests. |
| `ReaderSettingsReflow.Lifecycle.ts` | Applies settings and reader-width changes through serialized reflow without recreating the engine. |
| `ReaderRuntime.Controller.ts` | Serializes viewport mutations, rejects stale generations, and coalesces adjacent settings/resize reflows. |
| `ReaderReflow.Coordinator.ts` | Preserves the ordering of reflow, mark refresh, and staged-toolbar re-anchor. |
| `ReaderStagedToolbar.Controller.ts` | Connects staged selection behavior to toolbar rendering and shell capabilities. |
| `ReaderStagedSelection.Controller.ts` | Owns staged state, mark handoff, commit/cancel behavior, and keyboard cleanup. |
| `ReaderStagedSelectionReanchor.Controller.ts` | Measures and repositions the staged toolbar; newer requests supersede stale measurements. |
| `StagedSelection.Lifecycle.ts` | Protects operation-owned import/layout relocations and cancels staging for unrelated navigation. |
| `ReaderDurableAnnotationToolbar.Controller.ts` | Opens, closes, and positions the durable annotation toolbar while coordinating staged cancellation. |
| `ReaderBootstrapProgressGuard.State.ts` | Quarantines bootstrap relocations and protects the restored CFI until readable startup is established. |

Attaching the engine does not make it ready. Readiness requires either a successful readable display
or a relocation that proves content is readable. Search, CFI, and staging capabilities are not
published before then.

## Engine Owners

`EpubTsBook.Engine.ts` is the public facade. Runtime imports of `@likecoin/epub-ts` stay under
`src/features/reader/engine/`.

| Owner | Responsibility |
| --- | --- |
| `EpubTsBook.Engine.ts` | Book/rendition construction, event binding, navigation facade, selection handoff, CFI operations, TOC setup, and destruction. |
| `EpubTsBookSearch.Engine.ts` | Serialized section search execution. |
| `ReaderSearch.Controller.ts` | Prevents concurrent full-book section traversal. |
| `EpubTsHighlightRenderer.Engine.ts` | Durable, staged, and temporary renderer-mark reconciliation and click metadata. |
| `EpubTsImportRangeRepair.Engine.ts` | DOM range reconstruction and epub-ts CFI conversion for imported fragments. |
| `EpubImportRangeRepair.Policy.ts` | Pure normalized-text and punctuation-tolerant repair matching. |
| `EpubTsRenditionSettings.Engine.ts` | Scoped rendition theme/style application. |
| `EpubTsLocation.Mapper.ts` | Renderer location and TOC mapping into Reader domain shapes. |
| `EpubSelection.Adapter.ts` | Browser selection extraction and quote context handoff. |
| `EpubVisibleCfiRangeAnchor.Placement.ts` | Visible range geometry used by toolbar placement. |
| `ReaderReflowTarget.Policy.ts` | Chooses the CFI preserved across resize/settings reflow. |

Known support-library defects and limitations are tracked in
[epub-ts-support-issues.md](./epub-ts-support-issues.md).

## Operating Invariants

- CFI is the canonical restore and spatial anchor. Href, labels, and percentage are presentation
  metadata.
- Drawer, menu, modal, settings, import, annotation, and toolbar state must not recreate the EPUB
  engine. Bootstrap dependencies are limited to true lifecycle identity inputs and stable callbacks.
- Viewport mutations run through `ReaderRuntime.Controller.ts`; do not issue competing display,
  navigation, resize, or settings operations directly.
- Opened progress seeds autosave. Bootstrap relocation quarantine must prevent stale initial
  relocations from overwriting the restored CFI.
- Unrelated navigation cancels staged selection. Import staging and layout reflow protect their own
  relocations, and protected relocations request toolbar re-anchoring.
- Reflow order is apply settings/resize, refresh marks, then re-anchor the staged toolbar.
- Temporary search marks are cleared before staged/durable handoff. Staged marks are cleared before
  commit/cancel completion, and durable marks are restored from canonical annotation state.
- epub-ts cannot independently address multiple highlights at the same CFI and renderer type. A
  same-CFI staged preview temporarily replaces the durable renderer mark. A current-session commit
  at the exact same CFI updates the existing application annotation instead of creating a duplicate.
- Previous-session layers remain read-only. Their marks may be displayed, but their data must not
  enter current-session mutation actions.
- Cleanup is generation-safe: stale async work cannot publish capabilities, mutate the active
  runtime, or retain an obsolete engine.

## Current Product Limits

- Reader settings and themes are browser-local preferences; they are not synchronized to the
  server.
- In-book search runs only for an explicit submit action or an initial reader search route. It does
  not search on every keystroke.
- Search uses epub-ts section traversal. The Reader has no general fuzzy-search engine, and import
  range repair does not cross spine sections.
- Glasp CSV is the only supported import format. Import jobs are in memory, are reviewed row by row,
  and do not survive reload.
- Import does not persist provenance or perform import-level duplicate detection. Confirmed rows use
  the normal annotation action path; same-CFI current-session update policy still applies there.
- Highlight CFI anchors are immutable after creation. Endpoint drag handles and arbitrary CFI range
  editing are not implemented; changing an anchor requires deleting and recreating the highlight.
- Previous-session annotations are display-only context.

## Diagnostics

Debug logging is opt-in. Categories are `reader`, `imports`, and `staged-selection`.

```js
localStorage.setItem("secondpass.debug.logs", "reader,imports,staged-selection")
```

Use `*` to enable every category and remove the key to disable logging. The Settings tools panel
provides the same category controls.

Import diagnostics normally truncate text previews. Full import previews are enabled separately:

```js
localStorage.setItem("secondpass.debug.logs.imports.verbose", "1")
```

Only enable verbose previews with non-sensitive fixture data. Do not log bearer tokens, request
authorization values, or private URLs.

Useful diagnostic owners:

- `imports/ReaderImportDebug.Diagnostics.ts`: activation attempts, candidates, repair decisions,
  and cleanup.
- `imports/ReaderRangeRepairDebug.Adapter.ts`: range-repair diagnostic payloads.
- `shell/ReaderStagedSelection.Diagnostics.ts`: navigation intent, relocation protection, cancel,
  and re-anchor requests.

## Validation

Run the full validation set after Reader changes:

```powershell
npm.cmd run hygiene
npm.cmd test -- --run
npm.cmd run build
git diff --check
```
