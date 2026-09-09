# Agent instructions: SecondPassReader-WebClient

## Scope and authority

This repository is a standalone, statically deployable browser application.
Keep the client independent of the Django server implementation.

- Do not depend on Django templates, server-rendered pages, or Django-specific routing.
- Work within this repository and the scope of the current task.
- Treat published server contracts as authoritative. Do not inspect or modify an adjacent repository unless the task explicitly authorizes it.
- If a server contract or another ownership boundary prevents a correct client implementation, stop and report the local evidence, the blocking contract, why a client-side workaround would be wrong, and the smallest contract change needed. A human authorizes any cross-boundary change.

Before making a consequential change, inspect the target code, its direct callers and callees, the nearest relevant tests, and the nearest analogous implementation. Expand the search only when that evidence is insufficient.

## Dependencies and compatibility

- Establish the concrete need before proposing a new dependency, framework, or project-wide pattern. Explain the problem it solves, why existing project primitives are insufficient, and its runtime and maintenance impact. Obtain user approval before adding it.
- Do not add a styling framework, state-management library, or OAuth/OIDC library without that approval.
- This project is pre-release. Change the current API and its callers together. Do not add compatibility aliases, deprecated API shims, dual method names, legacy fallbacks, or migration layers unless the task explicitly requires compatibility behavior.
- Assume the primary development environment is Windows 10 with VS Code.

## Architecture and data contracts

- Isolate server calls behind the existing `ServerBridge` or API-client boundary.
- Isolate renderer-specific code behind the existing `ReaderBridge` boundary.
- Renderer state must not become the application's canonical data model.
- Canonical annotation and session data is W3C Web Annotation JSON-LD with EPUB CFI selectors, not epub.js internal state.

Use the server's PIN/code-based Client API linking flow:

1. Discover via `/.well-known/secondpass`.
2. Create a login request.
3. Display `code` and `authorize_url`.
4. Poll `poll_url` for a one-time bearer token.
5. Verify with `GET /api/v1/accounts/me/` and `GET /api/v1/server/info/`.

Treat bearer tokens as secrets. Never log them. Do not persist them unless an approved design explicitly defines the storage and security behavior.

## Implementation boundaries

- Make the smallest coherent change that satisfies the requested behavior and preserves existing contracts.
- Reuse existing project primitives. Do not add speculative configurability, parallel implementation paths, generic frameworks for one use case, or abstractions without a current need.
- Keep code together while it has one responsibility and changes for the same reason. Extract only when the new unit has a clear owner and purpose.
- Components render UI; hooks own interaction and lifecycle state; adapters translate external schemas or service contracts; orchestrators coordinate owners without absorbing their internals.
- Prefer feature-local folders and ownership. Do not create generic `utils`, `helpers`, `common`, or `misc` files or folders when the code has a feature, lifecycle, or domain owner.
- Do not create barrel files. The existing SDK barrel is permitted because it performs required SDK work; this exception does not establish a general barrel-file pattern.

Treat roughly 300 lines of code as a review trigger, not a mechanical ceiling. At that point, review the file for a clear focus and purpose before adding more behavior. Do not split solely to reduce line count. A split must provide a real benefit, such as a clearer responsibility, dependency boundary, lifecycle boundary, ownership boundary, or independently testable unit. Name and organize extracted files according to the project-wide role suffixes below.

## Project-wide role suffixes

These conventions are authoritative for new files throughout the project. Apply them to meaningfully changed files when the rename clarifies ownership and the resulting import churn is proportionate to the task. Do not mass-rename unrelated files for cosmetic consistency.

Use PascalCase for component files, classes, and types. Group related files in feature-local folders and use readable repeated prefixes. Do not use underscore-based filename grouping.

The final dot-delimited name is the role suffix. It describes the file's broad responsibility, not its product domain or implementation technology. Put domain and implementation qualifiers before that suffix; for example, prefer `IndexedDbOfflinePublicationAsset.Repository.ts` over treating `IndexedDbRepository` as a new role.

Use the following role suffixes according to the file's actual responsibility:

