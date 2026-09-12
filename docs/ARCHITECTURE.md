# Architecture

Second Pass Reader is a standalone, hash-routed browser application. It does not use Django
templates, server-rendered routes, or Second Pass Library runtime code.

## Stack

- React 19
- TypeScript
- Vite
- `@likecoin/epub-ts` for EPUB rendering
- `@secondpass/client` for Second Pass Library calls
- Repo-owned CSS without a styling framework

## Startup and routing

`src/app/App.tsx` selects the connection workflow or authenticated application. Main routes do not
mount until the active connection is authenticated and its account identity is verified.

`src/app/AppNavigation.Router.ts` parses and generates these hash-route families:

- `#/connect`, `#/pair`, and `#/verify`
- `#/home` and `#/library`, with Book Detail carried by a `book` query parameter
- `#/shelves`, Shelf detail, and Shelf editing
- `#/sessions` and Reading Session detail
- `#/settings`
- `#/reader/:bookId`

Because navigation state follows `#`, application routes are not sent to the static server. See
[deployment.md](./deployment.md) for the root-path and nginx contract.

## Authority and data boundaries

- Second Pass Library is authoritative for catalog, Shelf, Reading Session, progress, and
  Marginalia data.
- The Web Client keeps one active connection and browser-local display preferences.
- IndexedDB stores namespace-scoped cached projections, explicitly retained publication assets and
  covers, Reader continuity, and pending Reader work.
- Renderer state is transient. It is never canonical Reader or Marginalia data.
- W3C Web Annotation JSON-LD and EPUB CFI selectors remain the canonical annotation contract.
- `@likecoin/epub-ts` types and behavior stay behind the Reader engine boundary.

The active connection contains a bearer token after linking. Treat the token as a password: never
log it or place it in a URL. Linking uses the PIN/code Client API flow; OAuth/OIDC is not part of
the application.

## SDK boundary

Application features call the `@secondpass/client` facade. The package owns endpoint URLs,
authentication, wire payloads, response projection, and API error normalization. Feature code must
not reproduce those contracts.

- [SDK overview](../packages/secondpass-client/README.md)
- [SDK API](../packages/secondpass-client/docs/API.md)
- [SDK data model](../packages/secondpass-client/docs/DATA_MODEL.md)

## Source ownership

| Path | Ownership |
| --- | --- |
| `src/app/` | Application composition, routing, authenticated context, connectivity, Settings, and offline infrastructure |
| `src/app/offline/browser/` | Browser storage capability and persistence APIs |
| `src/app/offline/storage/` | IndexedDB schema, repository contracts, and repository construction |
| `src/app/offline/publication/` | Publication assets, durable covers, verification, storage admission, and removal |
| `src/app/offline/reader/` | Local Reader continuity, outbox, replay, retry, coordination, and sync notices |
| `src/app/offline/namespace/` | Namespace identity, inspection, retention messaging, and complete cleanup |
| `src/components/` | Small shared visual components and structured-content renderers |
| `src/features/connection/` | Discovery, PIN/code linking, verification, repair, and connection removal |
| `src/features/home/` | Server Home and cached offline Home previews |
| `src/features/library/` | Catalog browsing, Book Detail, offline Library, and publication availability controls |
| `src/features/shelves/` | Online Shelf list, detail, and editing |
| `src/features/sessions/` | Online Reading Session list, detail, metadata, and close flows |
| `src/features/reader/` | Reader activity, Reading Session orchestration, shell, EPUB engine, Marginalia, search, imports, and display settings |
| `src/storage/` | Small synchronous browser stores for the active connection and preferences |
| `src/styles/` | Global and Reader stylesheets |
| `packages/secondpass-client/` | Transport-independent TypeScript client for Second Pass Library |

Folders represent product or subsystem ownership. Filename suffixes identify responsibility; see
[AGENTS.md](../AGENTS.md) for the naming and folder rules.

## Major owners

`App.tsx`
: Composes the connection workflow, authenticated lifecycle, routes, global notices, and top-level
  online/offline route selection.

`AppReaderOpen.Controller.ts`
: Selects server-backed or retained-local Reader opening and owns publication object URL cleanup.

`ReadingActivity.Orchestrator.tsx`
: Composes Reader chrome, imports, completion, and Reading Session behavior.

`ReadingSession.Orchestrator.tsx`
: Connects Reading Session progress and Marginalia to renderer-neutral capabilities.

`ReadingShell.Orchestrator.tsx`
: Coordinates the Reader viewport, engine lifecycle, commands, location publication, and reflow.

`EpubTsBook.Engine.ts`
: Exposes EPUB rendering behind the Reader engine boundary.

Detailed Reader ownership and lifecycle invariants belong in [reader.md](./reader.md). Offline
storage, sync, retry, and cleanup belong in [offline-mode.md](./offline-mode.md).

## Lifecycle constraints

The EPUB engine is stateful and expensive. Menus, drawers, dialogs, tabs, connectivity changes, and
tool panels must not recreate it. Only document identity, mount identity, and settings that require
reinitialization belong in engine bootstrap dependencies.

The layer that creates temporary interaction state must clear or resolve it before handoff. Search
marks, staged highlights, and durable annotation marks have separate owners and lifecycles.
