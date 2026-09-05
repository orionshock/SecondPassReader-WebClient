# Agent instructions (SecondPassReader-WebClient)

This repo is a **standalone browser app**. Keep it statically deployable and independent of the Django server implementation.

## Hard constraints

- Do **not** couple the app to Django templates, server-rendered pages, or Django-specific routing assumptions.
- Do **not** introduce styling frameworks or state-management libraries without asking first.
- Do **not** add OAuth/OIDC libraries unless explicitly requested.
- This project is pre-release. Do **not** add compatibility aliases, deprecated API shims, dual method names, legacy fallbacks, or migration layers unless explicitly requested. Update callers directly.
- Assume the primary dev environment is **Windows 10 + VS Code**.

## Architecture rules of thumb

- Isolate all server calls behind a `ServerBridge` / API client layer.
- Isolate renderer-specific code behind a `ReaderBridge` abstraction.
- Renderer state must **not** become the app's canonical data model.
- Canonical annotation/session data is **W3C Web Annotation JSON-LD** (with EPUB CFI selectors), not epub.js internal state.

## Auth/linking

- Use the server's PIN/code based Client API linking flow:
  - Discover via `/.well-known/secondpass`
  - Create login request
  - Display `code` and `authorize_url`
  - Poll `poll_url` for a one-time bearer token
  - Verify with `GET /api/v1/accounts/me/` and `GET /api/v1/server/info/`
- Treat bearer tokens as password-equivalent: never log them and avoid persisting unless explicitly designed.

## Coding style

- Prefer simple, boring, understandable code.
- Keep layers explicit; avoid "magic" abstractions.
- If a change would introduce a large new dependency or framework, ask first and explain why.

## Testing policy

- Tests protect executable behavior, contracts, and invariants.
- Prefer the smallest set of tests that strongly protects the important behavior; test volume and coverage percentage are not goals by themselves.
- Do not add tests for documentation, copy, repository layout, implementation details, generated artifacts, or configuration text merely because those things changed.
- Tooling and deployment code warrant tests only when they contain meaningful executable behavior whose failure would materially affect the product or delivery process.
- Do not edit existing tests merely as part of implementation cleanup or to make the suite pass. Preserve existing tests by default. If an implementation intentionally changes a tested contract or invariant, evaluate and justify the test change separately before editing it.
- Every new test or materially new test case requires a substantive justification that explains both:
  - exactly what executable behavior, contract, or invariant the test covers
  - why protecting that behavior is important to the product or delivery process
- A test justification must be specific enough to review. A one-word label or one-line restatement of the test name is not sufficient.
- When an existing test fails after a change, evaluate before editing code or the test:
  - what behavior, contract, or invariant the test is intended to protect
  - whether the underlying behavior actually changed
  - whether the current testing approach is still the best way to protect that behavior
  - whether the test remains necessary
- If changing an existing test is justified after that evaluation, document what behavior changed, why the old expectation is no longer correct, and why the revised test remains valuable. Do not change expectations merely to match the current implementation.
- Do not write production code solely to make a test pass when that code does not serve the intended product behavior or contract.
- Do not weaken, rewrite, or delete a test solely to make the suite green. A green suite is useful only when its tests still protect meaningful behavior.
- Implementation reports must include:
  - existing test commands run and their results
  - each new test's specific coverage and why that coverage matters
  - any existing test failures encountered and the evaluation performed
  - any justified existing-test changes, including the behavioral reason for each change

## Refactor conventions

- When adding non-trivial new behavior, prefer a dedicated file/module/hook/component instead of growing an already-large file.
- Large files should usually only be modified to wire new modules in.
- Keep responsibilities narrow:
  - components render UI
  - hooks own interaction/lifecycle state
  - helpers own pure mapping/formatting/sorting
  - adapters own API/schema translation
  - orchestrators wire behavior together; avoid "dumping ground" growth
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

