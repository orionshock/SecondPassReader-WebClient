# Reader architecture

The Reader organizes each EPUB workflow around a Reading Session and its Marginalia. Second Pass
Library owns server data; the browser owns interaction state and sends EPUB operations through the
Reader engine boundary. EPUB CFI is the canonical machine anchor. Renderer state is transient.

## Opening a Book

`src/app/AppReaderOpen.Controller.ts` owns both supported opening paths:

- With `online` or `unknown` connectivity, it loads Book metadata, opens or resumes the server
  Reading Session, downloads the EPUB, and creates the publication object URL.
- With explicit `offline` connectivity, it requires the verified account namespace, retained Book
  metadata, and a complete EPUB whose format and checksum pass the offline publication policy. It
  then restores local Reader continuity without mounting server request owners.

An arbitrary server failure never falls back to retained bytes. Both paths use the same Reader route
and object URL cleanup. If an online-open Reader later observes explicit offline connectivity, it
keeps the mounted EPUB engine and hands progress and current-Reading-Session Marginalia to durable
local ownership. Reconnect uses the normal authority and outbox replay pipeline; that Reader remains
local-first until it closes.

The handoff retains authored state, not publication bytes. A Book that was not explicitly made
Available offline cannot be reopened offline after the mounted Reader closes. Unknown connectivity,
request failure, authentication repair, and namespace loss do not trigger the handoff.

See [offline-mode.md](./offline-mode.md) for local authoring, outbox, sync, and cleanup behavior.

## Composition flow

1. `src/app/AppReaderOpen.Controller.ts` opens the requested Book and owns object URL replacement.
2. `src/features/reader/ReadingActivity.Orchestrator.tsx` composes Reader chrome, panels, imports,
   and completion controls.
3. `src/features/reader/session/ReadingSession.Orchestrator.tsx` connects Reading Session state and
   Marginalia to renderer-neutral capabilities.
4. `src/features/reader/shell/ReadingShell.Orchestrator.tsx` owns the viewport and shell lifecycles.
5. `src/features/reader/engine/EpubTsBook.Engine.ts` provides the public EPUB engine facade.

Direct navigation to `#/reader/:bookId` uses the same opening path. A `search` query parameter starts
an in-book search after the search capability becomes readable.

## Activity owners

| Owner | Responsibility |
| --- | --- |
| `ReaderActivityImport.Controller.ts` | Import review, activation handoff, manual completion, cleanup, and layout resize requests |
| `ReaderActivityCompletion.Controller.ts` | End-of-book state, next-Series lookup, close-dialog transitions, return-target persistence, and post-close navigation |
| `ReaderActivityHeader.UI.tsx` | Reader header controls and status |
| `ReaderActivitySidePanels.UI.tsx` | Search, import, Marginalia, and annotation workspace composition |
| `ReaderActivityDialogs.UI.tsx` | Import, Reading Session close, and end-of-book dialogs |

Import code clears temporary search and staging state before hiding, clearing, skipping, or handing
confirmed annotation intent to the Reading Session layer. It does not call annotation endpoints
directly.

## Reading Session owners

`ReadingSession.Orchestrator.tsx` mounts the server-backed and local-first owners, then exposes one
selected current-session authoring authority to the activity. Connectivity does not define the
authority mode: after an online Reader hands off, the selected authority remains local-first until
that Reader closes.

| Owner | Responsibility |
| --- | --- |
| `CurrentSessionAuthority.Controller.ts` | Unconditional online/local owner composition, one explicit authority selection, annotation mutation capability, and progress status/close coordination |
| `ReadingSessionBridge.Controller.ts` | Coherent renderer capability, shell events, sequenced commands, Book-scoped location state, and temporary search marks |
| `annotations/SessionAnnotations.Controller.ts` | Current Reading Session annotation loading, generation reset, and CFI descriptions |
| `annotations/SessionAnnotations.Presenter.ts` | Annotation view models and durable renderer marks |
| `annotations/CurrentSessionAnnotation.Controller.ts` | Serialized current Reading Session mutations with generation checks |
| `annotations/CurrentSessionAnnotation.Actions.ts` | Bookmark and highlight action composition |
| `annotations/OfflineCurrentSessionAnnotation.Controller.ts` | Local-first annotation mutation and durable intent |
| `annotations/CurrentSessionAnnotation.Types.ts` | Canonical bookmark/highlight upsert and delete intent |
| `annotations/ServerCurrentSessionAnnotation.Adapter.ts` | Commits canonical intent through the server authority |
| `progress/ReadingProgressAutosave.Controller.ts` | Debounced, serialized online progress replacement |
| `progress/ReadingProgressAutosave.Lifecycle.ts` | Progress seeding, bounded exit flush, and shutdown before close |
| `progress/OfflineReadingProgress.Controller.ts` | Local progress persistence and outbox intent |
| `previousSession/PreviousSessionLayers.Controller.ts` | Selected read-only Marginalia from previous Reading Sessions |
| `CurrentSessionMetadata.Controller.ts` | Active Reading Session metadata loading and updates |
| `ReadingSessionClose.Actions.ts` | Metadata update and atomic close with final progress |
| `ReadingSessionRender.Presenter.ts` | Render state, toolbar items, and ordered durable marks |