- `.Api.ts`: remote API resource owner that exposes one service contract behind the transport boundary.
- `.Activity.tsx`: route-level product entry that connects navigation, loading, and major feature composition.
- `.Orchestrator.tsx`: composition root that coordinates multiple domain owners without implementing their internals.
- `.Controller.ts`: imperative sequencing or stateful operation ownership for one feature lifecycle.
- `.Coordinator.ts`: ordering and synchronization across multiple systems or lifecycles.
- `.Bridge.ts`: stable renderer-neutral or service-neutral capability contract.
- `.Engine.ts`: concrete renderer or processing-engine implementation behind a bridge.
- `.Adapter.ts`: translation at an external schema, library, or service contract boundary.
- `.Constants.ts`: named immutable values shared by one feature or subsystem; no runtime ownership.
- `.Context.tsx`: React context definition, provider, and narrowly related context access behavior.
- `.Diagnostics.ts`: opt-in diagnostics, instrumentation, or structured logging for one subsystem; not canonical product state.
- `.Factory.ts`: construction of a configured client, owner, or implementation without retaining its lifecycle ownership.
- `.Fixtures.ts`: test-only builders, fakes, and representative data shared by a focused test area.
- `.Handler.ts`: one registered inbound event, command, or import-format strategy; do not use it as a generic home for unrelated actions.
- `.Mapper.ts`: pure conversion between internal data shapes.
- `.Policy.ts`: pure business rules, eligibility decisions, validation, or classification without I/O or lifecycle ownership.
- `.Presenter.ts`: view-model construction and user-facing text or display formatting.
- `.Registry.ts`: keyed discovery and selection of known strategies, formats, or capabilities.
- `.Repository.ts`: asynchronous domain-record access and transactional persistence behind a storage-neutral contract; put storage-engine qualifiers earlier in the name.
- `.Router.ts`: parsing, serialization, or deterministic dispatch between navigation or command destinations.
- `.Types.ts`: shared types only, with no runtime behavior.
- `.State.ts`: reducers, state transitions, and state invariants.
- `.Store.ts`: app-owned preference or configuration state with its persistence and serialization, typically using a small synchronous browser store.
- `.Queries.ts`: query generation and other read-side helpers.
- `.Actions.ts`: mutation construction and other write-side operations.
- `.Lifecycle.ts`: setup, teardown, subscription, and lifecycle state-machine behavior.
- `.Placement.ts`: pure geometry and layout-position calculation.
- `.Renderer.ts`: visual mark, canvas, or renderer-output creation and cleanup.

UI role suffixes:

- `.Page.tsx`: screen-level feature content rendered within application routing; unlike an Activity, it does not own the route lifecycle or major subsystem composition.
- `.Shell.tsx`: stable frame around a feature subsystem, including its chrome and primary content regions.
- `.Panel.tsx`: persistent or docked feature surface.
- `.Drawer.tsx`: dismissible edge-attached feature surface.
- `.Header.tsx`: contextual heading, navigation, metadata, and actions for a page or feature surface.
- `.Card.tsx`: self-contained summary or interaction surface for one item.
- `.List.tsx`: linear collection ownership and item composition.
- `.Grid.tsx`: two-dimensional collection layout and item composition.
- `.Carousel.tsx`: ordered scrollable or paged collection surface.
- `.Tabs.tsx`: tab selection and switching among sibling feature views.
- `.Menu.tsx`: transient contextual choices or actions anchored to a trigger.
- `.Control.tsx`: one reusable interactive input or compact setting control.
- `.Editor.tsx`: focused editing surface that owns draft interaction and validation presentation.
- `.Form.tsx`: cohesive field collection and submission interaction for one operation.
- `.Toolbar.tsx`: compact action controls for a current context or selection.
- `.Row.tsx`: one row in a table-like or metadata-heavy collection.
- `.Item.tsx`: one general collection entry when row semantics do not apply.
- `.Notice.tsx`: inline, contextual, nonblocking status or error feedback.
- `.Banner.tsx`: prominent conditional status spanning a broad application or feature surface.
- `.Dialog.tsx`: modal interaction requiring focused user action.
- `.Viewport.tsx`: primary mounted content or renderer surface through which the user views and navigates a document or scene.

Example feature layout:

```text
bookSearch/
  ReaderBookSearch.Drawer.tsx
  ReaderBookSearch.Toolbar.tsx
  ReaderBookSearch.Row.tsx
  ReaderBookSearch.Controller.ts
  ReaderBookSearch.Presenter.ts
```

If no listed suffix accurately describes a genuinely new responsibility, establish the need and obtain user approval before introducing another project-wide role suffix.

## Stateful lifecycle boundaries

