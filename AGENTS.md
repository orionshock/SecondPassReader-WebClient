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

## File size and organization

- Prefer smaller, focused feature-local files over large multi-responsibility files.
- A file can have one clear job and still be too large. If it becomes hard to scan, split it by sub-responsibility inside that job.
- Soft size guidance:
  - ~100 lines: comfortable
  - 150-220 lines: usually fine for UI/components
  - 250+ lines: look for obvious sub-responsibilities to extract
  - 350+ lines: split unless it is truly orchestration/glue
- Do not split into micro-files just to reduce line count. Split when the new file has a clear name and stable responsibility.
- Prefer feature-local folders over generic shared utility folders.
- Avoid broad `utils` dumping grounds.

## Naming and grouping

- Prefer folders for grouping related files, not underscore-based file names.
- Use standard React/TypeScript naming:
  - PascalCase for component files/classes/types that represent components, e.g. `BookSearchDrawer.tsx`, `BookSearchResultRow.tsx`
  - camelCase for hooks/helpers, e.g. `useBookSearchController.ts`, `bookSearchLabels.ts`
- For related UI pieces, prefer a feature folder with repeated readable prefixes:

  `bookSearch/`
  - `BookSearchDrawer.tsx`
  - `BookSearchInputBar.tsx`
  - `BookSearchResultList.tsx`
  - `BookSearchResultRow.tsx`
  - `useBookSearchController.ts`
  - `bookSearchLabels.ts`

- Avoid underscore grouping such as:
  - `BookSearch_Drawer.tsx`
  - `BookSearch_InputBar.tsx`

## Rationale

- Folder grouping is more conventional in React/TypeScript projects.
- Prefixed file names remain searchable and understandable when viewed outside the folder.
- Smaller feature-local files are easier for humans and AI agents to parse safely.
- Prefer clear local composition over clever generic abstraction.

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

## Text and character policy

When editing repository files, prefer plain ASCII characters unless the file already clearly requires Unicode or the requested user-facing text specifically needs it.

Use ASCII equivalents by default:

* Use `...` instead of `…`
* Use `'` and `"` instead of smart quotes
* Use `-` or `--` instead of en/em dashes
* Use `(c)`, `(r)`, `->`, `<-`, `=>`, etc. instead of symbol substitutions unless the project already uses the Unicode form

Do not introduce non-ASCII punctuation, invisible characters, non-breaking spaces, or typographic substitutions into source code, JSX, Markdown, JSON, YAML, SQL, shell scripts, or config files unless there is a clear functional or localization requirement.

Before producing a patch, preserve the file’s existing character style. If the surrounding text uses ASCII punctuation, continue using ASCII punctuation. If a non-ASCII character is needed, mention it explicitly in the final summary.

Patch anchors should avoid non-ASCII text when possible. Prefer stable ASCII-only surrounding code, identifiers, class names, props, or structural JSX.
