# Agent instructions (SecondPassReaderClient)

This repo is a **standalone browser app**. Keep it statically deployable and independent of the Django server implementation.

## Hard constraints

- Do **not** couple the app to Django templates, server-rendered pages, or Django-specific routing assumptions.
- Do **not** introduce styling frameworks or state-management libraries without asking first.
- Do **not** add OAuth/OIDC libraries unless explicitly requested.
- Assume the primary dev environment is **Windows 10 + VS Code**.

## Architecture rules of thumb

- Isolate all server calls behind a `ServerBridge` / API client layer.
- Isolate renderer-specific code behind a `ReaderBridge` abstraction.
- Renderer state must **not** become the app’s canonical data model.
- Canonical annotation/session data is **W3C Web Annotation JSON-LD** (with EPUB CFI selectors), not epub.js internal state.

## Auth/linking

- Use the server’s PIN/code based Client API linking flow:
  - Discover via `/.well-known/secondpass`
  - Create login request
  - Display `code` and `authorize_url`
  - Poll `poll_url` for a one-time bearer token
  - Verify with `GET /api/v1/accounts/me/`
- Treat bearer tokens as password-equivalent: never log them and avoid persisting unless explicitly designed.

## Coding style

- Prefer simple, boring, understandable code.
- Keep layers explicit; avoid “magic” abstractions.
- If a change would introduce a large new dependency or framework, ask first and explain why.

## Refactor conventions

- When adding non-trivial new behavior, prefer a dedicated file/module/hook/component instead of growing an already-large file.
- Large files should usually only be modified to wire new modules in.
- Keep responsibilities narrow:
  - components render UI
  - hooks own interaction/lifecycle state
  - helpers own pure mapping/formatting/sorting
  - adapters own API/schema translation
  - orchestrators wire behavior together; avoid “dumping ground” growth
- When extracting, avoid broad rewrites; make small focused modules with explicit boundaries.

## Folders and file size

- If an activity has more than one meaningful subview, it should become a folder.
- If a component needs dedicated hooks, helpers, or local types, it should usually become a folder.
- If a file crosses ~300 lines, split by responsibility before adding more behavior.
- Treat 300 lines as a heuristic, not a hard rule; prefer extraction when adding new behavior to an already-large mixed-responsibility file.
- Prefer folder layouts that make boundaries obvious, e.g.:
  - `ComponentName.tsx`
  - `useComponentBehavior.ts`
  - `componentHelpers.ts`
  - `componentTypes.ts`
  - subcomponents as needed
- Avoid creating index/barrel files unless the package already consistently uses them.

## Hook dependency stability

- Custom hooks that return callbacks/arrays/objects used by shell/engine/orchestrator components should be referentially stable where practical.
- Wrap returned callbacks in `useCallback`; wrap derived arrays/objects passed as props in `useMemo`. Consider memoizing the returned hook object itself.
- At call sites, destructure the specific values/callbacks needed; avoid depending on aggregate hook result objects in dependency arrays (e.g. `sessionAnnotations`, `stagedToolbar`).
- Reader engine lifecycle effects are especially sensitive: unstable props/callbacks can cause destroy/re-init loops, duplicated network requests, or blank viewports.
- When extracting around reader shell/orchestrator code, verify engine init effects do not begin depending on rapidly changing UI state (e.g. staged selection/toolbar state, derived annotation arrays, aggregate hook objects).
- If a stable callback needs current mutable state, prefer a ref pattern over putting that state into a lifecycle effect dependency list.

## Spec junction (read-only reference)

- `docs/specs/reading-session-annotation-profile` is a **Windows junction** / reference copy of a **server-owned** spec.
- Do **not** edit files inside that folder from this client repo.
- If the spec needs changes, stop and ask; changes must be made in the server/spec owner project first.
- Client implementation may reference the spec, but runtime TypeScript types belong in `src/schemas/`.
- Do not import runtime app code from `docs/` (docs are reference material only).