Authority modes are `server`, `local`, and `unavailable`. A server or local authority reports
`writable`, `initializing`, or `read-only` status as applicable and exposes annotation mutation
commands only while writable. Reading Session metadata and close remain a separate server-owned
administration interface; previous-session Marginalia remains a separate read-only concern.

All current-session authoring uses the same mutation vocabulary and normalization builders in
`ReadingSessionMarginalia.Actions.ts`, including confirmed imports and exact-CFI highlight updates.
The orchestrator selects server or local-first authority. Server responses remain authoritative;
local-first commits persist annotation projection and delivery intent atomically before reporting
saved status. Replay delivers that durable intent, and continuation reuses the same local commit
repository. These authority changes do not rebuild the Reader engine.

Current Reading Session owners may mutate. Previous Reading Session layers are read-only and never
enter current-session mutation actions.

### Server-backed Reading Session contract

- `POST /books/:id/open/` returns the one active Reading Session: `201` creates it and `200` reuses
  it. The server enforces one active Reading Session per user and Book; clients do not choose among
  competing sessions.
- `GET /books/:id/active-session/` may return no Reading Session. A concurrent close can also make an
  `open` response contain a closed snapshot. Closed snapshots render read-only and do not start
  progress autosave.
- Closing from the Reader drains and stops progress writes, then sends the latest stable CFI and
  location label so metadata, final progress, and closed status commit atomically.
- Progress `409 SESSION_CLOSED` means the server has closed the Reading Session. Autosave stops
  further writes for it while leaving the Reader usable.

## Shell owners

`ReadingShell.Orchestrator.tsx` holds composition refs and renders the viewport. Its lifecycle
modules own the behavior below.

| Owner | Responsibility |
| --- | --- |
| `ReaderEngineBootstrap.Lifecycle.ts` | Engine generation, initial marks and display, capability readiness, and teardown |
| `ReaderCapabilityPublication.Lifecycle.ts` | Generation-safe publication of one renderer-neutral describe, probe, display, and search capability |
| `ReaderCommandRouting.Lifecycle.ts` | Pre-ready deferral, command routing, navigation classification, and failure reporting |
| `ReaderLocationPublication.Lifecycle.ts` | Viewport location, progress events, staged-selection decisions, toolbar close, and re-anchor requests |
| `ReaderSettingsReflow.Lifecycle.ts` | Settings and Reader-width reflow triggers without engine recreation |
| `ReaderRuntime.Controller.ts` | Generation-safe viewport serialization and the protected-anchor, durable-mark, and staged-toolbar reflow protocol |
| `ReaderStagedToolbar.Controller.ts` | Staged-selection behavior and toolbar rendering |
| `ReaderStagedSelection.Controller.ts` | Staged state, mark handoff, commit, cancel, and keyboard cleanup |
| `ReaderStagedSelectionReanchor.Controller.ts` | Staged-toolbar measurement and latest-request positioning |
| `StagedSelection.Lifecycle.ts` | Relocation ownership during import and layout operations |
| `ReaderDurableAnnotationToolbar.Controller.ts` | Durable annotation toolbar state and staged cancellation |
| `ReaderBootstrapProgressGuard.State.ts` | Bootstrap relocation quarantine and restored-CFI protection |

Attaching the engine does not make it ready. Readiness requires a readable display or relocation.
The shell publishes one renderer capability only when describe, probe, display, search, and staged
selection are all usable for the current generation. Teardown withdraws the capability as one
value; retained methods still reject stale-generation work.