- Treat lifecycle-heavy components and hooks as sensitive boundaries. These include reader engines, editors, canvases, media players, websocket or session clients, long-running workers, and embedded third-party widgets.
- Opening or closing ordinary UI such as menus, drawers, dialogs, popovers, tabs, or tool panels must not unintentionally initialize, destroy, reconnect, or remount a stateful subsystem.
- Keep initialization dependencies limited to values whose changes genuinely require rebuilding the subsystem, such as document identity, mount target, connection identity, or a setting that requires teardown and reinitialization.
- Preserve callback, array, and object identity when identity participates in initialization or cleanup behavior. Use `useCallback`, `useMemo`, or a latest-value ref according to the required behavior; do not memoize values merely by default.
- Do not add ordinary UI callbacks or aggregate hook-result objects to initialization-effect dependency lists unless their change must rebuild the underlying system.
- UI state changes should update the UI only unless a rebuild is explicitly intended.

After changing lifecycle-sensitive code, verify that ordinary UI interactions do not reset, blank, disconnect, duplicate network requests from, or recreate the underlying subsystem.

## Temporary-state handoffs

- Each layer owns and cleans up the temporary state it creates.
- Before handing data to another layer, pass only the state accepted by the receiving contract. Do not require downstream layers to interpret an upstream interaction's temporary lifecycle state.
- Provide explicit cleanup for every applicable exit: commit, cancel, failed commit, skip, clear, and navigation- or focus-driven teardown.
- Remove temporary renderer marks before creating or restoring durable marks. Search flashes, staged previews, and durable annotation marks must remain distinct.
- Annotation persistence receives confirmed annotation intent. Durable annotation views must not depend on whether an annotation originated from manual selection, search, or import.

## Testing and validation

- Tests protect important runtime behavior, public contracts, regressions, and invariants.
- Add or change a test when failure of the protected behavior would materially affect the product or delivery process.
- Do not add tests merely to lock down prose, copy, repository layout, formatting, generated artifacts, tooling, deployment code, or configuration text.
- Tooling and deployment code generally do not require tests because they are not runtime product code. Test them only when their behavior affects runtime code or an observable runtime contract; focus the test on that runtime effect.
- Prefer the smallest focused test set that strongly protects the behavior. Test count and coverage percentage are not goals by themselves.
- Preserve existing tests by default. Do not change production behavior, weaken a test, or change an expectation merely to make the suite green.
- When an existing test fails, determine what behavior or contract it protects and whether the failure is a regression or an intentional behavior change before editing the code or test.
- Change an existing test only when the intended protected behavior changed or the test no longer validly protects it.

For each changed or removed existing test, the implementation report must explain:

- the behavior, contract, regression, or invariant the test protected;
- what intended behavior changed, if any;
- why the old expectation or test method is no longer correct; and
- how the revised test continues to protect important runtime behavior.

An explanation that only says the change makes the test pass is not sufficient.

Run the smallest focused validation first, followed by broader project checks when the change reaches those boundaries. Report exact commands, results, skipped checks, and relevant pre-existing failures.

## Logging and diagnostics

- Use the project's existing logging system. Do not introduce a parallel logging mechanism.
- Add diagnostic logging at failure-prone boundaries where a user-provided log would materially help identify the cause, such as initialization, external calls, parsing, persistence, lifecycle transitions, cleanup, retries, and error recovery.
- Choose the log level according to purpose. Expected failures and actionable operational problems should be visible at the appropriate enabled level; detailed state used only for diagnosis belongs at a diagnostic or debug level.
- Keep normal interactions quiet. Do not log every click, render, state update, successful request, or routine action.
- Include enough context to identify the affected subsystem, operation, and outcome. Use stable, searchable area labels such as `[SPR reader]`, `[SPR engine]`, or another specific `[SPR ...]` label when that matches the existing logging convention.
- Never log bearer tokens, credentials, secrets, or unnecessarily sensitive user content. Prefer identifiers and bounded metadata over complete payloads.
- Avoid duplicate logging of the same failure at several layers. Log where the failure is understood well enough to add actionable context or where it crosses an ownership boundary.
- Logs intended for ongoing user diagnostics may remain when they use the existing logging system and respect its configured levels. Remove temporary ad hoc instrumentation before completing the task unless the user approves retaining it behind an explicit diagnostic setting.

## Server-owned specification

`docs/specs/reading-session-annotation-profile` is a Windows junction or reference copy of a server-owned specification.

- Do not edit files inside that directory from this repository.
- If the specification must change, stop and request an authorized change in the owning project.
- Client implementation may reference the specification, but runtime TypeScript types belong in `src/schemas/`.
- Do not import runtime application code from `docs/`.

## Final report

Report:

- what repository evidence shaped the implementation;
- what changed and which contracts remain unchanged;
- validation commands and results;
- checks that could not be run;
- relevant pre-existing failures;
- test changes with the justification required above; and
- unresolved issues or boundary changes requiring human approval.
