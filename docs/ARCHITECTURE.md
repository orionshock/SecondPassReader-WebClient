# Architecture

Second Pass Reading Client is a standalone static browser app. It is not the Django server and should not depend on Django templates, server-rendered routes, or server runtime code.

## Stack

- React 18
- TypeScript
- Vite
- `@likecoin/epub-ts` for EPUB rendering
- Workspace package `@secondpass/client` for Second Pass server calls
- CSS in repo-owned stylesheets, without a styling framework

## Runtime Shape

The app is hash-routed. Route parsing and hash generation live in `src/app/navigation.ts`.

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
- Annotation/session data uses W3C Web Annotation JSON-LD with EPUB CFI selectors.
- `@likecoin/epub-ts` details stay behind the reader engine boundary.

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
: Owns global workflow, route handling, selected connection profile, and opening/closing book blobs.

`ReadingActivity.tsx`
: Owns reader page chrome, panels/drawers, import modal state, end-of-book dialogs, and reader layout composition.

`ReadingSessionOrchestrator.tsx`
: Coordinates session metadata, progress autosave, annotations, previous session layers, shell commands, search handle registration, and staged-selection callbacks.

`ReadingShell.tsx`
: Owns reader interaction chrome and the `EpubTsBookEngine` lifecycle.

`EpubTsBookEngine.ts`
: Owns all `@likecoin/epub-ts` integration and exposes app-owned commands/events.

`@secondpass/client`
: Owns HTTP, auth headers, endpoint details, payload shaping, and API error normalization.

## Lifecycle Boundaries

The EPUB engine is expensive and stateful. Opening menus, drawers, modals, tabs, or tool panels must not recreate it. Callback identity and effect dependencies near `ReadingShell` and `EpubTsBookEngine` should be treated as lifecycle-sensitive.

Temporary state must be resolved by the layer that creates it before handing off to another layer. Search flashes, staged highlight previews, and durable annotation marks should not be layered casually.