- These naming and grouping conventions apply project-wide, across every feature and layer. Reading/client names below are examples, not a scope restriction.
- Prefer folders for grouping related files, not underscore-based file names.
- Use standard React/TypeScript naming with explicit role suffixes throughout the project:
  - PascalCase for component files/classes/types, e.g. `ReaderBookSearch.Drawer.tsx`, `ReaderBookSearch.ResultRow.tsx`
  - PascalCase role owners for hooks/helpers, e.g. `ReaderBookSearch.Controller.ts`, `ReaderBookSearch.Labels.ts`
- For related UI pieces, prefer a feature folder with repeated readable prefixes:

  `bookSearch/`
  - `ReaderBookSearch.Drawer.tsx`
  - `ReaderBookSearch.InputBar.tsx`
  - `ReaderBookSearch.ResultList.tsx`
  - `ReaderBookSearch.ResultRow.tsx`
  - `ReaderBookSearch.Controller.ts`
  - `ReaderBookSearch.Labels.ts`

- Avoid underscore grouping such as:
  - `BookSearch_Drawer.tsx`
  - `BookSearch_InputBar.tsx`

### Project-wide role suffixes

- New or meaningfully touched files anywhere in the project should use an explicit role suffix when practical. Use folders when they clarify real ownership; do not mass-rename existing files for cosmetics.
- Rename a touched file only when the name materially clarifies its responsibility and the import churn is reasonable.
- Preferred roles:
  - `.Activity.tsx`: route-level product entry that connects navigation, loading, and major feature composition.
  - `.Orchestrator.tsx`: composition root that coordinates multiple domain owners without implementing their internals.
  - `.Controller.ts`: imperative sequencing or stateful operation ownership for one feature lifecycle.
  - `.Coordinator.ts`: ordering and synchronization across multiple systems or lifecycles.
  - `.Bridge.ts`: stable renderer-neutral or service-neutral capability contract.
  - `.Engine.ts`: concrete renderer or processing-engine implementation behind a bridge.
  - `.Adapter.ts`: translation at an external schema, library, or service contract boundary.
  - `.Mapper.ts`: pure conversion between internal data shapes.
  - `.Presenter.ts`: view-model construction and user-facing text or display formatting.
  - `.Types.ts`: shared types only; no runtime behavior.
  - `.State.ts`: reducers, state transitions, and state invariants.
  - `.Store.ts`: persisted local-storage ownership and serialization.
  - `.Queries.ts`: query generation and other read-side helpers.
  - `.Actions.ts`: mutation construction and other write-side operations.
  - `.Lifecycle.ts`: setup, teardown, subscription, and lifecycle state-machine behavior.
  - `.Placement.ts`: pure geometry and layout-position calculation.
  - `.Renderer.ts`: visual mark, canvas, or renderer-output creation and cleanup.
- UI roles:
  - `.Panel.tsx`: persistent or docked feature surface.
  - `.Drawer.tsx`: dismissible edge-attached feature surface.
  - `.Toolbar.tsx`: compact action controls for a current context or selection.
  - `.Row.tsx`: one row in a table-like or metadata-heavy collection.
  - `.Item.tsx`: one general collection entry when row semantics do not apply.
  - `.Dialog.tsx`: modal interaction requiring focused user action.
- Prefer feature-local ownership over global abstractions. Avoid vague `utils`, `helpers`, or `misc` folders when a lifecycle or domain owner exists.
- Boundary files may include a short ownership comment when the name alone is insufficient.

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

## Lifecycle boundaries and callback stability

- Treat lifecycle-heavy components and hooks as sensitive boundaries.
- Opening/closing ordinary UI chrome such as menus, drawers, modals, popovers, tabs, or tool panels should not accidentally tear down and recreate expensive or stateful systems.
- Examples of lifecycle-heavy systems include:
  - EPUB/rendering engines
  - editors
  - canvases
  - media players
  - websocket/session clients
  - long-running workers/tasks
  - embedded third-party widgets
