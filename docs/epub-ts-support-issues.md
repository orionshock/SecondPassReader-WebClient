# epub-ts Support Library Issue Ledger

This document records defects, lifecycle gaps, and API limitations found while integrating
[`@likecoin/epub-ts`](https://github.com/likecoin/epub.ts) with Second Pass Reader. It is intended
to support upstream bug reports and future dependency upgrades. It is not a request to replace
epub-ts or build a second EPUB engine.

Audit baseline:

- Package: `@likecoin/epub-ts`
- Installed version: `0.7.1`
- Audit date: 2026-08-09
- Canonical package integration: `src/features/reader/engine/EpubTsBookEngine.ts`
- Upstream source references below use the TypeScript paths and line numbers embedded in
  `node_modules/@likecoin/epub-ts/dist/epub.js.map`. Line numbers are version-specific.

## Classification

- **Confirmed defect**: reproduced behavior and a concrete problematic implementation were found.
- **Confirmed limitation**: behavior follows the current API/implementation, but the API is not
  sufficient for a reliable reader workflow.
- **Observed; upstream reproduction needed**: runtime evidence exists, but a minimal upstream
  fixture has not yet isolated the library from application behavior.
- **Feature gap**: functionality is not provided by epub-ts; this is not necessarily a defect.

## Summary

| ID | Finding | Classification | Impact | Current client mitigation |
| --- | --- | --- | --- | --- |
| EPUBTS-001 | `Section.search()` misses some matches at the end of a section | Confirmed defect; locally patched | High | `patch-package` drains every residual tail window |
| EPUBTS-002 | `Rendition.display()` can settle before visible range geometry and relocation settle | Confirmed lifecycle limitation | High | Re-anchor staged toolbar after protected relocation |
| EPUBTS-003 | One display/reflow can emit multiple relocations with different CFIs and no operation identity | Confirmed lifecycle limitation | High | Operation-owned relocation protection |
| EPUBTS-004 | Initial resize/reflow can report or redisplay an earlier page-start CFI | Observed; partly addressed in 0.7.1 | High | Bootstrap restore CFI preservation and progress quarantine |
| EPUBTS-005 | `Rendition.getRange()` resolves only against currently visible views | Confirmed API limitation | Medium | Separate visible and book-level CFI probing |
| EPUBTS-006 | Renderer annotations collide at identical CFI plus annotation type | Confirmed design limitation | High | Strict temporary-mark cleanup and same-session exact-CFI deduplication |
| EPUBTS-007 | Location generation failures can leave section cleanup incomplete | Confirmed defect | Medium | Treat location generation as non-fatal |
| EPUBTS-008 | Marks pane installs a non-passive `touchstart` listener | Confirmed defect | Low | None |
| EPUBTS-009 | Search is literal, window-limited, and section-local | Confirmed API limitation | Medium | Query fragments and serialized traversal |
| EPUBTS-010 | No first-class range endpoint editing or visible range-bounds API | Feature gap | Medium | Range editing is intentionally not implemented |
| EPUBTS-011 | Highlight style behavior varies between SVG and DOM render paths | Observed; upstream reproduction needed | Medium | Supply both SVG and CSS color properties |
| EPUBTS-012 | Percentage rendition dimensions cross a number-typed manager boundary | Observed contract mismatch | Medium | Measure the mount and pass pixel dimensions |

## EPUBTS-001: Section Search Misses Final Tail Windows

**Classification:** Confirmed defect

**Local status:** Patched for the browser ESM entry point in
`patches/@likecoin+epub-ts+0.7.1.patch`. The patch is reapplied by the root `postinstall` script and
is guarded by `src/__tests__/epubTsSectionSearchPatch.test.ts`.

**Impact:** Exact visible prose near the end of a chapter can return no result from built-in search.
This affects normal reader search and guided import matching.

### Evidence

We reproduced exact text that was visible and selectable at the end of a chapter but was not found
by `Section.search()`. Manually selecting the text produced a valid range CFI, proving the content
was present in the rendered section. A minimal package-level reproduction using three text nodes,
a three-node window, and a query beginning in the final node returned an empty result on unpatched
0.7.1.

Upstream source: `src/section.ts`, `Section.search()`, approximately lines 180-235 in 0.7.1.

The method maintains a sliding list of at most `maxSeqEle` text nodes. Full windows are searched and
then shifted by one node. At end-of-section it performs only one final search:

```ts
if (nodeList.length > 0) {
  search(nodeList);
}
```

The inner search accepts a match only when it begins in `nodeList[0]`. A query beginning in the
second or later node of the final residual list is therefore never searched with that node as the
window start. The loop also finds only the first occurrence in each candidate window.

Client references:

- `src/features/reader/engine/EpubTsBookSearch.ts`
- `src/features/reader/imports/readerImportSearchQueries.ts`
- `src/features/reader/imports/readerImportSearch.ts`

### Local patch and suggested upstream fix

Drain every residual start position instead of searching the final residual list once:

```ts
while (nodeList.length > 0) {
  search(nodeList);
  nodeList = nodeList.slice(1);
}
```

This is low risk for the current algorithm because the inner search accepts only matches beginning
in the first node of its window. Draining the residual list gives each previously unsearched tail
node exactly one turn as the first node; it does not repeat the starts already searched by full
windows. The local patch intentionally does not change literal matching, the one-occurrence-per-
start behavior, window size, CFI construction, result order, or any Second Pass search logic.

The published package ships generated bundles rather than TypeScript source. Second Pass imports
the package's browser ESM export (`dist/epub.js`), so the local patch changes that entry point only.
The CommonJS, Node, and UMD entry points remain unpatched because this browser application does not
execute them; patching their minified generated output would add disproportionate maintenance risk.
An upstream fix should instead change `src/section.ts`, rebuild every distribution target, and add
the regression coverage below.

A more maintainable implementation would collect searchable text nodes once, then build one window
per possible start node. Search all occurrences that begin in the first node and map offsets back to
DOM ranges. Results should be deduplicated by range CFI.

Upstream regression tests should cover:

1. A match beginning in each residual tail node.
2. A match ending at the final character of the section.
3. Multiple occurrences beginning in one text node.
4. Queries spanning from the penultimate node into the final node.

## EPUBTS-002: Display Promise Settles Before Range Geometry

**Classification:** Confirmed lifecycle limitation

**Impact:** A caller can successfully await `rendition.display(cfi)` and still be unable to resolve
that visible CFI to a DOM `Range`. Toolbars and other geometry-dependent UI fall back or appear in
the wrong place on the first display of a page.

### Evidence

Observed import staging sequence:

1. `rendition.display(cfi)` resolves.
2. The staged highlight is requested.
3. `rendition.getRange(cfi)` returns no measurable visible range.
4. The toolbar uses its stable fallback.
5. One or more `relocated` events arrive afterward.
6. Repeating the same search on the settled page resolves valid geometry immediately.

Upstream source: `src/rendition.ts`, `_display()`, approximately lines 408-486. The display deferred
is resolved in the manager display completion handler before `displayed` is emitted and before
`reportLocation()` schedules its animation-frame location work. Render hooks and content hooks are
also reported through separate lifecycle paths.

Client references:

- `src/features/reader/engine/EpubTsBookEngine.ts`, `displayCfiSafely()` and
  `getVisibleCfiRangeAnchor()`
- `src/features/reader/shell/ReaderStagedSelection.Controller.ts`, `reanchorStagedToolbar()`
- `src/features/reader/shell/StagedSelection.Lifecycle.ts`
- `src/features/reader/shell/ReadingShell.tsx`, relocation handling

### Suggested upstream fix

Do not silently change `display()` semantics without considering compatibility. Add an explicit
settled operation, promise, or event that guarantees:

- the target view is current and visible;
- render/content hooks have completed;
- `getRange(targetCfi)` can resolve when the target is a valid visible range;
- the corresponding location report has completed.

Possible APIs include `displaySettled(target)`, `whenDisplayed(target)`, or a structured display
result carrying a completion promise and operation identifier. A regression test should display a
deep range CFI into a previously unrendered section and resolve that range immediately after the
settled API completes.

## EPUBTS-003: Relocations Lack Operation Ownership

**Classification:** Confirmed lifecycle limitation

**Impact:** Consumers cannot reliably distinguish user navigation from delayed relocation events
caused by display, resize, content reflow, or internal re-anchoring.

### Evidence

A single import display or initial page layout has emitted multiple `relocated` events. The CFIs may
differ substantially even though no user navigation occurred. Examples observed during one logical
operation include page-start CFIs moving from an earlier layout position to the final position.

Upstream source paths involved:

- `src/rendition.ts`, `_display()`, `reportLocation()`, `onContentReflow()`, and `onResized()`
- `src/managers/default/index.ts`, display and resize reporting

Version 0.7.1 includes internal CFI re-anchoring with a 2.5 second window and a 50 ms reflow debounce.
That improves deep-CFI restoration but can legitimately produce additional location reports. The
events do not identify the display/reflow operation that caused them.

Client references:

- `src/features/reader/shell/StagedSelection.Lifecycle.ts`
- `src/features/reader/shell/ReaderRuntime.Controller.ts`
- `src/features/reader/shell/ReaderReflow.Coordinator.ts`

### Suggested upstream fix

Include structured cause and operation metadata with location events, for example:

```ts
type RelocationCause = "display" | "page-navigation" | "viewport-resize" | "content-reflow" | "scroll";

type RelocationContext = {
  operationId?: number;
  cause: RelocationCause;
  settled: boolean;
};
```

The same operation ID should follow display, rendered, resized, and relocated events. This would let
applications preserve temporary state for operation-owned relocations while still canceling it for
explicit navigation. The final event for an operation should be marked settled.

## EPUBTS-004: Initial Reflow Can Roll Back a Restored CFI

**Classification:** Observed; upstream reproduction needed

**Impact:** A saved CFI can display correctly, then initial mount resize/content reflow can move the
viewport to an earlier page-start CFI. If consumers persist every relocation, correct progress can
also be overwritten with the earlier location.

### Evidence

Network traces showed the server returning the correct saved CFI. Shortly after reload, the reader
reported an older `location.start.cfi`. Initial resize code that derived its redisplay target from
`currentLocation().start.cfi` could then make the visual rollback persistent.

Version 0.7.1 contains `_armReanchor()` and `onContentReflow()` in `src/rendition.ts`, which appear to
target this class of deep-CFI clamp. We retain client protection because initial location reports can
still be intermediate and because viewport resize has a separate path.

Client references:

- `src/features/reader/shell/ReaderBootstrapProgressGuard.State.ts`
- `src/features/reader/engine/ReaderReflowTarget.Engine.ts`
- `src/features/reader/engine/EpubTsBookEngine.ts`, `resizeToMount()`
- `src/features/reader/shell/ReaderMountResize.Lifecycle.ts`

### Suggested upstream fix

Make resize/reflow preservation explicit and operation-scoped. A resize API should accept an
authoritative preservation CFI and return only after that anchor is reapplied:

```ts
await rendition.resize(width, height, { preserveCfi, settle: true });
```

Intermediate location events should be identified as non-settled using the operation metadata
suggested in EPUBTS-003. Upstream tests need delayed fonts/images and a deep range near a pagination
boundary.

## EPUBTS-005: getRange Is Visible-View Only

**Classification:** Confirmed API limitation

**Impact:** `Rendition.getRange(cfi)` cannot be used as a general CFI existence probe and may return
`undefined` immediately after a nominally successful display.

### Evidence

Upstream source: `src/rendition.ts`, `getRange()`, approximately lines 1200-1210. It filters
`manager.visible()` by spine position and resolves the CFI only through the matching visible view.
There is no book-level fallback.

Client references:

- `src/features/reader/engine/EpubTsBookEngine.ts`, `probeCfi()`, `displayCfiSafely()`, and
  `getVisibleCfiRangeAnchor()`
- `src/features/reader/engine/visibleCfiRangeAnchor.ts`

The client deliberately separates:

- visible range measurement through `rendition.getRange()`; and
- book-level validation by loading the target `Section` and calling `EpubCFI.toRange(document)`.

### Suggested upstream fix

Keep `getRange()` as the fast visible-view operation, but document that contract clearly and add a
separate async resolver such as `book.resolveRange(cfi, { signal })`. A `whenRangeVisible(cfi)` helper
would also address display timing without forcing callers to inspect private view state.

## EPUBTS-006: Annotation Identity Collides at CFI Plus Type

**Classification:** Confirmed design limitation

**Impact:** Search flashes, staged previews, and durable annotations at the same CFI can overwrite or
detach each other. Two app annotations at an identical CFI cannot have independent renderer identity.

### Evidence

Upstream source: `src/annotations.ts`, `Annotations.add()`, approximately lines 53-73:

```ts
const hash = encodeURI(cfiRange + type);
this._annotations[hash] = annotation;
```

Second Pass already passes its client annotation ID as data:

```ts
rendition.annotations.highlight(cfiRange, { id: clientId }, callback, className, styles);
```

epub-ts does not use that value as annotation or renderer identity. It remains annotation data and
is emitted as event metadata when the mark is clicked. Identity is instead derived independently at
two library layers:

- The rendition annotation store uses `encodeURI(cfiRange + type)`.
- The iframe view stores highlights as `this.highlights[cfiRange]`.

Upstream source: `src/managers/views/iframe.ts`, `IframeView.highlight()` and
`IframeView.unhighlight()`, approximately lines 748-785 and 913-925 in 0.7.1. Adding a second
highlight at the same CFI replaces the view registry entry regardless of its caller-supplied data.

Removal and detachment also address the mark by CFI and type rather than caller ID:

```ts
rendition.annotations.remove(cfiRange, "highlight");
view.unhighlight(cfiRange);
```

The returned `Annotation` object does not provide an update escape hatch. `Annotation.update()`
replaces `annotation.data` only; it does not update styles or repaint the visible mark. Its
`detach()` method ultimately calls `view.unhighlight(cfiRange)`. Consequently, a caller-supplied ID
is metadata/event data only, not an addressable renderer-mark identity.

When a durable highlight and staged preview use the same exact CFI, the newer mark overwrites the
rendition/view identity. The older SVG or DOM overlay can remain detached from the registry but
visible in the marks pane. A later CFI-based removal can find only the currently registered mark.
This produces visibly stacked colors even when Second Pass annotation state contains only one
durable highlight.

Client references:

- `src/features/reader/engine/highlightMarks.ts`
- `src/features/reader/session/annotations/CurrentSessionAnnotation.Actions.ts`

Current Second Pass rules do not ask epub-ts to keep two `highlight` marks alive at the same exact
CFI. A staged preview temporarily replaces the durable renderer mark at that CFI. On commit or
cancel, durable marks are restored from application annotation state. Exact same-session CFI
commits update the existing application annotation rather than creating a duplicate. How current-
and previous-session annotations should interact remains an application policy concern; CFI must
remain the spatial anchor rather than being treated as annotation object identity.

### Suggested upstream fix

Introduce a first-class annotation identity contract:

```ts
const handle = rendition.annotations.highlight({ id, cfiRange, data, styles });
rendition.annotations.removeById(id);
rendition.annotations.updateById(id, { styles, data });
```

Store annotation records and rendered view highlights by ID. Keep CFI separately on each annotation
for range resolution, section indexing, and CFI-based lookup. The internal section index should map
to annotation IDs rather than CFI/type hashes. CFI/type removal can remain as a convenience that
removes all matching annotations, but it should not be the only mutation identity.

Upstream regression tests should cover:

1. Two highlights with different IDs at the exact same CFI can coexist.
2. Updating one ID changes only that highlight's styles and data.
3. Removing one ID leaves the other exact-CFI highlight attached and addressable.

## EPUBTS-007: Location Generation Does Not Guarantee Section Cleanup

**Classification:** Confirmed defect

**Impact:** A section can remain loaded when location parsing throws, and generation rejects as one
large queue operation. Percentage metadata then becomes unavailable and mutable section state may
remain live longer than expected.

### Evidence

Upstream source: `src/locations.ts`, `Locations.process()`, approximately lines 109-123. The method
loads a section, parses it, concatenates locations, and only then calls `section.unload()`. There is no
`try/finally`, so a load/parse error skips unload. Similar ordering exists in word-location processing.

Client reference: `src/features/reader/engine/EpubTsBookEngine.ts`, `startLocationsGeneration()`.
Generation is treated as non-fatal; the reader continues without book-level percentage metadata.

### Suggested upstream fix

Use `try/finally` around every temporary section load, preserve whether the section was already
loaded by another owner, and support cancellation. Decide whether one malformed section should fail
all generation or produce partial locations plus structured per-section errors.

## EPUBTS-008: Non-Passive touchstart Listener

**Classification:** Confirmed defect

**Impact:** Chrome reports a scroll-blocking listener whenever highlights are painted. This can hurt
touch scrolling responsiveness.

### Evidence

Upstream source: `src/marks-pane/index.ts`, approximately lines 48-50. `touchstart` is registered in
the same loop as mouse events with the third argument `false`, producing a non-passive listener.

The warning is visible from `highlightMarks.ts` call stacks when epub-ts attaches a highlight.

### Suggested upstream fix

Register `touchstart` with `{ passive: true }` if the handler never calls `preventDefault()`. If
preventing default is conditionally required, split mouse/touch registration and document that path.
Pointer events may simplify this code, but are not required for the small fix.

## EPUBTS-009: Search Is Literal, Window-Limited, and Section-Local

**Classification:** Confirmed API limitation

**Impact:** Visible prose can fail to match when punctuation, whitespace, or DOM boundaries differ.
Search cannot cross spine sections and can span only the configured number of sequential text nodes.

### Evidence

`Section.search()` lowercases text but otherwise uses literal `indexOf()`. It concatenates up to
`maxSeqEle` text nodes without a semantic whitespace model. It does not expose normalized offsets,
match quality, or a way to search across section boundaries.

Client references:

- `src/features/reader/engine/EpubTsBookSearch.ts`
- `src/features/reader/imports/readerImportSearchQueries.ts`
- `src/features/reader/engine/EpubTsImportRangeRepair.Engine.ts`

The client keeps full quote search first, then uses bounded punctuation-light fragments. It does not
attempt to replace epub-ts with a second full EPUB search engine.

### Suggested upstream improvement

Expose an optional normalization/search policy while retaining literal search as the default. A
useful result should include the exact matched text, source node/offset mapping, and section identity.
Cross-section search can remain out of scope, but the boundary should be explicit.

## EPUBTS-010: No Range Endpoint Editing or Bounds API

**Classification:** Feature gap

**Impact:** The application cannot safely offer draggable highlight endpoints or reliably measure a
range without reaching into the rendered iframe and CFI internals.

### Evidence

The public APIs provide CFI conversion and visible `Range` lookup, but no stable abstraction for:

- measuring all visible range rectangles across reflow;
- adjusting one range endpoint and obtaining a new CFI;
- preserving endpoint affinity through text-node normalization;
- correlating an edited range with rendered annotation geometry.

Client references:

- `src/features/reader/engine/visibleCfiRangeAnchor.ts`
- `src/features/reader/domain/types.ts`, `ReaderSelectionAnchor`
- `docs/known-limits.md`, annotation range adjustment

### Suggested upstream improvement

Add renderer-owned range measurement and endpoint operations that return stable, documented data.
Until that exists, Second Pass intentionally does not implement drag handles or CFI surgery above
the engine boundary.

## EPUBTS-011: Highlight Styling Varies by Render Path

**Classification:** Observed; upstream reproduction needed

**Impact:** Some configured colors, especially lighter pinks, can appear faint, inconsistent, or
temporarily absent depending on view/mark rendering.

### Evidence

Runtime behavior indicates some highlights use SVG overlay paint (`fill`) while other paths respond
to DOM background properties. A style object that supplies only one representation is not reliable
across observed views.

Client reference: `src/features/reader/engine/highlightMarks.ts`, `toHighlightAttributes()`. The
client supplies `fill`, `fill-opacity`, `mix-blend-mode`, `background-color`, and `background`.

### Suggested upstream improvement

Define one annotation color/opacity contract and normalize it inside epub-ts for SVG and DOM-backed
views. Add visual browser fixtures for every supported manager/flow. This item needs a minimal EPUB
and screenshot comparison before filing as a definite defect.

## EPUBTS-012: Rendition Dimension Contract Is Ambiguous

**Classification:** Observed contract mismatch

**Impact:** Percentage width/height settings have produced invalid or unstable pagination
measurements, making next/previous behave more like section jumps in affected layouts.

### Evidence

`RenditionOptions` accepts `number | string`, but `Rendition.attachTo()` passes the configured values
through a `SizeObject` path typed as numeric before the stage measures the container. This makes the
supported meaning of values such as `"100%"` unclear across manager and stage boundaries.

Client reference: `src/features/reader/engine/EpubTsBookEngine.ts`, `waitForMountSize()`. The client
waits for a non-zero mount and supplies integer pixel dimensions.

### Suggested upstream improvement

Either support CSS dimension strings end-to-end with tests or narrow the public rendition contract
to pixels. Prefer measuring the attached container internally when width/height are omitted. Tests
should cover percentage-sized parents, initially hidden containers, split-screen resize, and paged
next/previous behavior.

## Related Concurrency Constraint

`Section.load()` stores mutable `document`/`contents` state and `Section.unload()` clears it. Concurrent
full-book consumers can therefore interfere when one owner unloads a section still being used by
another owner. Second Pass serializes EPUB search traversal in
`src/features/reader/shell/ReaderSearch.Controller.ts`.

An upstream improvement would document section concurrency explicitly or provide reference-counted
leases for temporary section access. We have not isolated this as an independent epub-ts defect, so
it does not have a separate issue ID yet.

## Findings That Are Not epub-ts Defects

The following symptoms were investigated but should not be filed upstream as library bugs:

- `about:srcdoc` script-block warnings are expected while `allowScriptedContent` is false. Keeping
  untrusted EPUB scripts disabled is intentional.
- Empty quote suffix at the end of a chapter is expected because no following text exists.
- Browser extension scripts and third-party metric requests observed inside pages were caused by a
  rogue browser extension, not the EPUB renderer.
- Stale toolbar coordinates after the import drawer changed width were a client re-anchor bug.
- HTML entity text in Glasp CSV was an import-adapter bug, not EPUB parsing behavior.
- Cross-paragraph imported quotes may exceed a renderer search block/window. Fragment generation is
  an application matching policy; it does not change canonical EPUB content.

## Upstream Report Checklist

Before filing an issue against epub-ts:

1. Reproduce against the currently installed version and the latest upstream revision separately.
2. Use a minimal legal EPUB fixture that can be attached publicly.
3. Record rendition options, manager, flow, spread, viewport size, and browser version.
4. Include the target CFI and event order, but remove copyrighted quote text unless necessary.
5. State whether the issue reproduces without Second Pass import or annotation code.
6. Link the relevant item in this ledger and update its status after the upstream response.
7. Do not remove a client mitigation until the upgraded library passes its regression and browser QA.