## Engine owners

Runtime imports of `@likecoin/epub-ts` stay under `src/features/reader/engine/`.

| Owner | Responsibility |
| --- | --- |
| `EpubTsBook.Engine.ts` | Book and rendition construction, events, navigation, selection, CFI operations, TOC, and destruction |
| `EpubTsBookSearch.Engine.ts` | Serialized section search |
| `ReaderSearch.Controller.ts` | Exclusive full-Book section traversal |
| `EpubTsHighlightRenderer.Engine.ts` | Durable, staged, and temporary mark reconciliation |
| `EpubTsImportRangeRepair.Engine.ts` | DOM range reconstruction and epub-ts CFI conversion |
| `EpubImportRangeRepair.Policy.ts` | Normalized-text and punctuation-tolerant repair matching |
| `EpubTsRenditionSettings.Engine.ts` | Scoped rendition theme and style application |
| `EpubTsLocation.Mapper.ts` | Renderer locations and TOC entries mapped to Reader domain values |
| `EpubSelection.Adapter.ts` | Browser selection and quote-context extraction |
| `EpubVisibleCfiRangeAnchor.Placement.ts` | Visible range geometry for toolbar placement |
| `ReaderReflowTarget.Policy.ts` | CFI selection across resize and settings reflow |

Known library defects and limits belong in the
[epub-ts support ledger](./epub-ts-support-issues.md).

## Operating invariants

- CFI is the canonical restore and spatial anchor. Href, labels, and percentage are display
  metadata.
- Drawer, menu, dialog, Settings, import, annotation, toolbar, and connectivity state must not
  recreate the EPUB engine.
- Viewport mutations run through `ReaderRuntime.Controller.ts`; competing display, navigation,
  resize, or settings operations must not bypass it.
- Opened progress seeds autosave. Bootstrap relocation quarantine prevents intermediate startup
  relocations from overwriting the restored CFI.
- Unrelated navigation cancels staged selection. Import staging and layout reflow protect their own
  relocations and request toolbar re-anchoring.
- Post-ready reflow intent goes through the runtime, which preserves the protected/current anchor,
  applies settings or size, refreshes marks, then re-anchors the staged toolbar.
- Temporary search marks clear before staged or durable handoff. Staged marks clear before commit or
  cancel completes. Canonical annotation state restores durable marks.
- epub-ts identifies marks by CFI and renderer type. A same-CFI staged preview temporarily replaces
  the durable mark; an exact same-CFI commit in the current Reading Session updates the existing
  application annotation.
- Marginalia from previous Reading Sessions remains read-only.
- Cleanup is generation-safe: stale asynchronous work cannot publish capabilities, mutate the active
  runtime, or retain an obsolete engine.

## Product limits

- Reader settings and themes are browser-local preferences.
- In-book search runs on explicit submission or an initial Reader search route, not every keystroke.
- Search uses epub-ts section traversal. There is no general fuzzy-search engine, and import range
  repair does not cross spine sections.
- Import accepts Glasp CSV and a single-Reading-Session Second Pass Marginalia JSON export. Import
  jobs stay in memory, are reviewed row by row, and do not survive reload.
- Import does not persist provenance or perform import-level duplicate detection. Confirmed rows use
  the normal annotation path and same-CFI update policy.
- Highlight CFIs are immutable after creation. Changing an anchor requires deleting and recreating
  the highlight; endpoint drag editing is unsupported.
- Marginalia from previous Reading Sessions is display-only context.

## Diagnostics

Debug logging is opt-in. Categories are `reader`, `imports`, and `staged-selection`.

```js
localStorage.setItem("secondpass.debug.logs", "reader,imports,staged-selection")
```

Use `*` to enable every category and remove the key to disable logging. Settings > Tools provides
the same controls.

Full import text previews require a separate setting:

```js
localStorage.setItem("secondpass.debug.logs.imports.verbose", "1")
```

Enable verbose previews only with non-sensitive fixture data. Never log bearer tokens,
authorization values, or private URLs.

Diagnostic owners:

- `imports/ReaderImportDebug.Diagnostics.ts`
- `imports/ReaderRangeRepairDebug.Adapter.ts`
- `shell/ReaderStagedSelection.Diagnostics.ts`

## Validation

Run after Reader changes:

```powershell
npm.cmd test -- --run <focused Reader test paths>
npm.cmd run verify
```