- Before adding props/callbacks to a lifecycle-heavy component or hook, check whether callback identity changes can affect initialization/cleanup effect dependencies.
- If a callback needs to stay current but should not participate in lifecycle identity, store it behind a ref and call the latest ref value from a stable callback.
- Do not include ordinary chrome/UI callbacks in initialization effect dependency lists unless they truly require rebuilding the underlying system.
- Keep initialization dependencies limited to actual lifecycle identity inputs, such as source/document identity, mount target, connection identity, or settings that genuinely require teardown/reinit.
- UI state changes should update UI only; they should not remount expensive/stateful systems unless explicitly intended.
- When reviewing changes around lifecycle-heavy code, explicitly check:
  - Did this add a new dependency to an initialization effect?
  - Did this pass a newly-created object/function into lifecycle-sensitive code?
  - Could opening a menu/drawer/modal recreate the underlying system?
  - Should this callback be memoized or moved behind a ref?
  - Is this dependency needed for correctness, or only to satisfy a local hook warning?
- After changes near lifecycle-heavy code, manually verify that ordinary chrome interactions do not reset, blank, disconnect, or recreate the underlying stateful system.

Rationale:
- React callback/object identity changes from ordinary UI state can accidentally cascade into hook dependency changes.
- If those values are dependencies of initialization or cleanup effects, harmless UI interactions can destroy/recreate expensive systems.
- Stateful systems should be controlled by explicit lifecycle inputs, not incidental UI rerenders.

## Temporary debug logging

- For any project work, prefer adding scoped temporary `console.debug` logs early when behavior is unclear, runtime paths are hard to verify, or async/stateful code is involved.
- Use stable searchable prefixes such as `[SPR reader]`, `[SPR engine]`, `[SPR annotations]`, `[SPR import]`, or another focused `[SPR ...]` prefix for the area being changed.
- Log inputs, derived outputs, skip reasons, and cleanup/cancellation decisions.
- Leave logs in place while the feature is under active development.
- Before a production/polish pass, remove temporary debug logs or gate them behind an explicit debug flag.
- Do not replace understanding with broad rewrites; use logs to verify the actual runtime path first.

## Layer handoff cleanup

- Each layer owns the lifecycle of the temporary state it creates.
- Before passing control or data to another layer, clean up or resolve that layer's temporary state.
- Do not hand downstream layers messy intermediate state and expect them to understand where it came from.
- Origin is upstream context.
- Lifecycle is local responsibility.
- Durability is downstream concern.

Examples:
- Search/import code may create temporary search-match state, but must clear or release it when done.
- Shell/staged-selection code may create temporary visual range state, but must clear or resolve it before save/cancel handoff.
- Annotation persistence should receive confirmed annotation intent, not search/import/staging lifecycle details.
- Annotation workspace should display durable annotations and should not care whether they began as manual selection, search, or import.

For reader highlights specifically:
- Search flashes, staged previews, and durable annotation marks must not be layered casually.
- Temporary renderer marks should be removed before creating or restoring durable marks.
- Cleanup paths must be explicit for cancel, commit, failed commit, skip, clear, and navigation/focus-driven teardown.

## Spec junction (read-only reference)

- `docs/specs/reading-session-annotation-profile` is a **Windows junction** / reference copy of a **server-owned** spec.
- Do **not** edit files inside that folder from this client repo.
- If the spec needs changes, stop and ask; changes must be made in the server/spec owner project first.
- Client implementation may reference the spec, but runtime TypeScript types belong in `src/schemas/`.
- Do not import runtime app code from `docs/` (docs are reference material only).

## Text and character policy

When editing repository files, prefer plain ASCII characters unless the file already clearly requires Unicode or the requested user-facing text specifically needs it.

Use ASCII equivalents by default:

* Use `...` instead of `...`
* Use `'` and `"` instead of smart quotes
* Use `-` or `--` instead of en/em dashes
* Use `(c)`, `(r)`, `->`, `<-`, `=>`, etc. instead of symbol substitutions unless the project already uses the Unicode form

Do not introduce non-ASCII punctuation, invisible characters, non-breaking spaces, or typographic substitutions into source code, JSX, Markdown, JSON, YAML, SQL, shell scripts, or config files unless there is a clear functional or localization requirement.

Before producing a patch, preserve the file's existing character style. If the surrounding text uses ASCII punctuation, continue using ASCII punctuation. If a non-ASCII character is needed, mention it explicitly in the final summary.

Patch anchors should avoid non-ASCII text when possible. Prefer stable ASCII-only surrounding code, identifiers, class names, props, or structural JSX.
