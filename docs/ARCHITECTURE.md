# Architecture

Second Pass Reader is a standalone static browser app. It does not use Django templates,
server-rendered routes, or server runtime code.

## Stack

- React 19
- TypeScript
- Vite
- `@likecoin/epub-ts` for EPUB rendering
- Workspace package `@secondpass/client` for Second Pass server calls
- CSS in repo-owned stylesheets, without a styling framework

## Routing and startup

The app is hash-routed. Route parsing and hash generation live in `src/app/AppNavigation.Router.ts`.

Primary route families:

- `#/connect`, `#/pair`, `#/verify`
- `#/home`
- `#/library`
- `#/shelves`
- `#/sessions`
- `#/reader/:bookId`

The workflow gate in `src/app/App.tsx` blocks the main app routes until the selected profile is
authenticated and verified.

## Data Boundaries

- The server is canonical for library data, reading sessions, progress, and annotations.
- Browser storage keeps local connection profiles, app theme, reader settings, library display preference, return targets, and marginalia layer preferences.
- Renderer state is transient and never canonical app data.
- Live annotation/session data uses the SPL Marginalia Profile shape with EPUB CFI selectors.
- `@likecoin/epub-ts` details stay behind the reader engine boundary.

## Application Constraints

- Static deployment and hash routing keep the app independent of server-rendered routes.
- Connection profiles and browser preferences are local state, not server-synchronized settings.
- Connection profiles contain bearer tokens after linking. Tokens are password-equivalent and must
  not be logged or placed in URLs.
- Server linking uses the PIN/code Client API flow. OAuth/OIDC is not part of the current product.
- Reader themes use repo-owned CSS variables and activity attributes; there is no styling framework.

See [reader.md](./reader.md) for Reader limits and
[epub-ts-support-issues.md](./epub-ts-support-issues.md) for renderer defects and library limits.

## Client SDK Boundary

Application features call the `@secondpass/client` facade. The package owns endpoint URLs,
authentication headers, wire payloads, response projection, and API error normalization. Feature
code must not recreate those contracts.

SDK documentation has a separate package audience:

- [Package overview](../packages/secondpass-client/README.md)
- [Public API](../packages/secondpass-client/docs/API.md)
- [Data model](../packages/secondpass-client/docs/DATA_MODEL.md)

## Source Layout

`src/app/`
: Top-level app shell, routing helpers, workflow selection, SPL client creation, header, settings panel.

`src/components/`
: Shared small UI components.

`src/features/connection/`
: Server discovery, Client API linking, and account verification UI.

`src/features/home/`
: Home dashboard.

`src/features/library/`
: Library browsing, book detail modal, book download/open workflow.

`src/features/shelves/`
: Shelf list, detail, and edit flows.

`src/features/sessions/`
: Reading session list/detail and close-session UI.

`src/features/reader/`
: Reader activity, EPUB shell/engine, reading session orchestration, annotations, search, imports, settings, and viewport.

`src/storage/`
: Local browser persistence helpers.

`src/styles/`
: Global and reader CSS.

`packages/secondpass-client/`
: Pure TypeScript client package for server API workflows.

## Layer ownership

`App.tsx`
: Wires the global workflow, routes, selected connection profile, connection recovery, and top-level
route rendering. `AppReaderOpen.Controller.ts` owns Reader restore/open state and object URL cleanup.

`ReadingActivity.Orchestrator.tsx`
: Renders Reader chrome and layout. Controllers under `src/features/reader/activity/` handle import
review, completion, and end-of-book behavior.

`ReadingSession.Orchestrator.tsx`
: Wires session metadata, progress autosave, annotations, previous-session layers, renderer-neutral
bridge state, and shell render state.

`ReadingShell.Orchestrator.tsx`
: Wires Reader chrome to the shell lifecycle modules under `src/features/reader/shell/`: bootstrap,
capability publication, command routing, location publication, settings reflow, runtime
serialization, and toolbar control.

`EpubTsBook.Engine.ts`
: Public `@likecoin/epub-ts` facade. Search, highlight rendering, rendition settings, range
repair, location mapping, and geometry remain engine-owned modules behind that facade.

`@secondpass/client`
: Owns HTTP, auth headers, endpoint details, payload shaping, response projection, and API error
normalization.

## Lifecycle Boundaries

The EPUB engine is expensive and stateful. Opening menus, drawers, dialogs, tabs, or tool panels must
not recreate it. Callback identity and effect dependencies near `ReadingShell` and
`EpubTsBookEngine` are lifecycle-sensitive.

The layer that creates temporary state must resolve or clear it before handoff. Search flashes,
staged highlight previews, and durable annotation marks have separate lifecycles.

See [reader.md](./reader.md) for the detailed Reader ownership map and operating invariants.
