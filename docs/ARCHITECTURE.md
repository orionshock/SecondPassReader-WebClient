# Architecture

Second Pass Reading Client is a standalone static browser app. It is not the Django server and should not depend on Django templates, server-rendered routes, or server runtime code.

## Stack

- React 19
- TypeScript
- Vite
- `@likecoin/epub-ts` for EPUB rendering
- Workspace package `@secondpass/client` for Second Pass server calls
- CSS in repo-owned stylesheets, without a styling framework

## Runtime Shape

The app is hash-routed. Route parsing and hash generation live in `src/app/AppNavigation.Router.ts`.

Primary route families:

- `#/connect`, `#/pair`, `#/verify`
- `#/home`
- `#/library`
- `#/shelves`
- `#/sessions`
- `#/reader/:bookId`

The workflow gate in `src/app/App.tsx` prevents unauthenticated or unverified profiles from entering the main app routes.

## Data Boundaries

- The server is canonical for library data, reading sessions, progress, and annotations.
- Browser storage keeps local connection profiles, app theme, reader settings, library display preference, return targets, and marginalia layer preferences.
- Renderer state is not canonical app data.
- Live annotation/session data uses the SPL Marginalia Profile shape with EPUB CFI selectors.
- `@likecoin/epub-ts` details stay behind the reader engine boundary.

## Application Constraints

- The app is statically deployed and hash-routed; it does not depend on server-rendered routes.
- Connection profiles and browser preferences are local state, not server-synchronized settings.
- Connection profiles contain bearer tokens after linking. Tokens are password-equivalent and must
  not be logged or placed in URLs.
- Server linking uses the PIN/code Client API flow. OAuth/OIDC is not part of the current product.
- Reader themes use repo-owned CSS variables and activity attributes; there is no styling framework.

Feature-specific Reader limits are documented in [reader.md](./reader.md). Renderer defects and
support-library limitations are documented separately in
[epub-ts-support-issues.md](./epub-ts-support-issues.md).

## Client SDK Boundary

Application features use the `@secondpass/client` facade. Endpoint URLs, authentication headers,
wire payloads, response projection, and API error normalization remain package-owned implementation
details. Feature code must not reconstruct those contracts.

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

## Layer Responsibilities

`App.tsx`
: Composes global workflow, route handling, selected connection profile, connection recovery, and
top-level route rendering. `AppReaderOpen.Controller.ts` owns reader restore/open state and object
URL cleanup.

`Reading.Activity.tsx`
: Composes reader page chrome and layout. Activity-level import review and completion/end-book
behavior live in dedicated controllers under `src/features/reader/activity/`.

`ReadingSession.Orchestrator.tsx`
: Composes session metadata, progress autosave, annotations, previous-session layers, renderer-neutral
bridge state, and shell render state from dedicated session owners.

`Reading.Shell.tsx`
: Composes reader chrome and shell lifecycle owners. Bootstrap, capability publication, command
routing, location publication, settings reflow, runtime serialization, and toolbar orchestration are
separate modules under `src/features/reader/shell/`.

`EpubTsBook.Engine.ts`
: Is the public `@likecoin/epub-ts` facade. Search, highlight rendering, rendition settings, range
repair, location mapping, and geometry remain engine-owned modules behind that facade.

`@secondpass/client`
: Owns HTTP, auth headers, endpoint details, payload shaping, response projection, and API error
normalization.

## Lifecycle Boundaries

The EPUB engine is expensive and stateful. Opening menus, drawers, modals, tabs, or tool panels must not recreate it. Callback identity and effect dependencies near `ReadingShell` and `EpubTsBookEngine` should be treated as lifecycle-sensitive.

Temporary state must be resolved by the layer that creates it before handing off to another layer. Search flashes, staged highlight previews, and durable annotation marks should not be layered casually.

See [reader.md](./reader.md) for the detailed Reader ownership map and operating invariants.
